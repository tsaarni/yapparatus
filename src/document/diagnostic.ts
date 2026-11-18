/** Problems in the document: their codes, severities, and who found them. */

/**
 * Who found a diagnostic. The server compiles pages, with their diagrams, and checks links and
 * `document.json`; the browser finds what only exists when a page runs: chart layout, render
 * and runtime errors, and replies that fail to show.
 */
export type DiagnosticOrigin =
  | "compile"
  | "link"
  | "pages"
  | "chart"
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
    meaning: "Elements are placed relative to each other in a circle.",
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
  CONFLICTING_PLACEMENT: {
    severity: "error",
    meaning: "An element is positioned by two placements.",
  },
  UNPLACED: {
    severity: "error",
    meaning: "An element has no placement, so it is drawn over another element.",
  },
  UNKNOWN_ELEMENT: {
    severity: "error",
    meaning: "A step or element() names an element the diagram does not have.",
  },
  STEP_NOT_TEXT: {
    severity: "error",
    meaning: "A step's id or focus is computed; the compiler reads only plain text.",
  },
  TEXT_OVERFLOW: { severity: "warning", meaning: "Text does not fit its box." },
  RULER_CROWDED: { severity: "warning", meaning: "A record's column labels run into each other." },
  LABEL_CROWDED: { severity: "warning", meaning: "An edge label has too little room." },
  LABEL_OVERLAP: { severity: "warning", meaning: "A label overlaps another label or an element." },
  NODE_OVERLAP: { severity: "warning", meaning: "Two elements shown together overlap." },
  EDGE_NODE_INTERSECTION: {
    severity: "warning",
    meaning: "An edge crosses an element it does not connect.",
  },
  ENCLOSURE_TITLE_CROSSED: {
    severity: "warning",
    meaning: "An edge crosses an enclosure's title.",
  },
  ENCLOSURE_INTRUSION: {
    severity: "warning",
    meaning: "An element it does not hold overlaps an enclosure.",
  },
  ACCENT_OVERUSED: { severity: "warning", meaning: "Too many elements are accented to stand out." },
  TOO_MANY_CATEGORIES: {
    severity: "warning",
    meaning: "More categories than colors; the rest are drawn muted.",
  },
  DIAGRAM_SCROLLS: {
    severity: "warning",
    meaning: "The drawing is too wide, so readers scroll sideways.",
  },
  FONT_FALLBACK: {
    severity: "warning",
    meaning: "Diagram text has characters the web app's fonts lack, so their width is estimated.",
  },
  STEP_ONLY_UNUSED: { severity: "warning", meaning: "A stepOnly element is in no step." },
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
   * What the diagnostic is about, such as a link's target or a diagram's elements. With the code,
   * source, and target it identifies the diagnostic, so its message may change wording.
   * Without it, the message identifies it.
   */
  subject?: string;
  /** Diagram element ids involved. */
  elements?: string[];
}
