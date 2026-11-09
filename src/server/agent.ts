/**
 * The agent's side of the chat: waiting reads, the prompts the agent reads, replies, and the
 * agent's state as the reader sees it. The agent's cursor is a number in the shared sequence:
 * reader messages and errors after it are new. The cursor travels in the snippets the server
 * writes, so the server keeps no record of what an agent has seen.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileSource } from "../files.ts";
import { createLogger } from "../logger.ts";
import type {
  AgentDiagnostics,
  AgentPrompt,
  ChatState,
  Diagnostic,
  ReplyRefusal,
  ReportedDiagnostic,
} from "../protocol.ts";
import { type ChatStore, placeContext } from "./chat.ts";
import { HttpError, type Reply, type Router } from "./http.ts";
import {
  clearedReply,
  diagnosticsSection,
  errorsPrompt,
  idlePrompt,
  messagesPrompt,
  newErrorsReply,
  nothingToAnswer,
  rejectedReply,
  startPrompt,
  takenOver,
} from "./prompt.ts";
import type { Sequence } from "./sequence.ts";

const log = createLogger("agent");

/** The longest a prompt read waits, in seconds. Requests stay short; the library repeats them. */
const maxWait = 25;
/** How long an agent counts as listening after a read without news, or a reply, in milliseconds. */
const listeningGrace = 10_000;
/** How long an agent counts as working on messages it read but has not replied to. */
const workingLimit = 10 * 60_000;
/**
 * How long an error must stay before it is numbered and can wake the agent. Saving a file
 * half-written, or an edit across two files, shows errors that are gone a moment later.
 */
const settleTime = 2000;
/** The longest a reply waits for the checks of recent edits before it is judged. */
const replySettleLimit = 8000;

/** What identifies an error across renders, line shifts, and rewording. */
export function errorKey(d: Diagnostic): string {
  return [d.code, d.source ?? "", d.target ?? "", d.subject ?? d.message].join("|");
}

interface Waiter {
  after: number;
  listener: string;
  /** Answer the read. `gone`: the agent's process ended while waiting. */
  done: (reply: Reply, gone?: boolean) => void;
}

/** A refused reply: the agent's text, and the diagnostics behind it. */
function refused(error: string, diagnostics: Diagnostic[]): Reply {
  const body: ReplyRefusal = { error, diagnostics };
  return { status: 422, body };
}

export interface AgentOptions {
  root: string;
  /** The content folder, relative to the project folder. */
  content: string;
  /** The source folders `document.json` names, relative to the content folder. */
  folders: () => Record<string, string>;
  chat: ChatStore;
  sequence: Sequence;
  diagnostics: {
    list: () => ReportedDiagnostic[];
    unchecked: () => string[];
    settled: () => boolean;
  };
  /** The agent's state changed: listening, working, or away. */
  changed: () => void;
}

export class AgentChannel {
  private readonly options: AgentOptions;
  private readonly guide: string;
  private waiters = new Set<Waiter>();
  private listener: string | undefined;
  private superseded = new Set<string>();
  private lastSeen = 0;
  /** The newest reader message handed to an agent, and when. */
  private delivered = 0;
  private deliveredAt = 0;
  /** When each reader message was first handed to an agent, for the reply's `readAt`. */
  private readAt = new Map<number, string>();
  /** Open errors with their number, by `errorKey`. */
  private numbered = new Map<string, { seq: number; source: string }>();
  /** Errors not numbered yet, by `errorKey`, with when they appeared. */
  private appearing = new Map<string, number>();
  private settleTimer: NodeJS.Timeout | undefined;
  private published: ChatState["agent"] = "away";
  private agentTimer: NodeJS.Timeout | undefined;

  constructor(options: AgentOptions) {
    this.options = options;
    // Absolute, so an agent working in another folder can open it. A project made from the
    // starter carries its own copy; this repository uses the starter's.
    const guide = "docs/guide.md";
    const own = path.join(options.root, guide);
    this.guide = existsSync(own)
      ? own
      : fileURLToPath(new URL(`../../starter/${guide}`, import.meta.url));
  }

  /** The text a person gives a new agent session: wait after the last answered message. */
  get start(): string {
    const { chat } = this.options;
    const { content, folders } = this.options;
    const where = Object.fromEntries(
      Object.keys(folders()).map((name) => [
        name,
        fileSource(content, folders(), { folder: name, path: "." }) ?? "",
      ]),
    );
    return startPrompt(
      Math.max(chat.repliedTo(), chat.cleared),
      this.guide,
      where,
      this.options.root,
    );
  }

  /** Connected; not connected but read messages it has not answered; or away. */
  get status(): ChatState["agent"] {
    const now = Date.now();
    if (
      [...this.waiters].some((waiter) => waiter.listener === this.listener) ||
      now - this.lastSeen < listeningGrace
    )
      return "listening";
    const { chat } = this.options;
    const reading = chat.readers(chat.repliedTo()).some((m) => m.seq <= this.delivered);
    if (reading && now - this.deliveredAt < workingLimit) return "read";
    return "away";
  }

  /**
   * A prompt read ended. After a read with no news the agent reads again at once, so the grace
   * bridges the gap. A read that handed over messages or errors starts the agent's work, and a
   * read closed before its answer means the agent stopped: neither is followed by another read.
   */
  private readEnded(body: unknown, gone: boolean) {
    const prompt = body as Partial<AgentPrompt> | undefined;
    const news = Boolean(prompt?.messages?.length || prompt?.newErrors?.length);
    this.lastSeen = gone || news ? 0 : Date.now();
    // An agent that was waiting was not working on anything either.
    if (gone) this.deliveredAt = 0;
    this.agentChanged();
  }

  /** Tell the reader when the agent's state changes, including when a period runs out. */
  private agentChanged() {
    clearTimeout(this.agentTimer);
    if (this.status !== this.published) {
      log.info(`agent ${this.status}`);
      this.published = this.status;
      this.options.changed();
    }
    const now = Date.now();
    const next = [this.lastSeen + listeningGrace, this.deliveredAt + workingLimit]
      .filter((at) => at > now)
      .sort((a, b) => a - b)[0];
    if (next) this.agentTimer = setTimeout(() => this.agentChanged(), next - now + 10);
  }

  private errors(): ReportedDiagnostic[] {
    return this.options.diagnostics.list().filter((d) => d.severity === "error");
  }

  /**
   * Number the errors that have stayed for the settle time, and forget the fixed ones: gone,
   * and their page checked again. A page not checked since it changed keeps its errors'
   * numbers, so a re-render does not make them new. Newly numbered errors end waiting reads.
   */
  diagnosticsChanged() {
    const now = Date.now();
    const errors = new Map(this.errors().map((d) => [errorKey(d), d]));
    const unchecked = new Set(this.options.diagnostics.unchecked());
    for (const [key, { source }] of this.numbered)
      if (!errors.has(key) && !unchecked.has(source)) this.numbered.delete(key);
    for (const key of this.appearing.keys()) if (!errors.has(key)) this.appearing.delete(key);
    let added = false;
    let soonest = Number.POSITIVE_INFINITY;
    for (const [key, error] of errors) {
      if (this.numbered.has(key)) continue;
      const since = this.appearing.get(key) ?? now;
      if (now - since >= settleTime) {
        this.appearing.delete(key);
        this.numbered.set(key, { seq: this.options.sequence.next(), source: error.source ?? "" });
        added = true;
      } else {
        this.appearing.set(key, since);
        soonest = Math.min(soonest, since + settleTime);
      }
    }
    clearTimeout(this.settleTimer);
    if (Number.isFinite(soonest))
      this.settleTimer = setTimeout(() => this.diagnosticsChanged(), soonest - now + 10);
    if (added) this.wake();
  }

  /** The chat changed: answer waiting reads that now have news, and update the state. */
  chatChanged() {
    this.wake();
    this.agentChanged();
  }

  /** Open errors numbered after `after`, with their numbers. */
  private errorsAfter(after: number): Array<{ seq: number; error: ReportedDiagnostic }> {
    return this.errors()
      .map((error) => ({ seq: this.numbered.get(errorKey(error))?.seq ?? 0, error }))
      .filter(({ seq }) => seq > after);
  }

  private hasNews(after: number): boolean {
    const { chat } = this.options;
    return (
      chat.readers(after).length > 0 || chat.cleared > after || this.errorsAfter(after).length > 0
    );
  }

  private wake() {
    for (const waiter of [...this.waiters])
      if (this.hasNews(waiter.after)) waiter.done({ status: 200, body: this.prompt(waiter.after) });
  }

  /** What is new after `after`, and the prompt for it, which ends with the next snippet. */
  private prompt(after: number): AgentPrompt {
    const { chat, root, diagnostics } = this.options;
    const messages = chat.readers(after);
    const fresh = this.errorsAfter(after);
    const cleared = chat.cleared > after ? chat.cleared : undefined;
    const now = new Date().toISOString();
    for (const message of messages)
      if (!this.readAt.has(message.seq)) this.readAt.set(message.seq, now);
    const newest = messages.at(-1)?.seq ?? 0;
    if (newest > this.delivered) {
      this.delivered = newest;
      this.deliveredAt = Date.now();
    }
    // The next cursor: past everything this prompt hands over.
    const cursor = Math.max(after, chat.cleared, newest, ...fresh.map(({ seq }) => seq));
    const isNew = new Set(fresh.map(({ error }) => errorKey(error)));
    const section = () =>
      diagnosticsSection(diagnostics.list(), (d) => isNew.has(errorKey(d)), this.uncheckedPages());
    const prompt = messages.length
      ? messagesPrompt(
          messages,
          (item) => placeContext(root, item),
          section(),
          this.guide,
          cursor,
          cleared,
        )
      : fresh.length
        ? errorsPrompt(section(), cursor, chat.readers(chat.cleared).length > 0, cleared)
        : idlePrompt(cursor, cleared);
    return {
      messages,
      ...(cleared ? { cleared } : {}),
      newErrors: fresh.map(({ error }) => error),
      prompt,
    };
  }

  /** Wait until the checks of recent edits are done and new errors have a number. */
  private async settle() {
    const until = Date.now() + replySettleLimit;
    while (Date.now() < until && (!this.options.diagnostics.settled() || this.appearing.size > 0))
      await new Promise((resolve) => setTimeout(resolve, 200));
  }

  /** The newest listener wins: a new one takes over, and the old one is told to stop. */
  private claim(listener: string) {
    if (this.superseded.has(listener)) throw new HttpError(409, takenOver);
    if (listener === this.listener) return;
    log.info(`listener ${listener} connected`);
    if (this.listener) {
      log.info(`listener ${this.listener} taken over`);
      this.superseded.add(this.listener);
      for (const waiter of this.waiters)
        if (waiter.listener === this.listener)
          waiter.done({ status: 409, body: { error: takenOver } });
    }
    this.listener = listener;
  }

  private waitForNews(
    after: number,
    timeout: number,
    listener: string,
    onClose: (f: () => void) => void,
  ) {
    return new Promise<Reply>((resolve) => {
      const waiter: Waiter = {
        after,
        listener,
        done: (reply, gone = false) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          this.readEnded(reply.body, gone);
          resolve(reply);
        },
      };
      const timer = setTimeout(
        () => waiter.done({ status: 200, body: this.prompt(after) }),
        timeout * 1000,
      );
      this.waiters.add(waiter);
      this.agentChanged();
      // Closed before an answer: the agent was stopped or killed, not between two reads.
      onClose(() => {
        if (this.waiters.has(waiter)) waiter.done({ status: 499 }, true);
      });
    });
  }

  /**
   * Store a reply. `to` is the agent's cursor: the reply answers every reader message up to
   * it. Messages that arrived while the agent wrote stay unanswered. Errors numbered after
   * the cursor appeared while the agent worked, so the reply waits for the checks of its
   * edits and is refused while such errors remain: the reader should not read "done" on a
   * broken page.
   */
  private async reply(to: number, mdx: string): Promise<Reply> {
    const { chat, sequence } = this.options;
    if (chat.cleared && to <= chat.cleared) throw new HttpError(409, clearedReply(chat.cleared));
    const answered = chat
      .readers(chat.cleared)
      .filter((m) => m.seq <= to)
      .at(-1);
    if (to > sequence.current || !answered)
      throw new HttpError(409, nothingToAnswer(to, Math.min(to, sequence.current)));
    await this.settle();
    const fresh = this.errorsAfter(to);
    if (fresh.length) {
      // The agent may reply past these errors only when no unread reader message is skipped.
      const past = Math.max(...fresh.map(({ seq }) => seq));
      const skips = chat.readers(to).some((m) => m.seq <= past);
      log.info(`reply with cursor ${to} refused: ${fresh.length} new errors`);
      const errors = fresh.map(({ error }) => error);
      return refused(newErrorsReply(to, errors, skips ? undefined : past), errors);
    }
    const result = await chat.addReply(answered.seq, mdx, this.readAt.get(answered.seq));
    if ("errors" in result) return refused(rejectedReply(to, result.errors), result.errors);
    this.lastSeen = Date.now();
    this.agentChanged();
    return { status: 201, body: { seq: result.message.seq } };
  }

  /**
   * The document's diagnostics once the checks of recent edits are done, for an agent that
   * edited pages and wants to know before it replies. It reads only: it claims no listener
   * and moves no cursor, so it can run beside a waiting read.
   */
  private async check(): Promise<AgentDiagnostics> {
    await this.settle();
    const { diagnostics } = this.options;
    const listed = diagnostics.list();
    const unchecked = diagnostics.unchecked();
    const prompt = diagnosticsSection(listed, () => false, this.uncheckedPages());
    return { diagnostics: listed, unchecked, prompt };
  }

  /** The pages not checked since they changed, as addresses: "content/a/b.mdx" → "/a/b". */
  private uncheckedPages(): string[] {
    const { content, diagnostics } = this.options;
    return diagnostics
      .unchecked()
      .map((source) => `/${source.slice(content.length + 1).replace(/\.mdx$/, "")}`);
  }

  mount(router: Router) {
    const integer = (value: string | null, name: string) => {
      const number = Number(value);
      if (value === null || !Number.isInteger(number) || number < 0)
        throw new HttpError(400, `${name} must be a whole number.`);
      return number;
    };
    router
      .on("GET", "/agent/prompt", ({ query, res }) => {
        const after = integer(query.get("after"), "after");
        const timeout = Math.min(maxWait, integer(query.get("timeout") ?? "0", "timeout"));
        const listener = query.get("listener") || randomUUID();
        this.claim(listener);
        if (timeout === 0 || this.hasNews(after)) {
          const body = this.prompt(after);
          this.readEnded(body, false);
          return { status: 200, body };
        }
        // The response closes early when the agent's process ends; stop waiting for it then.
        return this.waitForNews(after, timeout, listener, (close) => res.on("close", close));
      })
      .on("POST", "/agent/reply", ({ query, text }) =>
        this.reply(integer(query.get("to"), "to"), text),
      )
      .on("GET", "/agent/diagnostics", async () => ({ status: 200, body: await this.check() }));
  }

  close() {
    clearTimeout(this.agentTimer);
    clearTimeout(this.settleTimer);
    for (const waiter of [...this.waiters]) waiter.done({ status: 503 });
  }
}
