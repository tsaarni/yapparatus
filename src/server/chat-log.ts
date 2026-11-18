/**
 * The chat's log: reader messages with the references they carry, and agent replies, checked
 * before they are stored. Reads of the chat, with waiting and prompts, are in `resources/chat.ts`.
 */
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { ViteDevServer } from "vite";
import type { ExternalFiles } from "../compiler/external-files.ts";
import { checkLinks } from "../compiler/link-checks.ts";
import { contentIssues } from "../compiler/stages/conventions.ts";
import { compiled } from "../compiler/stages/outline.ts";
import { type Diagnostic, diagnosticCodes } from "../document/diagnostic.ts";
import { parseFileAddress } from "../document/file-address.ts";
import { type PageOutline, pageComponents } from "../document/page-module.ts";
import type { Reference, TargetKind } from "../document/reference.ts";
import { createLogger } from "../protocol/log.ts";
import type { AgentMessage, Message, ReaderMessage } from "../protocol/rest-api.ts";
import { HttpError, isRecord } from "./router.ts";

const log = createLogger("chat");

const kinds: TargetKind[] = [
  "page",
  "text",
  "section",
  "figure",
  "table",
  "listing",
  "code",
  "diagram-element",
  "file",
  "lines",
];

/** A string field of a reference, at most `max` long, or undefined; anything else is a 400. */
function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max)
    throw new HttpError(400, "Invalid reference.");
  return value;
}

/**
 * Check the browser's references and keep them as sent: the file must be a document page,
 * or a source file the document shows. The lines are those the reader saw.
 */
export function acceptReferences(
  root: string,
  content: string,
  files: ExternalFiles,
  input: unknown,
): Reference[] {
  if (!Array.isArray(input) || input.length > 30) throw new HttpError(400, "Invalid reference.");
  return input.map((item: unknown) => {
    if (
      !isRecord(item) ||
      !kinds.includes(item.kind as TargetKind) ||
      typeof item.address !== "string" ||
      item.address.length > 2000 ||
      typeof item.source !== "string" ||
      !Number.isInteger(item.startLine) ||
      !Number.isInteger(item.endLine)
    )
      throw new HttpError(400, "Invalid reference.");
    if (item.kind === "file" || item.kind === "lines") return acceptFileReference(files, item);
    const sourceRoot = realpathSync(path.join(root, content));
    const filename = realpathSync(path.resolve(root, item.source));
    if (!filename.startsWith(`${sourceRoot}${path.sep}`) || !filename.endsWith(".mdx"))
      throw new HttpError(400, "A reference must refer to a document page.");
    const startLine = Number(item.startLine);
    const endLine = Number(item.endLine);
    if (startLine < 1 || endLine < startLine) throw new HttpError(400, "Invalid reference.");
    const step = optionalText(item.step, 600);
    return {
      kind: item.kind as TargetKind,
      address: item.address,
      source: path.relative(realpathSync(root), filename),
      startLine,
      endLine,
      ...(step ? { step } : {}),
    };
  });
}

/**
 * A source file or lines in it. The address names the file and lines; `source` and the line
 * fields must agree with it, so the reference says one thing however it is read.
 */
function acceptFileReference(files: ExternalFiles, item: Record<string, unknown>): Reference {
  const address = parseFileAddress(item.address as string);
  const kind = item.kind as "file" | "lines";
  if (!address || (kind === "lines") !== !!address.lines)
    throw new HttpError(400, "Invalid reference.");
  const file = files.read({ folder: address.folder, path: address.path });
  if ("error" in file || file.source !== item.source)
    throw new HttpError(400, "A reference must refer to a file the document shows.");
  const lines = address.lines ?? { start: 1, end: file.lines.length };
  if (item.startLine !== lines.start || item.endLine !== lines.end || lines.end > file.lines.length)
    throw new HttpError(400, "Invalid reference.");
  return {
    kind,
    address: item.address as string,
    source: file.source,
    startLine: lines.start,
    endLine: lines.end,
  };
}

/** What the chat log needs from the server: where to store, compile, and check replies. */
export interface ChatOptions {
  root: string;
  server: ViteDevServer;
  content: string;
  /** The chat state directory, from the project folder: `.yapparatus/<directory>`, with `/`. */
  state: string;
  /** The source files the document shows. */
  files: ExternalFiles;
  /** Page outlines, for checking the links in a reply. */
  outlines: () => Promise<Array<{ id: string; outline: PageOutline }>>;
  /** Something the reader sees changed: a message or a reply was added, or the chat was cleared. */
  changed: () => void;
}

/**
 * The chat: an append-only log in `<state>/chat.jsonl`, each reply's MDX in a randomly named
 * `<state>/chat/<id>.mdx` so a new reply never reuses a deleted one's module.
 */
export class ChatLog {
  private entries: Message[] = [];
  private readonly dir: string;
  private readonly file: string;
  private readonly options: ChatOptions;

  /** Where a reply file is stored, from the project folder. Only the server names it. */
  private replyFile(name: string): string {
    return `${this.options.state}/chat/${name}`;
  }

  constructor(options: ChatOptions) {
    this.options = options;
    this.dir = path.join(options.root, options.state);
    this.file = path.join(this.dir, "chat.jsonl");
    mkdirSync(path.join(this.dir, "chat"), { recursive: true });
    if (existsSync(this.file))
      for (const line of readFileSync(this.file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line) as Message;
          if (record.author === "reader" || Number.isInteger(record.inReplyTo))
            this.entries.push(record);
          else log.warn(`${this.file}: skipped a reply without inReplyTo`);
        } catch {
          log.warn(`${this.file}: skipped a line that is not JSON`);
        }
      }
    log.debug(`loaded ${this.entries.length} messages from ${this.file}`);
  }

  private next(): number {
    return (this.entries.at(-1)?.seq ?? 0) + 1;
  }

  get messages(): readonly Message[] {
    return this.entries;
  }

  /** Reader messages numbered after `after`. */
  readers(after: number): ReaderMessage[] {
    return this.entries.filter((m): m is ReaderMessage => m.author === "reader" && m.seq > after);
  }

  /** The newest reader message an agent has answered; 0 before the first reply. */
  repliedTo(): number {
    return Math.max(
      0,
      ...this.entries
        .filter((m): m is AgentMessage => m.author === "agent")
        .map((m) => m.inReplyTo),
    );
  }

  /** The module files of the replies in the chat, from the project folder. */
  replyModules(): Set<string> {
    return new Set(
      this.entries.filter((m) => m.author === "agent").map((m) => m.module.replace(/^\//, "")),
    );
  }

  /** Add a message to the log: one JSON line appended, nothing rewritten. */
  private append(message: Message) {
    this.entries.push(message);
    appendFileSync(this.file, `${JSON.stringify(message)}\n`);
  }

  addReader(input: Record<string, unknown>): ReaderMessage {
    const { root, content, files } = this.options;
    if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 20000)
      throw new HttpError(400, "A message needs text.");
    const message: ReaderMessage = {
      seq: this.next(),
      author: "reader",
      text: input.text.trim(),
      references: acceptReferences(root, content, files, input.references ?? []),
      createdAt: new Date().toISOString(),
    };
    this.append(message);
    log.info(`reader #${message.seq}, ${message.references.length} references`);
    this.options.changed();
    return message;
  }

  /** Delete every message and reply, and their files. */
  clear() {
    for (const message of this.entries)
      if (message.author === "agent")
        rmSync(path.join(this.options.root, message.module.replace(/^\//, "")), { force: true });
    this.entries = [];
    writeFileSync(this.file, "");
    log.info("cleared");
    this.options.changed();
  }

  /**
   * Compile a reply like a page and check its components and links, with the codes pages use.
   * Returns the errors, which keep the reply out; warnings do not.
   */
  private async check(file: string, url: string): Promise<Diagnostic[]> {
    try {
      await this.options.server.transformRequest(url);
    } catch (error) {
      const { message, loc } = error as { message: string; loc?: { line: number; column: number } };
      return [
        {
          origin: "reply",
          code: "COMPILE_FAILED",
          message: message.split("\n")[0] ?? message,
          ...(loc?.line ? { line: loc.line } : {}),
        },
      ];
    }
    const entry = compiled.get(file);
    compiled.delete(file);
    if (!entry)
      return [
        { origin: "reply", code: "COMPILE_FAILED", message: "The reply could not be compiled." },
      ];
    const allowed: readonly string[] = pageComponents;
    const errors: Diagnostic[] = entry.components
      .filter((name) => !allowed.includes(name))
      .map((name) => ({
        origin: "reply",
        code: "UNKNOWN_COMPONENT",
        subject: name,
        message: `<${name}> is not a component. Use ${pageComponents.join(", ")}.`,
      }));
    for (const issue of contentIssues.get(file) ?? []) {
      if (diagnosticCodes[issue.code].severity !== "error") continue;
      const line = issue.line ?? (issue.target ? entry.places[issue.target]?.start : undefined);
      errors.push({
        origin: "reply",
        code: issue.code,
        ...(issue.subject ? { subject: issue.subject } : {}),
        message: issue.message,
        ...(line ? { line } : {}),
        ...(issue.elements ? { elements: issue.elements } : {}),
      });
    }
    contentIssues.delete(file);
    const links = checkLinks(
      [...(await this.options.outlines()), { id: "", outline: entry.outline }],
      this.options.files.lineCount,
    );
    for (const link of links)
      if (link.page === "")
        errors.push({
          origin: "reply",
          code: link.code,
          subject: link.subject,
          message: link.message,
          line: link.line,
        });
    return errors;
  }

  /**
   * Check a reply and store it as answering reader message `inReplyTo`. Returns the errors that
   * kept it out, or the stored message.
   */
  async addReply(
    inReplyTo: number,
    mdx: string,
    readAt: string | undefined,
  ): Promise<{ errors: Diagnostic[] } | { message: AgentMessage }> {
    if (!mdx.trim())
      return { errors: [{ origin: "reply", code: "REPLY_EMPTY", message: "The reply is empty." }] };
    const name = `pending-${randomUUID()}.mdx`;
    const pending = path.join(this.dir, "chat", name);
    writeFileSync(pending, mdx);
    const errors = await this.check(realpathSync(pending), `/${this.replyFile(name)}`);
    if (errors.length) {
      log.info(`reply to #${inReplyTo} refused: ${errors.length} errors`);
      for (const error of errors)
        log.debug(`reply to #${inReplyTo}: ${error.code} ${error.message}`);
      rmSync(pending, { force: true });
      return { errors };
    }
    const seq = this.next();
    const file = this.replyFile(`${randomUUID()}.mdx`);
    renameSync(pending, path.join(this.options.root, file));
    const message: AgentMessage = {
      seq,
      author: "agent",
      inReplyTo,
      ...(readAt ? { readAt } : {}),
      module: `/${file}`,
      createdAt: new Date().toISOString(),
    };
    this.append(message);
    log.info(`agent #${seq} replied to #${inReplyTo}`);
    this.options.changed();
    return { message };
  }
}
