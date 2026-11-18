/**
 * The wire protocol between the dev server, the web app, and the agent library.
 *
 * Resources under /-/api, named after what the document is made of:
 *   GET    /chat?author=reader&include=diagnostics&wait=S           the chat, or what is new for the agent
 *   POST   /chat                                                    add a message
 *   DELETE /chat                                                    clear the chat
 *   GET    /diagnostics                                             the document's problems
 *   POST   /diagnostics                                             what a browser found
 *   GET    /files/{directory}/{path}                                a source file
 *   GET    /figures/{page}/{figure}?ids=true                        a diagram's picture, as PNG
 * An agent's reads of the chat carry its id in the `Yapparatus-Agent` header.
 * Changes reach the browser on Vite's hot-update connection, as the events in `UpdateEvents`.
 */

import type { Diagnostic, Severity } from "../document/diagnostic.ts";
import { appPrefix } from "../document/file-address.ts";
import type { HighlightedCode } from "../document/page-module.ts";
import type { Reference } from "../document/reference.ts";

/** The path the resources below are under. */
export const apiPrefix = `${appPrefix}/api`;

/**
 * The request header that names the agent session reading the chat. Who reads changes nothing
 * in the response; it drives the agent's state, and the newest agent takes over.
 */
export const agentHeader = "Yapparatus-Agent";

/** `.yapparatus/server.json` in the project folder: where the running dev server is. */
export interface ServerFile {
  url: string;
}

/* ---------- Chat ---------- */

/**
 * A message the reader wrote in the browser. Its references are only what the reader attached:
 * no references means a message about the document in general.
 */
export interface ReaderMessage {
  seq: number;
  author: "reader";
  text: string;
  references: Reference[];
  createdAt: string;
}

/** A reply the agent sent: MDX, stored by the server and rendered with the page components. */
export interface AgentMessage {
  seq: number;
  author: "agent";
  /** The newest reader message the reply answers; earlier ones are answered too. */
  inReplyTo: number;
  /** When the server first handed message `inReplyTo` to an agent; absent if the server restarted. */
  readAt?: string;
  /** The reply's MDX module, which the browser imports to show it. */
  module: string;
  createdAt: string;
}

export type Message = ReaderMessage | AgentMessage;

/**
 * Body of POST /-/api/chat. The author says which checks apply: a reader message
 * carries what the reader selected; an agent reply is MDX, compiled and checked first. A
 * reply answers the reader messages that the agent's last read returned.
 */
export type NewMessage =
  | { author: "reader"; text: string; references: Reference[] }
  | { author: "agent"; mdx: string };

/**
 * "waiting": an agent is connected: a waiting read is open, or an empty read or a
 * reply ended a moment ago. "working": no agent is connected, and the last one read messages
 * it has not replied to, within the last 10 minutes. "away": neither, so the reader sees how
 * to connect one. The server cannot see an agent between its requests.
 */
export type AgentState = "waiting" | "working" | "away";

/**
 * Body of GET /-/api/chat. A read without the agent header is the whole chat since it was last
 * cleared, every diagnostic with `include=diagnostics`, and the start prompt. An agent's read
 * holds what the agent has to do: the reader messages not answered yet (only the reader's with
 * `author=reader`) and, with `include=diagnostics`, the errors the agent has not been given.
 * `wait` holds an agent's read until there is something.
 */
export interface Chat {
  messages: Message[];
  /** The highest reader message an agent replied to; 0 before the first reply. */
  repliedTo: number;
  agent: AgentState;
  /** With `include=diagnostics`: every diagnostic, or in an agent's read the new errors. */
  diagnostics?: ReportedDiagnostic[];
  /**
   * The same read written for an agent. Without the agent header, the text a person gives an
   * agent to connect; with it, the messages and diagnostics, ending with the command to run next.
   */
  prompt: string;
}

/* ---------- Diagnostics ---------- */

/**
 * Body of POST /-/api/diagnostics: what a browser found when it rendered one revision of a
 * page, or a reply. Findings only add: they count while the page is at that revision, and a
 * change to the page gives it a new one. A report with no diagnostics says the revision was
 * rendered and nothing was found, which marks the page as checked. A reply never changes, so
 * its report has no revision. The server fills in each diagnostic's `source`.
 */
export interface DiagnosticReport {
  /** The page's file, or the reply's module file, relative to the project folder. */
  source: string;
  revision?: string;
  diagnostics: Omit<Diagnostic, "source">[];
}

/** A diagnostic as the server lists it: its severity, and where it is now. */
export interface ReportedDiagnostic extends Diagnostic {
  severity: Severity;
  /** The figure's last line, when `line` is a figure's first. The server reads both from the page. */
  endLine?: number;
  /** The page address to link: "/page" or "/page#figure". */
  address?: string;
}

/** A page no browser has rendered since it changed, and what was found in its last checked revision. */
export interface UncheckedPage {
  source: string;
  /** "/page" */
  address: string;
  previous: ReportedDiagnostic[];
}

/**
 * Body of GET /-/api/diagnostics, which answers once the checks of recent edits are done:
 * every diagnostic, the pages no browser has checked since they changed, and text for the agent.
 */
export interface DocumentDiagnostics {
  diagnostics: ReportedDiagnostic[];
  unchecked: UncheckedPage[];
  prompt: string;
}

/**
 * Body of a refused agent reply (422): text for the agent, and the problems with the reply
 * or the errors that appeared after the agent read the message.
 */
export interface ReplyRefusal {
  error: string;
  diagnostics: Diagnostic[];
}

/* ---------- Source files ---------- */

/**
 * Body of GET /-/api/files/{directory}/{path}: a source file, highlighted like the code on
 * pages. Builds carry the same object.
 */
export interface SourceFileView {
  /** "/-/files/app/x.go" */
  address: string;
  /** The file, relative to the project folder. */
  source: string;
  /** The whole file, numbered from line 1. */
  code: HighlightedCode;
}

/* ---------- Updates ---------- */

/**
 * What the server sends the browser on Vite's hot-update connection when something changes.
 * Each carries what the matching read returns.
 */
export interface UpdateEvents {
  /** GET /-/api/chat */
  "yapparatus:chat": Chat;
  /** The `diagnostics` of GET /-/api/chat?include=diagnostics */
  "yapparatus:diagnostics": ReportedDiagnostic[];
  /** The address of a source file a reader has open, after it changed on disk. */
  "yapparatus:file": string;
}
