/**
 * The wire protocol between the dev server, the reader app, and the agent library.
 *
 * Messages by kind, each with its own resource:
 *   Commands      intent                       POST /-/api/chat/reader, /-/api/chat/clear, /-/api/agent/reply?to=N
 *   Reports       facts the browser observes   PUT|DELETE /-/api/diagnostics/{scope}
 *   Events        server → browser updates     GET /-/api/events (Server-Sent Events)
 *   Reads         state, possibly blocking     GET /-/api/chat, GET /-/api/diagnostics, GET /-/api/agent/prompt?after=N&timeout=S,
 *                                              GET /-/api/agent/diagnostics, GET /-/api/files/{folder}/{path}
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
  newErrors: ReportedDiagnostic[];
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

export type Severity = "error" | "warning";

/**
 * Every diagnostic code, with its severity and what it means. A code names what is wrong;
 * checks pass a code and never a severity. `error`: the result is not what the author wrote
 * (a reference to nothing, a duplicate, an invalid form, something that threw). `warning`:
 * it renders as written but reads badly (overlap, overflow, too much).
 */
export const diagnosticCodes = {
  // Links and ids, checked by the server across pages.
  BROKEN_LINK: {
    severity: "error",
    meaning: "A link names a page, anchor, file, or lines that do not exist.",
  },
  BROKEN_REF: { severity: "error", meaning: "A <Ref> points at nothing." },
  DUPLICATE_ID: { severity: "error", meaning: "Two things that must be told apart share an id." },
  PAGE_LIST: { severity: "error", meaning: "document.json is invalid or does not list the pages." },
  COMPILE_FAILED: { severity: "error", meaning: "A page or reply is not valid MDX." },
  // Replies the agent sends.
  UNKNOWN_COMPONENT: {
    severity: "error",
    meaning: "A reply uses a component that does not exist.",
  },
  REPLY_EMPTY: { severity: "error", meaning: "A reply has no text." },
  // Markdown conventions and components, checked when a page compiles.
  ALERT_TYPE: { severity: "error", meaning: "An alert names an unknown kind." },
  CODE_LANGUAGE: {
    severity: "error",
    meaning: "A code block names no language, or one the highlighter does not know.",
  },
  HEADING_DEPTH: { severity: "error", meaning: "A heading is deeper than ###." },
  FILE_TREE_INVALID: {
    severity: "error",
    meaning: "A <FileTree> does not wrap one Markdown list.",
  },
  PANEL_CONTENT: {
    severity: "error",
    meaning: "<Tabs> or <Columns> holds something besides panels, or fewer than two.",
  },
  PANEL_LABEL: {
    severity: "error",
    meaning: "A panel has no label, or the same label as another.",
  },
  PANEL_NESTED: {
    severity: "error",
    meaning: "A panel is outside a container, or a container is inside a panel.",
  },
  TOO_MANY_COLUMNS: {
    severity: "error",
    meaning: "<Columns> holds more panels than fit side by side.",
  },
  FIGURE_NESTED: {
    severity: "error",
    meaning: "A figure inside a <Figure> has its own id or caption.",
  },
  EXCERPT_TEXT: {
    severity: "error",
    meaning:
      "An excerpt's start, end, or mark text is in no line of the file, or start is in several.",
  },
  EXCERPT_INVALID: {
    severity: "error",
    meaning: "An <Excerpt> has an invalid from or attributes.",
  },
  // Charts.
  CHART_PLOT: { severity: "error", meaning: "A <Chart> has no plot function." },
  CHART_DATA: { severity: "error", meaning: "A chart's data is missing, unreadable, or mistyped." },
  CHART_OPTION: { severity: "error", meaning: "plot returns or calls something the chart owns." },
  CHART_COLOR: {
    severity: "error",
    meaning: "A mark sets a literal color; the theme picks colors.",
  },
  CHART_FIELD: { severity: "error", meaning: "A mark names a column its data does not have." },
  CHART_FAILED: { severity: "error", meaning: "Drawing the chart threw." },
  CHART_OVERLAP: { severity: "warning", meaning: "Tick labels on an axis overlap." },
  // Diagrams.
  DRAW_FAILED: { severity: "error", meaning: "The diagram's draw function threw." },
  DIAGRAM_FAILED: { severity: "error", meaning: "The diagram compiler threw." },
  MARK_UNMATCHED: {
    severity: "error",
    meaning: "A text mark does not match exactly one place in its text.",
  },
  CELL_SPAN: {
    severity: "error",
    meaning: "A record cell spans more columns than remain in its row.",
  },
  BEND_WITH_ROUTE: { severity: "error", meaning: "An edge sets both bend and route." },
  DEGENERATE_EDGE: { severity: "error", meaning: "An edge starts and ends at the same point." },
  PLACEMENT_CYCLE: {
    severity: "error",
    meaning: "Parts are placed relative to each other in a circle.",
  },
  LABEL_SEGMENT: {
    severity: "error",
    meaning: "An edge label names a segment the edge does not have.",
  },
  INVALID_PLACEMENT: {
    severity: "error",
    meaning: "A placement does not name exactly one relation.",
  },
  ENCLOSURE_PLACEMENT: {
    severity: "error",
    meaning: "An enclosure is placed; it takes its place from what it holds.",
  },
  CONFLICTING_PLACEMENT: { severity: "error", meaning: "A part is positioned by two placements." },
  UNPLACED: {
    severity: "error",
    meaning: "A part has no placement, so it is drawn over another part.",
  },
  UNKNOWN_PART: {
    severity: "error",
    meaning: "A step or part() names a part the diagram does not have.",
  },
  TEXT_OVERFLOW: { severity: "warning", meaning: "Text does not fit its box." },
  RULER_CROWDED: { severity: "warning", meaning: "A record's column labels run into each other." },
  LABEL_CROWDED: { severity: "warning", meaning: "An edge label has too little room." },
  LABEL_OVERLAP: { severity: "warning", meaning: "A label overlaps another label or a part." },
  NODE_OVERLAP: { severity: "warning", meaning: "Two parts shown together overlap." },
  EDGE_NODE_INTERSECTION: {
    severity: "warning",
    meaning: "An edge crosses a part it does not connect.",
  },
  ENCLOSURE_TITLE_CROSSED: {
    severity: "warning",
    meaning: "An edge crosses an enclosure's title.",
  },
  ENCLOSURE_INTRUSION: {
    severity: "warning",
    meaning: "A part it does not hold overlaps an enclosure.",
  },
  ACCENT_OVERUSED: { severity: "warning", meaning: "Too many parts are accented to stand out." },
  TOO_MANY_CATEGORIES: {
    severity: "warning",
    meaning: "More categories than colors; the rest are drawn muted.",
  },
  DIAGRAM_SCROLLS: {
    severity: "warning",
    meaning: "The drawing is too wide, so readers scroll sideways.",
  },
  STEP_ONLY_UNUSED: { severity: "warning", meaning: "A stepOnly part is in no step." },
  BUILD_WITHOUT_STEPS: { severity: "warning", meaning: "A diagram has build but no steps." },
  // Found when a page or reply runs in the browser.
  RENDER_FAILED: { severity: "error", meaning: "A page threw while rendering." },
  RUNTIME_FAILED: { severity: "error", meaning: "Code on a page threw outside rendering." },
  REPLY_FAILED: { severity: "error", meaning: "A reply could not be shown." },
} as const satisfies Record<string, { severity: Severity; meaning: string }>;

export type DiagnosticCode = keyof typeof diagnosticCodes;

export function isDiagnosticCode(code: string): code is DiagnosticCode {
  return Object.hasOwn(diagnosticCodes, code);
}

/** An error or warning in the document, with where it is. Its severity is its code's. */
export interface Diagnostic {
  origin: DiagnosticOrigin;
  code: DiagnosticCode;
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

/** A diagnostic as the server lists it, with its code's severity. */
export interface ReportedDiagnostic extends Diagnostic {
  severity: Severity;
  scope: string;
  reportedAt: string;
}

/**
 * Body of GET /-/api/agent/diagnostics, which answers once the checks of recent edits are done:
 * every open diagnostic, the pages no browser has checked since they changed, and text for the agent.
 */
export interface AgentDiagnostics {
  diagnostics: ReportedDiagnostic[];
  unchecked: string[];
  prompt: string;
}

/**
 * Body of a refused POST /-/api/agent/reply (422): text for the agent, and the problems with
 * the reply or the errors that appeared after the agent read the message.
 */
export interface ReplyRefusal {
  error: string;
  diagnostics: Diagnostic[];
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
