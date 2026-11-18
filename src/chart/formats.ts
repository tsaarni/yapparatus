/**
 * The formats a chart reads its data from, named by block language and file extension.
 * Adding a format here makes it work for both data blocks in `<Chart>` and files.
 */
import { type DataIssue, parseDelimited, type RawTable } from "./table.ts";

/** A data format: splits text into a header and rows of cell text, before typing. */
export interface DataFormat {
  /** The block language and the file extension: "csv". */
  name: string;
  /** Split the text into a table, or say why it cannot be read, with the line. */
  read(text: string): RawTable | DataIssue;
}

/** Every format, by name. */
export const dataFormats: ReadonlyMap<string, DataFormat> = new Map(
  [
    { name: "csv", read: (text: string) => parseDelimited(text, ",") },
    { name: "tsv", read: (text: string) => parseDelimited(text, "\t") },
  ].map((format) => [format.name, format]),
);

/** The format a block language or file extension names, if any. */
export const formatNamed = (name: string | undefined) =>
  name === undefined ? undefined : dataFormats.get(name.toLowerCase());

/** The format of a file, from its extension. */
export const formatOfFile = (path: string) =>
  path.includes(".") ? formatNamed(path.split(".").at(-1)) : undefined;

/** The names, for messages: "csv or tsv". */
export const formatNames = () => {
  const names = [...dataFormats.keys()];
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
};
