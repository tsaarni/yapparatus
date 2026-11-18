/** A temporary one-page project and a reference into it, for the server's unit tests. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const page =
  "# Page\n\n## First\n\nOriginal paragraph.\n\n```md\n## not a heading\n```\n\n## Second\n\nMore.\n";

/** A project with one page, content/page.mdx, removed after `run`. */
export function withWorkspace(run: (root: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-references-"));
  try {
    mkdirSync(path.join(root, "content"));
    writeFileSync(path.join(root, "content/page.mdx"), page);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A reference to words in the page's first section. */
export const paragraph = {
  kind: "text",
  address: "/page#first:~:text=paragraph",
  source: "content/page.mdx",
  startLine: 5,
  endLine: 5,
};
