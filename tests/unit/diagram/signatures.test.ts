/**
 * Each call's signature: what each call reports for an option or a value it does not take, and
 * that the diagram reference names the same options as the signatures.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compileFigure } from "../../../src/diagram/figure.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import type { Options, Value } from "../../../src/diagram/signature.ts";
import { type CallName, signatures } from "../../../src/diagram/signatures.ts";
import { fixedIcons } from "./fixed-icons.ts";

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;

/** Compile a draw program, as the page compiler does without steps. */
function drawn(draw: (d: DiagramBuilder) => void) {
  return compileFigure({ draw, steps: [], build: false }, { measure, icons: fixedIcons });
}

/** The diagnostics of a draw program as `[code, ids, subject]`. */
function problems(draw: (d: DiagramBuilder) => void) {
  return drawn(draw).diagnostics.map((x) => [x.code, x.ids, x.subject]);
}

/** The codes and subjects of the diagnostics that the signature checks give. */
function checked(draw: (d: DiagramBuilder) => void) {
  return drawn(draw)
    .diagnostics.filter((x) => x.code === "UNKNOWN_OPTION" || x.code === "INVALID_ARGUMENT")
    .map((x) => [x.code, x.subject]);
}

/** A call of `d` by its name, with any arguments. */
type AnyCall = (...args: unknown[]) => unknown;

/** The calls of `d`, each with arguments it takes, before its options. */
const calls: Record<string, (d: DiagramBuilder) => unknown[]> = {
  box: () => ["A"],
  cylinder: () => ["A"],
  io: () => ["A"],
  doc: () => ["A"],
  queue: () => ["A"],
  text: () => ["A"],
  actor: () => ["A"],
  icon: () => ["user", "A"],
  note: () => ["A"],
  decision: () => ["A"],
  start: () => ["A"],
  end: () => ["A"],
  record: () => [["a"]],
  sequence: (d) => [[d.box("P")], []],
  tree: (d) => [d.box("R"), [d.box("L")]],
  frame: () => [
    [0, 0],
    [10, 10],
  ],
  grid: (d) => [[[d.box("G")]]],
  row: (d) => [[d.box("R")]],
  column: (d) => [[d.box("C")]],
  place: (d) => [d.box("A")],
  enclose: (d) => [[d.box("E")]],
  arrow: (d) => [d.box("A"), [0, 100]],
  line: (d) => [d.box("A"), [0, 100]],
  equalSize: (d) => [[d.box("A")]],
  equalWidth: (d) => [[d.box("A")]],
  equalHeight: (d) => [[d.box("A")]],
  xy: () => [
    [0, 0],
    [1, 1],
  ],
  lerp: () => [
    [0, 0],
    [1, 1],
  ],
};

/** The options a call needs to take any other: a placement's form. */
function baseOptions(d: DiagramBuilder, call: string, option: string): Record<string, unknown> {
  if (call !== "place") return {};
  return option === "anchor" ? { at: [0, 0] } : { below: d.box("B") };
}

/** The object of options in a value, or in one of the values it takes. */
function optionsIn(value: Value | undefined): Options | undefined {
  if (value?.kind === "options") return value;
  if (value?.kind === "either") return value.of.map(optionsIn).find(Boolean);
  if (value?.kind === "list" || value?.kind === "names") return optionsIn(value.of);
  if (value?.kind === "tuple") return value.of.map(optionsIn).find(Boolean);
  return;
}

/** A value an option does not take, when it takes one of a list or a number in a range. */
function outside(value: Value): unknown {
  if (value.kind === "oneOf") return "zzz";
  if (value.kind !== "number") return;
  if (value.min !== undefined) return value.min - 1;
  if (value.max !== undefined) return value.max + 1;
  if (value.whole) return 1.5;
}

/** The options argument of a call's signature. */
function callOptions(call: string): Options | undefined {
  const signature = signatures[call as CallName];
  return optionsIn(signature.args.find((a) => a.name === "options")?.takes);
}

test("every call of d has a signature, and every signature of d is a call", () => {
  const methods = ["port", "member", "offset"];
  assert.deepEqual(
    Object.keys(signatures)
      .filter((name) => !methods.includes(name))
      .sort(),
    Object.keys(calls).sort(),
  );
});

for (const [call, before] of Object.entries(calls)) {
  const run = (d: DiagramBuilder, options?: Record<string, unknown>) =>
    (d[call as keyof DiagramBuilder] as AnyCall)(...before(d), ...(options ? [options] : []));
  const takes = callOptions(call);
  if (takes)
    test(`${call}: an option it does not take is UNKNOWN_OPTION, and one out of range INVALID_ARGUMENT`, () => {
      assert.deepEqual(
        checked((d) => run(d, { ...baseOptions(d, call, ""), colour: "red" })),
        [["UNKNOWN_OPTION", "colour"]],
      );
      for (const [option, value] of Object.entries(takes.options)) {
        const bad = outside(value);
        if (bad === undefined) continue;
        assert.deepEqual(
          checked((d) => run(d, { ...baseOptions(d, call, option), [option]: bad })),
          [["INVALID_ARGUMENT", option]],
          `${call} ${option}: ${String(bad)}`,
        );
      }
    });
  test(`${call}: an argument of the wrong kind is INVALID_ARGUMENT, and the draw program goes on`, () => {
    const first = signatures[call as CallName].args[0]?.name;
    const out = drawn((d) => {
      const rest = call === "place" ? [{ at: [0, 0] }] : before(d).slice(1);
      (d[call as keyof DiagramBuilder] as AnyCall)({ wrong: true }, ...rest);
      d.place(d.box("After"), { at: [500, 500] });
    });
    assert.deepEqual(
      out.diagnostics.filter((x) => x.code === "INVALID_ARGUMENT").map((x) => [x.code, x.subject]),
      [["INVALID_ARGUMENT", first]],
    );
    assert.ok(out.nodes.some((n) => n.id === "after"));
  });
}

test("the methods of elements and points check their arguments", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    const r = d.record(["x"]);
    d.row([a, r]);
    d.arrow(a.port("middle" as never, 2), r.member(5 as never));
    d.arrow(a.bottom.offset("8" as never, 0), [0, 200]);
  });
  assert.deepEqual(
    out.diagnostics.map((x) => [x.code, x.ids, x.subject]),
    [
      ["INVALID_ARGUMENT", ["a"], "side"],
      ["INVALID_ARGUMENT", ["a"], "t"],
      ["INVALID_ARGUMENT", ["record-1"], "id"],
      ["INVALID_ARGUMENT", ["a"], "dx"],
    ],
  );
  assert.deepEqual(
    out.edges.map((e) => e.id),
    ["a->record-1", "a->0,200"],
  );
});

test("the old spellings of points, labels, sides, and title corners are reported", () => {
  const removed = (draw: (d: DiagramBuilder) => void) =>
    drawn(draw).diagnostics.map((x) => [x.code, x.message]);
  assert.deepEqual(
    removed((d) => {
      d.place(d.box("A"), { at: (d as unknown as { point: AnyCall }).point(0, 0) as never });
    }),
    [["DRAW_FAILED", "d.point is not a function"]],
  );
  assert.deepEqual(
    removed((d) => {
      const edge = d.arrow(d.box("A"), [0, 100]);
      (edge as unknown as { label: AnyCall }).label("more");
    }),
    [["DRAW_FAILED", "edge.label is not a function"]],
  );
  const old = drawn((d) => {
    const [a, b, c] = [d.box("A"), d.box("B"), d.box("C")];
    d.row([d.start("Go", { side: "left" } as never), a, b, c]);
    d.arrow(a, b, { label: { text: "x", side: "above", at: 0.25 } } as never);
    d.arrow(b, c, { label: ["y", { text: "z", side: "below" }] } as never);
    d.enclose([a], { title: "Group", titleAt: "bottomLeft" } as never);
  }).diagnostics.filter((x) => x.code === "UNKNOWN_OPTION" || x.code === "INVALID_ARGUMENT");
  assert.deepEqual(
    old.map((x) => [x.code, x.ids, x.subject]),
    [
      ["UNKNOWN_OPTION", ["go"], "side"],
      ["UNKNOWN_OPTION", ["a->b"], "label.at"],
      ["INVALID_ARGUMENT", ["a->b"], "label.side"],
      ["INVALID_ARGUMENT", ["b->c"], "label[1].side"],
      ["UNKNOWN_OPTION", ["group"], "titleAt"],
    ],
  );
  assert.deepEqual(
    old.map((x) => x.message),
    [
      "start go: side is not an option. start takes id, sub, role, category, stepOnly, labelSide. It is ignored.",
      "arrow a->b: label.at is not an option. label takes gap, text, segment, along, side. It is ignored.",
      'arrow a->b: label.side is "above", but it takes "top", "bottom", "left", or "right". The default is used.',
      'arrow b->c: label[1].side is "below", but it takes "top", "bottom", "left", or "right". The default is used.',
      "enclose group: titleAt is not an option. enclose takes title, id, titleCorner, padding, role, category, stepOnly. It is ignored.",
    ],
  );
});

test("each row of the item table gives its diagnostic", () => {
  const two = (d: DiagramBuilder) => {
    const a = d.box("A");
    const b = d.box("B");
    d.row([a, b]);
    return [a, b] as const;
  };
  assert.deepEqual(
    problems((d) => {
      d.box("A", { role: "accnt" as never });
    }),
    [["INVALID_ARGUMENT", ["a"], "role"]],
  );
  assert.deepEqual(
    problems((d) => {
      d.row([d.box("A"), d.box("B")], { align: "middle" as never });
    }),
    [["INVALID_ARGUMENT", ["row-1"], "align"]],
  );
  assert.deepEqual(
    problems((d) => {
      const [a, b] = two(d);
      d.arrow(a, b, { head: "hollow", tail: "=>", route: "zigzag" } as never);
    }),
    [
      ["INVALID_ARGUMENT", ["a->b"], "head"],
      ["INVALID_ARGUMENT", ["a->b"], "tail"],
      ["INVALID_ARGUMENT", ["a->b"], "route"],
    ],
  );
  assert.deepEqual(
    problems((d) => {
      const [a, b] = two(d);
      d.line(a, b, { ends: "<->" } as never);
    }),
    [["UNKNOWN_OPTION", ["a->b"], "ends"]],
  );
  assert.deepEqual(
    problems((d) => {
      d.row([d.box("A", { widht: 10 } as never), d.box("B")], { gapp: 3 } as never);
    }),
    [
      ["UNKNOWN_OPTION", ["a"], "widht"],
      ["UNKNOWN_OPTION", ["row-1"], "gapp"],
    ],
  );
  assert.deepEqual(
    problems((d) => {
      const [a, b] = [d.box("A"), d.box("B")];
      d.sequence([a, b], [{ from: a, to: b, label: "x", head: "none", route: "hv" } as never]);
    }),
    [
      ["UNKNOWN_OPTION", ["sequence-1"], "messages[0].head"],
      ["UNKNOWN_OPTION", ["sequence-1"], "messages[0].route"],
    ],
  );
  assert.deepEqual(
    problems((d) => {
      const a = d.box("A");
      d.place(d.box("B"), { below: a, anchor: "top" });
      d.place(d.box("C"), { at: [0, 200], gap: 4 });
    }),
    [
      ["INVALID_ARGUMENT", ["b"], "anchor"],
      ["INVALID_ARGUMENT", ["c"], "gap"],
    ],
  );
  assert.deepEqual(
    problems((d) => {
      const [a, b] = two(d);
      d.arrow(a, b, { route: { loop: "top" } });
      d.arrow(a, a, { route: { bend: 20 } });
    }),
    [
      ["INVALID_ARGUMENT", ["a->b"], "route"],
      ["INVALID_ARGUMENT", ["a->a"], "route"],
    ],
  );
  assert.deepEqual(
    problems((d) => {
      d.column([
        d.record(
          [
            ["a", Number.NaN],
            ["b", 1.6],
          ],
          { columns: 2 },
        ),
        d.box("X"),
      ]);
    }),
    [
      ["INVALID_ARGUMENT", ["record-1"], "cells[0][1]"],
      ["INVALID_ARGUMENT", ["record-1"], "cells[1][1]"],
    ],
  );
  const marks = drawn((d) => {
    d.text("one two", {
      marks: { both: { text: "one", lines: 1 }, neither: { role: "accent" } } as never,
    });
  });
  assert.deepEqual(
    marks.diagnostics.map((x) => [x.code, x.ids, x.subject]),
    [
      ["INVALID_ARGUMENT", ["one-two"], "marks.both.lines"],
      ["INVALID_ARGUMENT", ["one-two"], "marks.neither"],
    ],
  );
  assert.deepEqual(
    marks.nodes.map((n) => n.id),
    ["one-two", "one-two.both"],
  );
});

test("a value of the wrong kind is INVALID_ARGUMENT, and the rest compiles", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    const b = d.box("B");
    const all = d.column([d.row([a, b])]);
    const f = d.frame(a.topLeft, b.bottomRight, { tab: "group" });
    const e = d.enclose([a]);
    const c = d.box("C");
    d.equalSize([c, f as never, e as never]);
    d.tree(f as never, [d.box("Leaf")]);
    d.tree(d.box("Root"), ["leaf" as never, d.box("Twig")]);
    const x = d.box(5 as never);
    const notAList = d.row(7 as never);
    d.sequence("x" as never, "y" as never);
    d.place(d.column([c, x, notAList]), { below: all });
  });
  assert.deepEqual(
    out.diagnostics
      .filter((x) => x.code === "INVALID_ARGUMENT")
      .map((x) => [x.code, x.ids, x.subject]),
    [
      ["INVALID_ARGUMENT", ["group"], "nodes[1]"],
      ["INVALID_ARGUMENT", ["enclosure-1"], "nodes[2]"],
      ["INVALID_ARGUMENT", ["tree", "group"], "root"],
      ["INVALID_ARGUMENT", ["root-tree"], "children[0]"],
      ["INVALID_ARGUMENT", ["node"], "label"],
      ["INVALID_ARGUMENT", ["row-2"], "children"],
      ["INVALID_ARGUMENT", ["sequence-1"], "participants"],
      ["INVALID_ARGUMENT", ["sequence-1"], "messages"],
    ],
  );
  assert.ok(!out.diagnostics.some((x) => x.code === "DRAW_FAILED" || x.code === "DIAGRAM_FAILED"));
});

test("a frame is taken wherever an enclosure is, and positioning it is NOT_PLACEABLE", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    const b = d.box("B");
    const all = d.column([d.row([a, b])]);
    const f = d.frame(a.topLeft.offset(-8, -8), b.bottomRight.offset(8, 8), { tab: "group" });
    const c = d.box("C");
    d.place(c, { below: f });
    d.place(d.box("E"), { at: f.topRight.offset(200, 0) });
    d.enclose([f], { id: "outer", padding: 8 });
    d.arrow(c, f, { route: { viaX: f.right.offset(40, 0) } });
    const g = d.grid([[f, d.box("G")]]);
    const r = d.row([d.box("R"), f]);
    d.place(f, { below: all });
    d.place(d.column([g, r]), { below: c });
  });
  assert.deepEqual(
    out.diagnostics.map((x) => [x.code, x.ids, x.subject]),
    [
      ["NOT_PLACEABLE", ["group"], undefined],
      ["NOT_PLACEABLE", ["group"], undefined],
      ["NOT_PLACEABLE", ["group"], undefined],
      ["ENCLOSURE_INTRUSION", ["a", "outer"], undefined],
      ["ENCLOSURE_INTRUSION", ["b", "outer"], undefined],
    ],
  );
  assert.deepEqual(
    out.diagnostics.slice(0, 3).map((x) => x.message),
    [
      "grid(grid-1) positions group, which is a frame; its bounds come from its corners. Position what its corners name instead.",
      "row(row-2) positions group, which is a frame; its bounds come from its corners. Position what its corners name instead.",
      "place() positions group, which is a frame; its bounds come from its corners. Position what its corners name instead.",
    ],
  );
});

test("two bad options on one shape are two diagnostics with different subjects", () => {
  const out = drawn((d) => {
    d.box("A", { role: "loud" as never, width: -3 });
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "INVALID_ARGUMENT",
      message:
        'box a: role is "loud", but it takes "default", "accent", "muted", "warning", or "external". The default is used.',
      ids: ["a"],
      subject: "role",
    },
    {
      code: "INVALID_ARGUMENT",
      message: "box a: width is -3, but it takes a number of 0 or more. The default is used.",
      ids: ["a"],
      subject: "width",
    },
  ]);
});

test("an unknown option lists the options the call takes, the nearest first", () => {
  const out = drawn((d) => {
    d.place(d.box("A"), { at: [0, 0], ancor: "top" } as never);
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "UNKNOWN_OPTION",
      message:
        "place a: ancor is not an option. place takes anchor, below, above, leftOf, rightOf, gap, align, at. It is ignored.",
      ids: ["a"],
      subject: "ancor",
    },
  ]);
});

test("a place with no form or two forms is INVALID_ARGUMENT", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    d.place(a, {} as never);
    d.place(d.box("B"), { below: a, rightOf: a });
  });
  assert.deepEqual(
    out.diagnostics.map((x) => [x.code, x.subject, x.message]),
    [
      [
        "INVALID_ARGUMENT",
        "options",
        "place a: place has none of below, above, leftOf, rightOf, or at, but it takes one of them. The placement is ignored.",
      ],
      [
        "INVALID_ARGUMENT",
        "rightOf",
        "place b: rightOf is given with below, but place takes only one of below, above, leftOf, rightOf, or at. It is ignored.",
      ],
    ],
  );
});

test("a place without options is INVALID_ARGUMENT, as with empty options", () => {
  const without = drawn((d) => {
    (d.place as AnyCall)(d.box("A"));
  });
  const empty = drawn((d) => {
    d.place(d.box("A"), {} as never);
  });
  assert.deepEqual(without.diagnostics, empty.diagnostics);
  assert.deepEqual(
    without.diagnostics.map((x) => [x.code, x.ids, x.subject]),
    [["INVALID_ARGUMENT", ["a"], "options"]],
  );
});

test("a ruler label that throws or is not text or a number is INVALID_ARGUMENT and empty", () => {
  const good = drawn((d) => {
    d.column([
      d.record(["a", "b"], { columns: 2, ruler: { top: (i) => (i ? "" : "0"), left: () => "" } }),
      d.box("X"),
    ]);
  });
  const out = drawn((d) => {
    const top = (i: number) => {
      if (i === 1) throw new Error("boom");
      return "0";
    };
    const left = (() => ({})) as never;
    d.column([d.record(["a", "b"], { columns: 2, ruler: { top, left } }), d.box("X")]);
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "INVALID_ARGUMENT",
      message:
        'record record-1: ruler.top gives no label for column 1: it threw "boom". A ruler label is text or a number, so the label is empty.',
      ids: ["record-1"],
      subject: "ruler.top",
    },
    {
      code: "INVALID_ARGUMENT",
      message:
        "record record-1: ruler.left gives no label for row 0: it returned {}. A ruler label is text or a number, so the label is empty.",
      ids: ["record-1"],
      subject: "ruler.left",
    },
  ]);
  assert.deepEqual(
    out.nodes.map((n) => n.id),
    good.nodes.map((n) => n.id),
  );
  assert.deepEqual(
    out.nodes.find((n) => n.id === "record-1")?.rect.width,
    good.nodes.find((n) => n.id === "record-1")?.rect.width,
  );
});

test("an option that has no effect in its form is INVALID_ARGUMENT, and the figure is unchanged", () => {
  const plain = drawn((d) => {
    const s = d.start();
    const b = d.box("B");
    d.row([s, b]);
    d.enclose([b]);
    d.line(s, b);
    d.tree(d.box("R"), [d.box("L")], { layout: "indent" });
    d.sequence([d.box("P")], [{ from: d.box("P"), to: d.box("P"), label: "x" }]);
  });
  const out = drawn((d) => {
    const s = d.start("", { labelSide: "left" });
    const b = d.box("B");
    d.row([s, b]);
    d.enclose([b], { titleCorner: "topRight" });
    d.tree(d.box("R"), [d.box("L")], { layout: "indent", levelGap: 4 });
    d.sequence([d.box("P")], [{ from: d.box("P"), to: d.box("P"), label: "x", reply: true }]);
  });
  assert.deepEqual(
    out.diagnostics.filter((x) => x.code === "INVALID_ARGUMENT").map((x) => [x.ids, x.subject]),
    [
      [["start-1"], "labelSide"],
      [["enclosure-1"], "titleCorner"],
      [["r-tree"], "levelGap"],
    ],
  );
  const one = drawn((d) => {
    const p = d.box("P");
    d.sequence([p], [{ from: p, to: p, label: "x", reply: true }]);
  });
  assert.deepEqual(
    one.diagnostics.map((x) => [x.code, x.subject, x.message]),
    [
      [
        "INVALID_ARGUMENT",
        "messages[0].reply",
        "sequence sequence-1: messages[0].reply is true, but a message from a participant to itself is drawn as a call. It is ignored.",
      ],
    ],
  );
  assert.deepEqual(
    out.nodes.map((n) => n.rect),
    plain.nodes.map((n) => n.rect),
  );
});

/** The directory of the repository. */
const root = path.join(import.meta.dirname, "../../..");

/** The text of a reference page. */
function page(name: string): string {
  return readFileSync(path.join(root, "starter/docs", name), "utf8");
}

/** The lines under a heading, up to the next heading of the same or a higher level. */
function section(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  assert.ok(start >= 0, `no heading ${heading}`);
  const level = heading.indexOf(" ");
  const end = lines.findIndex(
    (line, i) => i > start && /^#+ /.test(line) && line.indexOf(" ") <= level,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

/** The tables in a text, as their header cells and their rows of cells. */
function tables(text: string): Array<{ header: string[]; rows: string[][] }> {
  const cells = (line: string) =>
    line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
  const found: Array<{ header: string[]; rows: string[][] }> = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!line.startsWith("|") || !lines[i + 1]?.startsWith("|---")) return;
    const rows: string[][] = [];
    for (let j = i + 2; lines[j]?.startsWith("|"); j++) rows.push(cells(lines[j] ?? ""));
    found.push({ header: cells(line), rows });
  });
  return found;
}

/** The text of each code span in a cell. */
function codes(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map(([, code = ""]) => code);
}

/** The names an object written in the reference has, such as `{ text, side?, along: 0.5 }`. */
function names(object: string): string[] {
  const body = object.slice(object.indexOf("{") + 1, object.lastIndexOf("}"));
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of body) {
    if ("{[(".includes(char)) depth++;
    if ("}])".includes(char)) depth--;
    if (char === "," && depth === 0) {
      parts.push(part);
      part = "";
    } else part += char;
  }
  parts.push(part);
  return parts.map((p) => /^\s*(\w+)/.exec(p)?.[1] ?? "").filter(Boolean);
}

/** The options a reference table names, by the calls it names them for. */
function optionTable(
  text: string,
  shapes: readonly string[] = [],
): Array<{ option: string; calls: string[] | undefined }> {
  const table = tables(text).find((t) => t.header[0] === "Option");
  assert.ok(table, "no table of options");
  const scoped = table.header[1] === "Calls" || table.header[1] === "Shapes";
  return table.rows.flatMap((row) => {
    const cell = row[1] ?? "";
    const but = codes(cell.split(" but ")[1] ?? "");
    const calls = !scoped
      ? undefined
      : cell.startsWith("all")
        ? shapes.filter((s) => !but.includes(s))
        : codes(cell);
    return codes(row[0] ?? "").map((option) => ({ option, calls }));
  });
}

/** The options each call takes, by the reference: call name to option names. */
function documented(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (call: string, option: string) => {
    const set = out.get(call) ?? new Set<string>();
    set.add(option);
    out.set(call, set);
  };
  const diagrams = page("diagrams.md");
  const shapesSection = section(diagrams, "## Shapes");
  const shapeCalls = (tables(shapesSection)[0]?.rows ?? [])
    .flatMap((row) => codes(row[0] ?? ""))
    .filter((name) => name !== "record");
  const tablesFor = [
    { text: shapesSection, calls: shapeCalls },
    { text: section(diagrams, "## Layout"), calls: [] },
    { text: section(diagrams, "## Edges"), calls: ["arrow", "line"] },
    { text: section(diagrams, "## Frames"), calls: ["frame"] },
    { text: section(page("diagram-structures.md"), "### Record options"), calls: ["record"] },
    { text: section(page("diagram-sequences.md"), "## Reference"), calls: ["sequence"] },
    { text: section(page("diagram-trees.md"), "## Reference"), calls: ["tree"] },
  ];
  for (const { text, calls } of tablesFor)
    for (const { option, calls: scoped } of optionTable(text, calls))
      for (const call of scoped ?? calls) add(call, option);
  return out;
}

test("the reference's option tables name exactly the options each call takes", () => {
  const reference = documented();
  for (const call of Object.keys(calls)) {
    const takes = Object.keys(callOptions(call)?.options ?? {}).sort();
    assert.deepEqual([...(reference.get(call) ?? [])].sort(), takes, `d.${call}`);
  }
});

test("the reference names exactly the options of labels, routes, cells, marks, and entries", () => {
  const diagrams = page("diagrams.md");
  const edges = section(diagrams, "## Edges");
  const structures = page("diagram-structures.md");
  const sequences = section(page("diagram-sequences.md"), "## Reference");
  const trees = section(page("diagram-trees.md"), "## Reference");
  const treeChildren = signatures.tree.args[1]?.takes;
  const treeChild = treeChildren?.kind === "list" ? treeChildren.of : undefined;
  const branch = treeChild?.kind === "either" ? optionsIn(treeChild.of[2]) : undefined;
  const childTable = tables(trees)[1]?.rows ?? [];
  const edgeOptions = callOptions("arrow")?.options ?? {};
  const sequenceArgs = signatures.sequence.args[1]?.takes;
  const entry = sequenceArgs?.kind === "list" ? sequenceArgs.of : undefined;
  const entryForms = entry?.kind === "either" ? entry.of.flatMap((s) => optionsIn(s) ?? []) : [];
  const fragment = entryForms[2];
  const recordOptions = callOptions("record")?.options ?? {};
  const frameOptions = callOptions("frame")?.options ?? {};
  const cell = signatures.record.args[0]?.takes;
  const cellForms = cell?.kind === "list" && cell.of.kind === "either" ? cell.of.of : [];
  const textMarks = callOptions("text")?.options.marks;
  const keys = (value: Value | undefined) => Object.keys(optionsIn(value)?.options ?? {}).sort();
  const sorted = (list: string[]) => [...new Set(list)].sort();
  const entryTable = tables(sequences).find((t) => t.header[0] === "Entry")?.rows ?? [];
  const row = (rows: string[][], first: string) => rows.find((r) => codes(r[0] ?? "")[0] === first);
  const edgeTable = tables(edges)[0]?.rows ?? [];
  const pairs: Array<[string, string[], string[]]> = [
    [
      "edge label",
      names(/A label is a string or `([^`]+)`/.exec(edges)?.[1] ?? ""),
      keys(edgeOptions.label),
    ],
    [
      "route forms",
      codes(row(edgeTable, "route")?.[1] ?? "")
        .filter((c) => c.startsWith("{"))
        .flatMap(names),
      edgeOptions.route?.kind === "either"
        ? edgeOptions.route.of.flatMap((v) => (v.kind === "options" ? Object.keys(v.options) : []))
        : [],
    ],
    [
      "cell",
      names(codes(tables(section(structures, "### Cells"))[0]?.rows[2]?.[0] ?? "")[0] ?? ""),
      keys(cellForms[2]),
    ],
    [
      "mark",
      (tables(section(structures, "### Marks"))[0]?.rows ?? [])
        .flatMap((r) => codes(r[0] ?? ""))
        .filter((c) => c.startsWith("{"))
        .flatMap(names),
      keys(textMarks),
    ],
    [
      "ruler",
      names(
        codes(
          row(tables(section(structures, "### Record options"))[0]?.rows ?? [], "ruler")?.[1] ?? "",
        )[0] ?? "",
      ),
      keys(recordOptions.ruler),
    ],
    ...entryForms
      .slice(0, 3)
      .map((form, i): [string, string[], string[]] => [
        `sequence entry ${i + 1}`,
        names(codes(entryTable[i]?.[0] ?? "")[0] ?? ""),
        Object.keys(form.options),
      ]),
    [
      "fragment branch",
      names(codes(entryTable[3]?.[0] ?? "")[0] ?? ""),
      keys(fragment?.options.else),
    ],
    [
      "tree edge",
      names(codes(row(tables(trees)[0]?.rows ?? [], "edge")?.[1] ?? "")[0] ?? ""),
      keys(optionsIn(signatures.tree.args[2]?.takes)?.options.edge),
    ],
    ["tree branch", names(codes(childTable[2]?.[0] ?? "")[0] ?? ""), keys(branch)],
    [
      "tree branch edge",
      names(codes(childTable[2]?.[1] ?? "").find((c) => c.startsWith("{")) ?? ""),
      keys(branch?.options.edge),
    ],
    [
      "frame divider",
      names(
        codes(
          row(tables(section(diagrams, "## Frames"))[0]?.rows ?? [], "dividers")?.[1] ?? "",
        )[0] ?? "",
      ),
      keys(frameOptions.dividers),
    ],
  ];
  for (const [what, reference, statement] of pairs) {
    assert.ok(statement.length > 0, `${what} has a statement`);
    assert.deepEqual(sorted(reference), sorted(statement), what);
  }
});

test("every option object written after a call in the reference is one the call takes", () => {
  const text = readdirSync(path.join(root, "starter/docs"))
    .filter((f) => /^diagram.*\.md$/.test(f))
    .map(page)
    .join("\n");
  const written = [...text.matchAll(/d\.(\w+)\(([^\n`]*?)(\{[^{}\n`]*\})\s*\)/g)];
  assert.ok(written.length > 20);
  for (const [whole, call = "", , object = ""] of written) {
    const takes = callOptions(call);
    if (!takes) continue;
    for (const name of names(object))
      assert.ok(Object.hasOwn(takes.options, name), `${whole}: d.${call} takes no ${name}`);
  }
});

/** Every draw program in the documents: the reference, the design pages, and the fixtures. */
function figures(): Array<{ at: string; draw: string }> {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.mdx?$/.test(name)) files.push(file);
    }
  };
  for (const dir of ["starter/docs", "docs/design", "tests/fixtures"]) walk(path.join(root, dir));
  return files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    const programs = [
      ...[...text.matchAll(/draw=\{\(d\) => \{\n([\s\S]*?)\n\}\}/g)].map(([, p = ""]) => p),
      ...(/diagram.*\.md$/.test(file)
        ? [...text.matchAll(/```js\n([\s\S]*?)```/g)].map(([, p = ""]) => p)
        : []),
    ];
    return programs.map((draw, i) => ({ at: `${path.relative(root, file)} #${i + 1}`, draw }));
  });
}

test("every figure in the documents uses only options and values its calls take", () => {
  const all = figures();
  assert.ok(all.length > 50);
  for (const { at, draw } of all) {
    const out = drawn(new Function("d", draw) as (d: DiagramBuilder) => void);
    assert.deepEqual(
      out.diagnostics.filter((x) => x.code === "UNKNOWN_OPTION" || x.code === "INVALID_ARGUMENT"),
      [],
      at,
    );
  }
});
