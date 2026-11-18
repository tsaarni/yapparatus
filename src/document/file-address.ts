/**
 * Source files a document shows: their addresses, such as `/-/files/contour/dag.go#L40-L72`,
 * and where they are on disk, from the folders under `"files"` in `document.json`.
 */

/**
 * Every path the application serves besides pages starts with this: the API, built assets,
 * source files. Page names cannot start with "-", so no page collides with the application.
 */
export const appPrefix = "/-";

/** The start of every source file address: `/-/files/<folder>/<path>`. */
export const filesPrefix = `${appPrefix}/files`;

/** Lines in a source file, numbered from 1, both ends included. */
export interface LineRange {
  start: number;
  end: number;
}

/** What a file address names: a folder from `document.json`, a path in it, and maybe lines. */
export interface FileAddress {
  folder: string;
  path: string;
  lines?: LineRange;
}

/** A folder name in the `files` field of `document.json`. */
export const folderName = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * "/-/files/contour/x.go#L40-L72" → the folder, the path, and the lines. Undefined for anything
 * else, including paths that leave the folder. A text fragment may follow, as `quoteOf` reads.
 */
export function parseFileAddress(address: string): FileAddress | undefined {
  if (!address.startsWith(`${filesPrefix}/`)) return;
  const [located = ""] = address.split(":~:");
  const [location = "", fragment, ...more] = located.slice(filesPrefix.length + 1).split("#");
  if (more.length) return;
  const [folder = "", ...segments] = location.split("/");
  if (!folderName.test(folder) || !segments.length) return;
  if (segments.some((s) => !s || s === "." || s === "..")) return;
  const path = segments.join("/");
  if (!fragment) return { folder, path };
  const lines = parseLines(fragment);
  return lines ? { folder, path, lines } : undefined;
}

/** "L40-L72" or "L40" → the lines. */
export function parseLines(fragment: string): LineRange | undefined {
  const match = /^L(\d+)(?:-L(\d+))?$/.exec(fragment);
  if (!match) return;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return start >= 1 && end >= start ? { start, end } : undefined;
}

/** The lines as a URL fragment without "#": "L40-L72" or "L40". */
export function linesFragment(lines: LineRange): string {
  return lines.end > lines.start ? `L${lines.start}-L${lines.end}` : `L${lines.start}`;
}

/** The address of a file, or of lines in it. */
export function fileAddress(file: FileAddress): string {
  const fragment = file.lines ? `#${linesFragment(file.lines)}` : "";
  return `${filesPrefix}/${file.folder}/${file.path}${fragment}`;
}

/** "41–72" or "41", as a reader reads a range. */
export function linesLabel(lines: LineRange): string {
  return lines.end > lines.start ? `${lines.start}–${lines.end}` : `${lines.start}`;
}

/**
 * Where a file is, relative to the project folder: the content folder, then the folder's path
 * from `document.json`, which is relative to it, then the path. Leading ".." stay.
 */
export function fileSource(
  content: string,
  folders: Record<string, string>,
  file: FileAddress,
): string | undefined {
  const folder = folders[file.folder];
  if (folder === undefined) return;
  const out: string[] = [];
  for (const segment of `${content}/${folder}/${file.path}`.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === ".." && out.length && out.at(-1) !== "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

/** Errors in the `files` field of `document.json`, as readable messages. */
export function checkFiles(files: unknown): string[] {
  if (files === undefined) return [];
  if (typeof files !== "object" || files === null || Array.isArray(files))
    return [
      '"files" in document.json names external directories by name: { "files": { "app": "../app" } }.',
    ];
  return Object.entries(files).flatMap(([name, folder]) => [
    ...(folderName.test(name)
      ? []
      : [`"files" in document.json names "${name}": use lowercase letters, digits, and hyphens.`]),
    ...(typeof folder === "string" && folder
      ? []
      : [`"files" in document.json gives "${name}" no directory path.`]),
  ]);
}

/**
 * The folders a document names, from the `files` field of `document.json`. None when the
 * field has an error, as `checkFiles` reports it.
 */
export function foldersOf(settings: { files?: unknown }): Record<string, string> {
  const { files } = settings;
  if (files === undefined || checkFiles(files).length) return {};
  return files as Record<string, string>;
}
