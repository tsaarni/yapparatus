/** Where a document lives in the project: its directory, page ids, and directory checks. */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ExternalFiles } from "./external-files.ts";

/**
 * The document the compiler compiles: the project folder (known once Vite resolves its config),
 * the document directory in it with `/` between segments, and the outside files its pages show.
 */
export interface DocumentDirectory {
  root: () => string;
  content: string;
  files: ExternalFiles;
}

/** Page ids from disk, relative to the document directory and without extension. */
export function pageIds(root: string, content: string): string[] {
  const dir = path.join(root, content);
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => file.endsWith(".mdx"))
    .map((file) =>
      file
        .split(path.sep)
        .join("/")
        .replace(/\.mdx$/, ""),
    )
    .sort();
}

/**
 * Why `document` cannot be a document directory of the project at `root`, or undefined if it can.
 * It must hold a document.json, and no other document directory may contain it or be inside it.
 */
export function documentError(root: string, document: string): string | undefined {
  const dir = path.join(root, document);
  if (!existsSync(path.join(dir, "document.json")))
    return `${document} is not a document directory: it has no document.json.`;
  for (let parent = path.posix.dirname(document); parent !== "."; ) {
    if (existsSync(path.join(root, parent, "document.json")))
      return `${document} is inside the document directory ${parent}.`;
    parent = path.posix.dirname(parent);
  }
  const inner = (readdirSync(dir, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join("/"))
    .find((file) => file.endsWith("/document.json"));
  if (inner)
    return `${document} contains the document directory ${document}/${path.posix.dirname(inner)}.`;
}
