/**
 * The formats a chart reads its data from. A format turns text into a header and rows of cell
 * text, each row with the line it starts on; typing the columns is shared by every format (see
 * `typeTable`). A format is named by the language of a block of data inside `<Chart>` and by
 * the extension of a file, so adding one here is all it takes for both.
 */
import { type DataIssue, parseDelimited, type RawTable } from "./data.ts";

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
