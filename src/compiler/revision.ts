import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export function revision(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

/**
 * A page's revision: its text and every file it reads, such as excerpts and chart data. The
 * compiler writes it into the page, and the server computes it from the files on disk, so
 * findings a browser reports for a revision stop counting when any of these files change.
 * Without files it is the text's own revision.
 */
export function pageRevision(text: string, files: Iterable<string>): string {
  const hash = createHash("sha256").update(text);
  for (const file of [...files].sort())
    hash.update(`\0${file}\0${existsSync(file) ? readFileSync(file, "utf8") : ""}`);
  return hash.digest("hex");
}
