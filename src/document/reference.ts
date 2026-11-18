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
 * commented. The compiler embeds the lines in the page; the server keeps them as sent.
 */
export interface Reference {
  kind: TargetKind;
  /**
   * "/page", "/page#id", "/page#figure--element", "/page#section:~:text=start,end" for selected
   * words, or "/-/files/app/x.go#L4-L9" for a source file or its lines.
   */
  address: string;
  /** The page's or source file's file, relative to the project folder. */
  source: string;
  startLine: number;
  endLine: number;
  /** The diagram step the reader had open, with its text: "Step 2 of 5 (miss): …". */
  step?: string;
}
