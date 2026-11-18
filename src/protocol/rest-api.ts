/**
 * The wire protocol between the dev server, the web app, and the agent library: the bodies of
 * the `chat`, `diagnostics`, `files`, and `figures` resources, and the hot-update events.
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
  /** When the server first handed `inReplyTo` to an agent; absent if the server restarted. */
  readAt?: string;
  /** The reply's MDX module, which the browser imports to show it. */
  module: string;
  createdAt: string;
}

/** A message in the chat, from the reader or the agent. */
export type Message = ReaderMessage | AgentMessage;

/**
 * Body of POST /-/api/chat. A reader message carries what the reader selected; an agent reply
 * is MDX, checked first, and answers the reader messages the agent's last read returned.
 */
export type NewMessage =
  | { author: "reader"; text: string; references: Reference[] }
  | { author: "agent"; mdx: string };

/**
 * "waiting": a read is open or just ended. "working": the last agent read messages it has not
 * replied to within 10 minutes. "away": neither, so the reader sees how to connect one.
 */
export type AgentState = "waiting" | "working" | "away";

/**
 * Body of GET /-/api/chat. Without the agent header it is the whole chat and the start prompt;
 * an agent's read holds only what it has to do: unanswered messages and errors not yet given.
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

/**
 * Body of POST /-/api/diagnostics: what a browser found rendering one revision of a page, or a
 * reply. Findings count while the page is at that revision; an empty report marks it checked.
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
  /** The figure's last line, when `line` is its first; the server reads both from the page. */
  endLine?: number;
  /** The page address to link: "/page" or "/page#figure". */
  address?: string;
}

/** A page no browser has rendered since it changed, and what its last checked revision had. */
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
