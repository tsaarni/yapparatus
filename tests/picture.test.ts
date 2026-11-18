/**
 * The picture writer draws a compiled figure as a standalone SVG: every shape the web app draws,
 * step-only elements left out, and the id overlay.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramBuilder } from "../src/diagram/builder.ts";
import { compileFigure, type Figure } from "../src/diagram/figure.ts";
import type { Measure } from "../src/diagram/metrics.ts";
import { type PictureOptions, pictureOf } from "../src/diagram/picture.ts";
import { fontMeasure, textOutline } from "../src/font-measure.ts";
import { lightPaint } from "../src/server/theme-values.ts";

const lightColors = lightPaint.colors;

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;
/** Each text as a marker path, so tests can find where text is drawn. */
const outline = (text: string, _font: unknown, x: number, y: number) => `M${x} ${y}h${text.length}`;

function draw(figure: Figure, options: PictureOptions = {}) {
  const drawing = compileFigure(figure, measure);
  assert.equal(drawing.ok, true, JSON.stringify(drawing.diagnostics));
  return pictureOf(drawing, options, { measure, outline }, lightPaint);
}

/** The ids of the elements a picture draws. */
function elements(svg: string): string[] {
  return [...svg.matchAll(/<g data-element-id="([^"]+)" data-shape="[^"]+">/g)].map((m) =>
    (m[1] as string).replace(/&gt;/g, ">"),
  );
}

/** Every element is closed: a cheap check that the SVG is well formed. */
function assertWellFormed(svg: string) {
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  const stack: string[] = [];
  for (const [tag, close, name, self] of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (self) continue;
    if (close) assert.equal(stack.pop(), name, `unexpected ${tag}`);
    else stack.push(name as string);
  }
  assert.deepEqual(stack, []);
}

const everything = (d: DiagramBuilder) => {
  const user = d.actor("User", { role: "external" });
  const api = d.box("API", { role: "accent" });
  const db = d.cylinder("Database", { category: "New" });
  const ok = d.decision("Found?");
  const begin = d.start();
  const stop = d.end();
  const remark = d.note("Cached", { role: "warning" });
  d.row([begin, user, api, db, ok, stop]);
  d.place(remark, { below: api, gap: 40 });
  d.enclose([api, db], { title: "Backend" });
  d.arrow(begin, user);
  d.arrow(user, api, "call");
  d.arrow(api, db, { label: "two\nlines", dashed: true });
  d.arrow(db, ok);
  d.line(ok, stop);
  const header = d.record(
    [
      ["Port", 16],
      ["Flags", { span: 8, pin: 1, role: "warning" }],
      ["Window", 8],
    ],
    { title: "Header", columns: 32, id: "header" },
  );
  const request = d.text("GET /items HTTP/1.1", {
    mono: true,
    id: "req",
    marks: { path: { text: "/items", category: "Path" } },
  });
  d.place(header, { below: remark, gap: 40 });
  d.place(request, { below: header, gap: 40 });
  const a = d.box("A");
  const b = d.box("B");
  const sequence = d.sequence(
    [a, b],
    [
      { fragment: "loop", title: "each", steps: [{ from: a, to: b, label: "ask" }] },
      { from: b, to: a, label: "answer", reply: true },
    ],
  );
  d.place(sequence, { below: request, gap: 40 });
};

test("the picture is well formed and draws every shape the figure has", () => {
  const { svg, width, height } = draw({ draw: everything, steps: [], build: false });
  assertWellFormed(svg);
  assert.ok(width > 0 && height > 0);
  const shapes = new Set([...svg.matchAll(/data-shape="([^"]+)"/g)].map((m) => m[1]));
  for (const shape of [
    "actor",
    "box",
    "cylinder",
    "diamond",
    "dot",
    "ring",
    "note",
    "record",
    "cell",
    "text",
    "mark",
    "bar",
    "edge",
    "enclosure",
    "frame",
  ])
    assert.ok(shapes.has(shape), `no ${shape}`);
  // Colors are written into the picture: the accent ink, a category fill, the warning badge.
  assert.match(svg, new RegExp(`stroke="${lightColors.accent}"`));
  assert.match(svg, new RegExp(`fill="${lightColors.category1Surface}"`));
  assert.match(svg, new RegExp(`fill="${lightColors.warning}"`));
  // A dashed edge, the record's clip path for its cells, and the lifelines.
  assert.match(svg, /stroke-dasharray="5 4"/);
  assert.match(svg, /<clipPath id="clip0">/);
  assert.match(svg, /clip-path="url\(#clip0\)"/);
  assert.match(svg, /stroke-dasharray="2 3"/);
  // The edge label's two lines, each with a halo behind it.
  assert.match(svg, /stroke-width="5"[^>]*\/><path d="M[\d.]+ [\d.]+h3"/);
  // Categories get a legend under the drawing, which makes the picture taller.
  assert.match(svg, /<g data-layer="legend">/);
  assert.ok(
    height > compileFigure({ draw: everything, steps: [], build: false }, measure).viewBox.height,
  );
});

const flow: Figure = {
  draw: (d) => {
    const a = d.box("A");
    const b = d.box("B");
    const c = d.box("C");
    d.row([a, b, c]);
    d.arrow(a, b);
    d.arrow(b, c);
    d.place(d.note("Only now", { id: "aside", stepOnly: true }), { below: b });
  },
  steps: [{ focus: ["a"] }, { focus: ["b", "a->b", "aside"] }, { focus: ["c", "b->c"] }],
  build: true,
};

test("every element is drawn plainly, and step-only elements are left out", () => {
  const { svg } = draw(flow);
  assert.deepEqual(elements(svg).sort(), ["a", "a->b", "b", "b->c", "c"]);
  assert.doesNotMatch(svg, /opacity=/);
});

test("the id overlay labels each element and outlines the elements diagnostics name", () => {
  const overlap: Figure = {
    draw: (d) => {
      const a = d.box("A");
      const b = d.box("B");
      d.place(b, { at: a.center });
    },
    steps: [],
    build: false,
  };
  const plain = draw(overlap).svg;
  assert.doesNotMatch(plain, /data-layer="ids"/);
  const { svg } = draw(overlap, { ids: true });
  const layer = /<g data-layer="ids">(.*?)<\/g>/s.exec(svg)?.[1] ?? "";
  // One label per element, in the error color: each id's text is drawn.
  assert.equal([...layer.matchAll(new RegExp(`fill="${lightColors.error}"`, "g"))].length, 2);
  assert.match(svg, new RegExp(`stroke="${lightColors.warning}"[^>]*stroke-dasharray="2 3"`));
});

test("text is drawn as outlines from the web app's font files", () => {
  const { measure: fontWidth } = fontMeasure();
  const figure: Figure = { draw: (d) => void d.box("Outline"), steps: [], build: false };
  const drawing = compileFigure(figure, fontWidth);
  const { svg } = pictureOf(drawing, {}, { measure: fontWidth, outline: textOutline }, lightPaint);
  assert.doesNotMatch(svg, /<text/);
  // The label is glyph outlines: a path with curves.
  assert.match(svg, /<path d="M[^"]*Q[^"]*" fill="#11141b"\/>/);
});
