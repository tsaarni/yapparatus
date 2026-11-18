/** Content hashes that tell when a page or a file has changed. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/** The SHA-256 hex hash of a text. */
export function revision(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

/**
 * A page's revision: a hash of its text and every file it reads, such as excerpts and chart data.
 * Findings a browser reports for a revision stop counting when any of these files change.
 */
export function pageRevision(text: string, files: Iterable<string>): string {
  const hash = createHash("sha256").update(text);
  for (const file of [...files].sort())
    hash.update(`\0${file}\0${existsSync(file) ? readFileSync(file, "utf8") : ""}`);
  return hash.digest("hex");
}
