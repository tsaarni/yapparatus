/**
 * The chat resource: reads of the chat, which may wait; messages from the reader and the
 * agent; clearing; and the agent's state as the reader sees it. The log itself is in
 * `chat.ts`. An agent's read holds what the agent has to do: the reader messages not
 * answered yet, and the errors it has not been given. The server remembers which reader
 * message it gave the agent last, and the reply answers that one.
 */
import { existsSync } from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileSource } from "../files.ts";
import { createLogger } from "../logger.ts";
import {
  type AgentState,
  agentHeader,
  type Chat,
  type Diagnostic,
  type Message,
  type ReplyRefusal,
} from "../protocol.ts";
import type { ChatStore } from "./chat.ts";
import { type DiagnosticStore, diagnosticKey } from "./diagnostics.ts";
import { HttpError, type Reply, type Router } from "./http.ts";
import {
  diagnosticsSection,
  errorsPrompt,
  idlePrompt,
  messagesPrompt,
  nothingToAnswer,
  rejectedReply,
  startPrompt,
  takenOver,
} from "./prompt.ts";

const log = createLogger("chat");

/** The longest a read waits, in seconds. Requests stay short; the library repeats them. */
const maxWait = 25;
/** How long an agent counts as waiting after an empty read, or a reply, in milliseconds. */
const waitingGrace = 10_000;
/** How long an agent counts as working on messages it read but has not replied to. */
const workingLimit = 10 * 60_000;

/** What a read of the chat asks for. */
interface Query {
  author?: Message["author"];
  diagnostics: boolean;
}

interface Waiter {
  query: Query;
  agent: string;
  /** Answer the read. `gone`: the agent's process ended while waiting. */
  done: (reply: Reply, gone?: boolean) => void;
}

/** A refused reply: the agent's text, and the diagnostics behind it. */
function refused(error: string, diagnostics: Diagnostic[]): Reply {
  const body: ReplyRefusal = { error, diagnostics };
  return { status: 422, body };
}

function wholeNumber(value: string | null, name: string): number | undefined {
  if (value === null) return undefined;
  const number = Number(value);
  if (!value || !Number.isInteger(number) || number < 0)
    throw new HttpError(400, `${name} must be a whole number.`);
  return number;
}

export interface ChatResourceOptions {
  root: string;
  /** The content folder, relative to the project folder. */
  content: string;
  /** The source folders `document.json` names, relative to the content folder. */
  folders: () => Record<string, string>;
  chat: ChatStore;
  diagnostics: DiagnosticStore;
  /** The agent's state changed: waiting, working, or away. */
  changed: () => void;
}

export class ChatResource {
  private readonly options: ChatResourceOptions;
  private readonly guide: string;
  private waiters = new Set<Waiter>();
  private agent: string | undefined;
  private superseded = new Set<string>();
  private lastSeen = 0;
  /** The newest reader message given to an agent, which the next reply answers, and when. */
  private handed: number | undefined;
  private handedAt = 0;
  /** When each reader message was first handed to an agent, for the reply's `readAt`. */
  private readAt = new Map<number, string>();
  private published: AgentState = "away";
  private agentTimer: NodeJS.Timeout | undefined;

  constructor(options: ChatResourceOptions) {
    this.options = options;
    // Absolute, so an agent working in another folder can open it. A project made from the
    // starter carries its own copy; this repository uses the starter's.
    const guide = "docs/guide.md";
    const own = path.join(options.root, guide);
    this.guide = existsSync(own)
      ? own
      : fileURLToPath(new URL(`../../starter/${guide}`, import.meta.url));
  }

  /** The text a person gives a new agent session. */
  private get start(): string {
    const { content, folders, root } = this.options;
    const where = Object.fromEntries(
      Object.keys(folders()).map((name) => [
        name,
        fileSource(content, folders(), { folder: name, path: "." }) ?? "",
      ]),
    );
    return startPrompt(this.guide, where, root);
  }

  /** Connected; not connected but read messages it has not answered; or away. */
  get state(): AgentState {
    const now = Date.now();
    if (
      [...this.waiters].some((waiter) => waiter.agent === this.agent) ||
      now - this.lastSeen < waitingGrace
    )
      return "waiting";
    const { chat } = this.options;
    const reading = chat.readers(chat.repliedTo()).some((m) => m.seq <= (this.handed ?? 0));
    if (reading && now - this.handedAt < workingLimit) return "working";
    return "away";
  }

  /** The whole chat, as the browser reads it and as it is sent when it changes. */
  whole(): Chat {
    return this.read({ diagnostics: false });
  }

  /**
   * One read of the chat. Without an agent: every message, every diagnostic if included, and
   * the start prompt. For an agent: the reader messages not answered yet, the errors it has
   * not been given, and the prompt for them, which ends with the next snippet. What a
   * non-empty read gives the agent is remembered.
   */
  private read(query: Query, agent?: string): Chat {
    const { chat, diagnostics } = this.options;
    const base = { repliedTo: chat.repliedTo(), agent: this.state };
    if (!agent)
      return {
        ...base,
        messages: chat.messages.filter((m) => !query.author || m.author === query.author),
        ...(query.diagnostics ? { diagnostics: diagnostics.list() } : {}),
        prompt: this.start,
      };
    const readers = query.author === "agent" ? [] : chat.readers(chat.repliedTo());
    const fresh = query.diagnostics ? diagnostics.newErrors() : [];
    if (readers.length) this.handedOver(readers);
    diagnostics.give(fresh);
    return {
      ...base,
      messages: readers,
      ...(query.diagnostics ? { diagnostics: fresh } : {}),
      prompt: this.prompt(readers, fresh),
    };
  }

  /** The prompt for reader messages and new errors, ending with the next snippet. */
  private prompt(readers: ReturnType<ChatStore["readers"]>, fresh: Diagnostic[]): string {
    const { diagnostics } = this.options;
    const isNew = new Set(fresh.map(diagnosticKey));
    const section = () =>
      diagnosticsSection(
        diagnostics.list(),
        (d) => isNew.has(diagnosticKey(d)),
        diagnostics.unchecked(),
      );
    if (readers.length) return messagesPrompt(readers, section(), this.guide);
    // New errors and no new message: the agent tells the reader, if there is one, what it fixed.
    if (fresh.length) return errorsPrompt(section(), this.handed !== undefined);
    return idlePrompt();
  }

  /** Reader messages reached an agent: remember the newest, and when, for `readAt` and the working state. */
  private handedOver(readers: ReturnType<ChatStore["readers"]>) {
    const now = new Date().toISOString();
    for (const message of readers)
      if (!this.readAt.has(message.seq)) this.readAt.set(message.seq, now);
    const newest = readers.at(-1)?.seq ?? 0;
    if (newest !== this.handed) {
      this.handed = newest;
      this.handedAt = Date.now();
    }
  }

  /** A read with no messages and no errors: the agent waits for more. */
  private isEmpty(read: Chat): boolean {
    return !read.messages.length && !read.diagnostics?.length;
  }

  /**
   * An agent's read ended. After an empty read the agent reads again at once, so the
   * grace bridges the gap. A read that handed over messages or errors starts the agent's work,
   * and a read closed before its answer means the agent stopped: neither is followed by
   * another read.
   */
  private readEnded(body: unknown, gone: boolean) {
    const read = body as Partial<Chat> | undefined;
    const handedOver = Boolean(read?.messages?.length || read?.diagnostics?.length);
    this.lastSeen = gone || handedOver ? 0 : Date.now();
    // An agent that was waiting was not working on anything either.
    if (gone) this.handedAt = 0;
    this.agentChanged();
  }

  /** Tell the reader when the agent's state changes, including when a period runs out. */
  private agentChanged() {
    clearTimeout(this.agentTimer);
    if (this.state !== this.published) {
      log.info(`agent ${this.state}`);
      this.published = this.state;
      this.options.changed();
    }
    const now = Date.now();
    const next = [this.lastSeen + waitingGrace, this.handedAt + workingLimit]
      .filter((at) => at > now)
      .sort((a, b) => a - b)[0];
    if (next) this.agentTimer = setTimeout(() => this.agentChanged(), next - now + 10);
  }

  /** The chat or the diagnostics changed: answer the waiting reads that are no longer empty. */
  changed() {
    for (const waiter of [...this.waiters]) {
      const read = this.read(waiter.query, waiter.agent);
      if (!this.isEmpty(read)) waiter.done({ status: 200, body: read });
    }
    this.agentChanged();
  }

  /** The newest agent wins: a new one takes over, and the old one is told to stop. */
  private claim(agent: string) {
    if (this.superseded.has(agent)) throw new HttpError(409, takenOver);
    if (agent === this.agent) return;
    log.info(`agent ${agent} connected`);
    if (this.agent) {
      log.info(`agent ${this.agent} taken over`);
      this.superseded.add(this.agent);
      for (const waiter of this.waiters)
        if (waiter.agent === this.agent) waiter.done({ status: 409, body: { error: takenOver } });
    }
    this.agent = agent;
  }

  private waitUntilNotEmpty(waiter: Omit<Waiter, "done">, seconds: number, res: ServerResponse) {
    return new Promise<Reply>((resolve) => {
      const open: Waiter = {
        ...waiter,
        done: (reply, gone = false) => {
          clearTimeout(timer);
          this.waiters.delete(open);
          this.readEnded(reply.body, gone);
          resolve(reply);
        },
      };
      const timer = setTimeout(
        () => open.done({ status: 200, body: this.read(open.query, open.agent) }),
        seconds * 1000,
      );
      this.waiters.add(open);
      this.agentChanged();
      // Closed before an answer: the agent was stopped or killed, not between two reads.
      res.on("close", () => {
        if (this.waiters.has(open)) open.done({ status: 499 }, true);
      });
    });
  }

  /** GET /chat: the parameters are checked, an agent's read claims the chat, and it may wait. */
  private get(
    params: URLSearchParams,
    agent: string | undefined,
    res: ServerResponse,
  ): Reply | Promise<Reply> {
    const author = params.get("author");
    if (author !== null && author !== "reader" && author !== "agent")
      throw new HttpError(400, "author must be reader or agent.");
    const include = params.get("include");
    if (include !== null && include !== "diagnostics")
      throw new HttpError(400, "include may only name diagnostics.");
    const wait = Math.min(maxWait, wholeNumber(params.get("wait"), "wait") ?? 0);
    if (wait && !agent) throw new HttpError(400, `wait needs the ${agentHeader} header.`);
    const query: Query = {
      ...(author ? { author } : {}),
      diagnostics: include === "diagnostics",
    };
    if (!agent) return { status: 200, body: this.read(query) };
    this.claim(agent);
    const read = this.read(query, agent);
    if (wait === 0 || !this.isEmpty(read)) {
      this.readEnded(read, false);
      return { status: 200, body: read };
    }
    // The response closes early when the agent's process ends; stop waiting for it then.
    return this.waitUntilNotEmpty({ query, agent }, wait, res);
  }

  /** POST /chat: a reader message, or an agent's reply. */
  private post(body: Record<string, unknown>): Reply | Promise<Reply> {
    if (body.author === "reader") {
      const message = this.options.chat.addReader(body);
      return { status: 201, body: { seq: message.seq } };
    }
    if (body.author !== "agent") throw new HttpError(400, "author must be reader or agent.");
    if (typeof body.mdx !== "string") throw new HttpError(400, "A reply needs mdx.");
    return this.reply(body.mdx);
  }

  /**
   * Store a reply to the newest reader message given to the agent, and those before it.
   * Messages that arrived while the agent wrote stay unanswered. The reply is checked like a
   * page; errors in the document are the diagnostics' concern, which the agent reads before it
   * replies.
   */
  private async reply(mdx: string): Promise<Reply> {
    const { chat } = this.options;
    const answered = chat.readers(0).find((m) => m.seq === this.handed);
    if (!answered) throw new HttpError(409, nothingToAnswer());
    const result = await chat.addReply(answered.seq, mdx, this.readAt.get(answered.seq));
    if ("errors" in result) return refused(rejectedReply(result.errors), result.errors);
    this.lastSeen = Date.now();
    this.agentChanged();
    return { status: 204 };
  }

  /** Clear the chat: what was given to the agent is gone too, so a late reply is refused. */
  private clear(): Reply {
    this.options.chat.clear();
    this.handed = undefined;
    this.handedAt = 0;
    this.readAt.clear();
    this.agentChanged();
    return { status: 204 };
  }

  mount(router: Router) {
    router
      .on("GET", "/chat", ({ query, req, res }) => {
        const agent = req.headers[agentHeader.toLowerCase()];
        return this.get(query, typeof agent === "string" && agent ? agent : undefined, res);
      })
      .on("POST", "/chat", ({ body }) => this.post(body))
      .on("DELETE", "/chat", () => this.clear());
  }

  close() {
    clearTimeout(this.agentTimer);
    for (const waiter of [...this.waiters]) waiter.done({ status: 503 });
  }
}
