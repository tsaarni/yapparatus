/**
 * Reading the source files a document shows, for the compiler and the dev server. A file is
 * read only from a folder `document.json` names, and only when its real path stays inside it.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { type FileAddress, fileSource, foldersOf } from "./files.ts";

/** Larger files are not shown: they would make a page or a build heavy for little use. */
export const maxFileSize = 1_000_000;

export interface SourceFile {
  /** Absolute real path. */
  file: string;
  /** Path relative to the project folder, as context items and prompts name it. */
  source: string;
  /** The file's lines, without the empty one after a final newline. */
  lines: string[];
}

export class SourceFiles {
  private readonly root: () => string;
  private readonly content: string;

  constructor(root: () => string, content: string) {
    this.root = root;
    this.content = content;
  }

  /** The folders `document.json` names, read on each call so an edit applies at once. */
  folders(): Record<string, string> {
    try {
      const file = path.join(this.root(), this.content, "document.json");
      return foldersOf(JSON.parse(readFileSync(file, "utf8")) as { files?: unknown });
    } catch {
      return {};
    }
  }

  /** Read the file an address names, or say why it cannot be shown. */
  read(address: FileAddress): SourceFile | { error: string } {
    const folders = this.folders();
    const folder = folders[address.folder];
    const source = fileSource(this.content, folders, address);
    if (folder === undefined || source === undefined)
      return { error: `"files" in document.json names no external directory "${address.folder}".` };
    let base: string;
    try {
      base = realpathSync(path.resolve(this.root(), this.content, folder));
    } catch {
      return { error: `The external directory "${address.folder}", ${folder}, does not exist.` };
    }
    if (address.path.split("/").includes(".git"))
      return { error: `${address.path} is inside .git, which is never shown.` };
    let file: string;
    try {
      file = realpathSync(path.join(base, address.path));
    } catch {
      return { error: `There is no file ${address.path} in "${address.folder}".` };
    }
    if (!file.startsWith(`${base}${path.sep}`))
      return { error: `${address.path} leads outside the external directory "${address.folder}".` };
    const stat = statSync(file);
    if (!stat.isFile()) return { error: `${address.path} in "${address.folder}" is not a file.` };
    if (stat.size > maxFileSize)
      return { error: `${address.path} is larger than ${maxFileSize / 1_000_000} MB.` };
    const text = readFileSync(file, "utf8");
    if (text.includes("\0")) return { error: `${address.path} is not a text file.` };
    const lines = text.split("\n");
    if (lines.length > 1 && lines.at(-1) === "") lines.pop();
    return { file, source, lines };
  }

  /** How many lines a file has, or why it cannot be shown: what the link check needs. */
  readonly lineCount = (address: FileAddress): { lines: number } | { error: string } => {
    const file = this.read(address);
    return "error" in file ? file : { lines: file.lines.length };
  };

  /** Is `source`, relative to the project folder, the file this address names? */
  matches(address: FileAddress, source: string): boolean {
    return fileSource(this.content, this.folders(), address) === source;
  }
}
