/** What a reader comments on: an address in the document, and its source lines. */

/**
 * What a reference points at. Text passages are the only kind without their own id.
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
  | "diagram-element"
  | "file"
  | "lines";

/**
 * One thing the reader commented on: an address, and the lines of its source when the reader
 * commented. The compiler embeds the source lines in the page; the browser sends them back,
 * and the server keeps the reference as sent. The page the reader sees is the file on disk,
 * because the page reloads when its file changes.
 */
export interface Reference {
  kind: TargetKind;
  /**
   * "/page", "/page#id", "/page#figure--element", or for selected words the figure, table, listing,
   * or section they are in, with a text fragment: "/page#section:~:text=start,end". For a
   * source file, "/-/files/app/x.go", or with its lines, "/-/files/app/x.go#L4-L9".
   */
  address: string;
  /** The page's or source file's file, relative to the project folder. */
  source: string;
  startLine: number;
  endLine: number;
  /** The diagram step the reader had open, with its text: "Step 2 of 5 (miss): …". */
  step?: string;
}
