/**
 * The wire protocol between the dev server, the reader app, and the agent library.
 *
 * Messages by kind, each with its own resource:
 *   Commands      intent                       POST /-/api/chat/reader, /-/api/chat/clear, /-/api/agent/reply?to=N
 *   Reports       facts the browser observes   PUT|DELETE /-/api/diagnostics/{scope}
 *   Events        server → browser updates     GET /-/api/events (Server-Sent Events)
 *   Reads         state, possibly blocking     GET /-/api/chat, GET /-/api/diagnostics, GET /-/api/agent/prompt?after=N&timeout=S,
 *                                              GET /-/api/files/{folder}/{path}
 */

import type { Root } from "hast";

/**
 * Every path the application serves besides pages starts with this: the API, built assets.
 * Page names cannot start with "-", so no page collides with the application.
 */
export const appPrefix = "/-";
export const apiPrefix = `${appPrefix}/api`;

/* ---------- Chat ---------- */

/**
 * What a context item points at. Text passages are the only kind without their own id.
 * "file" and "lines" are a source file the document shows, whole or some of its lines.
 */
export type TargetKind =
  | "page"
  | "text"
  | "section"
  | "figure"
  | "table"
  | "listing"
  | "code"
  | "diagram-part"
  | "file"
  | "lines";

/**
 * One thing the reader asked about: an address, and where its source was when the reader asked.
 * The compiler embeds the source range in the page; the browser sends it back. The server keeps
 * the item as sent and finds the lines again, by hash, when it writes the prompt.
 */
export interface ContextItem {
  kind: TargetKind;
  /**
   * "/page", "/page#id", "/page#figure--part", or for selected words the nearest section with a
   * text fragment: "/page#section:~:text=start,end". For a source file, "/-/files/app/x.go",
   * or with its lines, "/-/files/app/x.go#L4-L9".
   */
  address: string;
  /** The page's or source file's file, relative to the project folder. */
  source: string;
  startLine: number;
  endLine: number;
  /** Content hash of lines `startLine`–`endLine` when the reader asked. */
  hash: string;
  /** The diagram step the reader had open, with its text: "Step 2 of 5 (miss): …". */
  step?: string;
}

/**
 * A message the reader wrote in the browser. Its context is only what the reader attached:
 * no context means a question about the document in general.
 */
export interface ReaderMessage {
  seq: number;
  author: "reader";
  text: string;
  context: ContextItem[];
  createdAt: string;
}

/** A reply the agent sent: MDX, stored by the server and rendered with the page components. */
export interface AgentMessage {
  seq: number;
  author: "agent";
  /** The newest reader message the reply answers; earlier ones are answered too. */
  to: number;
  /** When the server first handed message `to` to an agent; absent if the server restarted. */
  readAt?: string;
  /** The reply's MDX module, which the browser imports to show it. */
  module: string;
  createdAt: string;
}

export type Message = ReaderMessage | AgentMessage;

/** Body of GET /-/api/chat. Status is computed from the log, never stored. */
export interface ChatState {
  /** The messages since the chat was last cleared. */
  messages: Message[];
  /** The highest reader message an agent replied to; 0 before the first reply. */
  repliedTo: number;
  /**
   * "listening": an agent is connected: a wait is open, or a wait without news or a reply ended
   * a moment ago. "read": no agent is connected, and the last one read messages it has not
   * replied to, within the last 10 minutes; it is probably writing the answer. "away": neither,
   * so the reader sees how to connect one. The server cannot see an agent between its commands.
   */
  agent: "listening" | "read" | "away";
  /** The text a person gives their agent to connect, with the current number filled in. */
  start: string;
}

/** Body of POST /-/api/chat/reader. */
export interface NewReaderMessage {
  text: string;
  context: ContextItem[];
}

/** Body of GET /-/api/chat/prompt: the reader messages after the cursor, and text for the agent. */
export interface AgentPrompt {
  messages: ReaderMessage[];
  /** The number the chat was cleared at, when that happened after the cursor. */
  cleared?: number;
  /** Errors the agent has not been shown before. They end a wait, like a reader message. */
  newErrors: Diagnostic[];
  prompt: string;
}

/* ---------- Diagnostics ---------- */

/**
 * Who found a diagnostic. The server compiles pages and checks links and `document.json`;
 * the browser finds what only exists when a page runs: diagram layout, render and runtime
 * errors, and replies that fail to show.
 */
export type DiagnosticOrigin =
  | "compile"
  | "link"
  | "pages"
  | "diagram"
  | "render"
  | "runtime"
  | "reply";

/** An error or warning in the document, with where it is. */
export interface Diagnostic {
  origin: DiagnosticOrigin;
  severity: "error" | "warning";
  /** Short machine code, such as BROKEN_LINK or NODE_OVERLAP. */
  code: string;
  message: string;
  /** The file it is in, relative to the project folder, when known. */
  source?: string;
  /** The line in that file, when known. */
  line?: number;
  /** A figure id, or a reply's message number, inside that source. */
  target?: string;
  /**
   * What the diagnostic is about, such as a link's target or a diagram's parts. With the code,
   * source, and target it identifies the diagnostic, so its message may change wording.
   * Without it, the message identifies it.
   */
  subject?: string;
  /** Diagram part ids involved. */
  elements?: string[];
}

/**
 * Body of PUT /-/api/diagnostics/{scope}: the complete current set for one scope. A scope is
 * one check: "diagram:<source>#<figure>", "render:<source>", "runtime:<tab>", "reply:<seq>".
 * An empty list clears the scope. A report with a revision expires when the file changes,
 * and a "render:" report marks its page as checked at that revision.
 */
export interface DiagnosticReport {
  diagnostics: Diagnostic[];
  revision?: string;
}

/** A diagnostic as the server lists it. */
export interface ReportedDiagnostic extends Diagnostic {
  scope: string;
  reportedAt: string;
}

/* ---------- Source files ---------- */

/**
 * Body of GET /-/api/files/{folder}/{path}: a source file, highlighted like the code on
 * pages. Each line is a `span` with `data-line`. Builds carry the same object.
 */
export interface SourceFileView {
  /** "/-/files/app/x.go" */
  address: string;
  /** The file, relative to the project folder. */
  source: string;
  /** The Shiki language, or "text". */
  language: string;
  lines: number;
  /** The highlighted code: a `pre` element, as hast. */
  code: Root;
}

/* ---------- Events ---------- */

export type ServerEvent =
  | { type: "chat"; chat: ChatState }
  | { type: "diagnostics"; diagnostics: ReportedDiagnostic[] }
  /** A source file a reader has open changed on disk. */
  | { type: "file"; address: string };
