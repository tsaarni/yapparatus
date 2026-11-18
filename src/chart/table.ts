/**
 * A chart's data, read when the page is compiled: from a block of data inside `<Chart>`, or
 * from a file in an external directory. A data format splits the text into cells (see
 * `formats.ts`), and each column then gets one type from all of its cells. Shared by the
 * compiler (Node) and the chart (browser); it imports nothing.
 */

export type ColumnType = "number" | "date" | "text";

export interface ChartColumn {
  /** The header as written: the field name in `plot`, and the axis label. */
  name: string;
  type: ColumnType;
}

/**
 * A chart's data, by column. Data written in the page is carried in the page as `data`; a
 * file's chart loads it from its own module, so a large file never weighs on the page. Cells
 * stay JSON: dates as ISO text.
 */
export interface ChartData {
  columns: ChartColumn[];
  /** One array per column, in column order, with a cell for each row. An empty cell is null. */
  values: (number | string | null)[][];
}

export const rowCount = (data: ChartData) => data.values[0]?.length ?? 0;

/** A problem in the data, with the line it is on. */
export interface DataIssue {
  line: number;
  subject: string;
  message: string;
}

/**
 * Data before typing, as a format reads it: the header, then the text of each row's cells,
 * with the line the row starts on, so a problem is reported where it is.
 */
export interface RawTable {
  header: string[];
  /** Where the header is, for problems with it. */
  headerLine: number;
  rows: { cells: string[]; line: number }[];
}

const number = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
/** ISO 8601 dates, by month or day, with an optional time and zone. */
const date = /^\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;

function typeOf(cell: string): ColumnType {
  if (number.test(cell)) return "number";
  if (date.test(cell)) return "date";
  return "text";
}

/**
 * Give each column one type and convert its cells. A column whose cells are all numbers is a
 * number column, all ISO dates a date column, and anything else text. A column that mixes
 * numbers or dates with other text is a problem, never quietly text: "12 ms" in a column of
 * numbers means the unit belongs in the header.
 */
export function typeTable(table: RawTable): { data: ChartData; issues: DataIssue[] } {
  const issues: DataIssue[] = [];
  const seen = new Set<string>();
  table.header.forEach((name, i) => {
    if (!name)
      issues.push({
        line: table.headerLine,
        subject: `column ${i + 1}`,
        message: `Column ${i + 1} has no name. Each column needs a header: it is the field name and the axis label.`,
      });
    else if (seen.has(name))
      issues.push({
        line: table.headerLine,
        subject: name,
        message: `Two columns are named "${name}". Column names must differ, because plot names fields by them.`,
      });
    seen.add(name);
  });
  const width = table.header.length;
  for (const row of table.rows)
    if (row.cells.length !== width)
      issues.push({
        line: row.line,
        subject: `line ${row.line}`,
        message: `This row has ${row.cells.length} cells, and the header has ${width}.`,
      });
  const columns: ChartColumn[] = table.header.map((name, i) => {
    const cells = table.rows
      .map((row) => ({ text: (row.cells[i] ?? "").trim(), line: row.line }))
      .filter((cell) => cell.text);
    const types = new Set(cells.map((cell) => typeOf(cell.text)));
    if (types.size <= 1) return { name, type: types.values().next().value ?? "text" };
    // The type most cells share is what the column means; the others are the problem.
    const count = (type: ColumnType) => cells.filter((c) => typeOf(c.text) === type).length;
    const meant = (["number", "date", "text"] as const).reduce((a, b) =>
      count(b) > count(a) ? b : a,
    );
    const odd = cells.find((cell) => typeOf(cell.text) !== meant) ?? cells[0];
    const advice =
      meant === "text"
        ? "Write every cell of the column as text, or every one as a number or an ISO date."
        : meant === "number"
          ? "Write plain numbers, such as 1200 or 0.5, and put a unit in the header."
          : "Write ISO dates, such as 2026-01 or 2026-01-31.";
    issues.push({
      line: odd?.line ?? table.headerLine,
      subject: `${name}: ${odd?.text ?? ""}`,
      message: `"${odd?.text}" in column "${name}" is not ${meant === "text" ? "text like the other cells" : meant === "number" ? "a number like the other cells" : "an ISO date like the other cells"}. ${advice}`,
    });
    return { name, type: "text" };
  });
  const values = columns.map((column, i) =>
    table.rows.map((row) => {
      const text = (row.cells[i] ?? "").trim();
      if (!text) return null;
      return column.type === "number" ? Number(text) : text;
    }),
  );
  return { data: { columns, values }, issues };
}

/**
 * Split delimited text, such as CSV or TSV, into a table, as RFC 4180 reads it: a cell in double quotes may hold
 * the separator, line breaks, and doubled quotes. The first record is the header, and each
 * record keeps the line it starts on. Blank lines are skipped.
 */
export function parseDelimited(text: string, separator: "," | "\t"): RawTable | DataIssue {
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let touched = false;
  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRecord = () => {
    endCell();
    if (touched || cells.some((c) => c !== "")) records.push({ cells, line: start });
    cells = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
      touched = true;
    } else if (char === separator) {
      endCell();
      touched = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      start = line;
    } else cell += char;
  }
  if (quoted) return { line: start, subject: "quote", message: "A quoted cell is never closed." };
  if (cell !== "" || cells.length) endRecord();
  const [header, ...rows] = records;
  if (!header) return { line: 1, subject: "empty", message: "The file has no header row." };
  return { header: header.cells.map((c) => c.trim()), headerLine: header.line, rows };
}

/** Rows as objects, as `plot` receives them: dates become `Date`, and empty cells null. */
export function rowObjects(data: ChartData): Record<string, number | string | Date | null>[] {
  const rows: Record<string, number | string | Date | null>[] = [];
  for (let r = 0; r < rowCount(data); r++) {
    const row: Record<string, number | string | Date | null> = {};
    data.columns.forEach((column, i) => {
      const cell = data.values[i]?.[r] ?? null;
      row[column.name] =
        column.type === "date" && typeof cell === "string"
          ? new Date(cell.includes(" ") ? cell.replace(" ", "T") : cell)
          : cell;
    });
    rows.push(row);
  }
  return rows;
}
