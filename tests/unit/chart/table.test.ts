import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDelimited, type RawTable, rowObjects, typeTable } from "../../../src/chart/table.ts";

const table = (header: string[], ...rows: string[][]): RawTable => ({
  header,
  headerLine: 1,
  rows: rows.map((cells, i) => ({ cells, line: i + 2 })),
});

test("each column gets one type from all of its cells", () => {
  const { data, issues } = typeTable(
    table(["Month", "Service", "p99 (ms)"], ["2026-01", "Search", "90"], ["2026-02", "", "1.5e2"]),
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(data.columns, [
    { name: "Month", type: "date" },
    { name: "Service", type: "text" },
    { name: "p99 (ms)", type: "number" },
  ]);
  assert.deepEqual(data.values, [
    ["2026-01", "2026-02"],
    ["Search", null],
    [90, 150],
  ]);
  const [first] = rowObjects(data);
  assert.deepEqual(first?.Month, new Date("2026-01-01T00:00:00.000Z"));
});

test("a unit in a number column is reported at its line, not read as text", () => {
  const { data, issues } = typeTable(table(["ms"], ["12"], ["15 ms"], ["9"]));
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.line, 3);
  assert.match(
    issues[0]?.message ?? "",
    /"15 ms" in column "ms" is not a number.*unit in the header/,
  );
  assert.equal(data.columns[0]?.type, "text");
});

test("headers must name each column once, and rows must have the header's cells", () => {
  const { issues } = typeTable(table(["a", "a", ""], ["1", "2"]));
  assert.deepEqual(
    issues.map((i) => i.subject),
    ["a", "column 3", "line 2"],
  );
});

test("CSV keeps quoted separators, quotes, and line breaks, and each record's first line", () => {
  const parsed = parseDelimited(
    'name,note\n"Smith, J","said ""hi"""\n\nx,"two\nlines"\ny,z\n',
    ",",
  );
  assert.ok(!("message" in parsed));
  assert.deepEqual(parsed.header, ["name", "note"]);
  assert.deepEqual(parsed.rows, [
    { cells: ["Smith, J", 'said "hi"'], line: 2 },
    { cells: ["x", "two\nlines"], line: 4 },
    { cells: ["y", "z"], line: 6 },
  ]);
  const tsv = parseDelimited("a\tb\r\n1\t2\r\n", "\t");
  assert.ok(!("message" in tsv));
  assert.deepEqual(tsv.rows, [{ cells: ["1", "2"], line: 2 }]);
  assert.ok("message" in parseDelimited('a\n"open', ","));
});
