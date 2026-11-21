/**
 * The picture writer draws a compiled figure as a standalone SVG: every shape the web app draws,
 * step-only elements left out, and the id overlay.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fontMeasure, textOutline } from "../../../src/compiler/font-measure.ts";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compileFigure, type Figure } from "../../../src/diagram/figure.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import { type PictureOptions, pictureOf } from "../../../src/diagram/picture.ts";
import { lightPaint } from "../../../src/server/theme-values.ts";
import { fixedIcons } from "./fixed-icons.ts";

const lightColors = lightPaint.colors;

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;
const lookups = { measure, icons: fixedIcons };
/** Each text as a marker path, so tests can find where text is drawn. */
const outline = (text: string, _font: unknown, x: number, y: number) => `M${x} ${y}h${text.length}`;

/** Compile a figure, which must have no errors, and write its picture in the light theme. */
function draw(figure: Figure, options: PictureOptions = {}) {
  const drawing = compileFigure(figure, lookups);
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
  const flow = d.row([d.io("Upload"), d.doc("Report"), d.queue("Events")]);
  d.place(flow, { below: sequence, gap: 40 });
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
    "io",
    "doc",
    "queue",
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
  assert.match(svg, new RegExp(`stroke="${lightColors.accent}"`));
  assert.match(svg, new RegExp(`fill="${lightColors.category1Surface}"`));
  assert.match(svg, new RegExp(`fill="${lightColors.warning}"`));
  assert.match(svg, /stroke-dasharray="5 4"/);
  assert.match(svg, /<clipPath id="clip0">/);
  assert.match(svg, /clip-path="url\(#clip0\)"/);
  assert.match(svg, /stroke-dasharray="2 3"/);
  assert.match(svg, /stroke-width="5"[^>]*\/><path d="M[\d.]+ [\d.]+h3"/);
  assert.match(svg, /<g data-layer="legend">/);
  assert.ok(
    height > compileFigure({ draw: everything, steps: [], build: false }, lookups).viewBox.height,
  );
});

test("each end of an edge draws its own head: filled as a polygon, open as a polyline", () => {
  const { svg } = draw({
    draw: (d) => {
      const a = d.box("A");
      const b = d.box("B");
      d.row([a, b]);
      d.arrow(a, b, { id: "mixed", head: "open", tail: "filled" });
      d.line(a.bottom, b.bottom, { id: "plain", route: { viaY: 80 } });
    },
    steps: [],
    build: false,
  });
  const body = (id: string) =>
    svg.match(new RegExp(`data-element-id="${id}"[^>]*>(.*?)</g>`))?.[1] ?? "";
  assert.deepEqual(
    [...body("mixed").matchAll(/<(polyline|polygon)/g)].map((m) => m[1]),
    ["polyline", "polygon"],
  );
  assert.doesNotMatch(body("plain"), /<poly/);
});

test("a box's icon draws in its label's color, and an icon shape's in its ink, as an actor", () => {
  const { svg } = draw({
    draw: (d) => {
      const db = d.box("Ledger", { icon: "database", role: "accent", category: "New" });
      const user = d.icon("user", "Reader", { role: "muted" });
      const server = d.icon("server", "Host", { role: "accent" });
      const store = d.icon("database", "Store", { category: "New" });
      d.row([db, user, server, store]);
      d.arrow(user, db);
    },
    steps: [],
    build: false,
  });
  assertWellFormed(svg);
  const icons = [
    ...svg.matchAll(
      /<svg x="([\d.]+)" y="([\d.]+)" width="(\d+)" height="(\d+)" viewBox="0 0 24 24" color="([^"]+)">(.*?)<\/svg>/g,
    ),
  ];
  assert.deepEqual(
    icons.map((m) => [m[3], m[4], m[5], m[6]]),
    [
      ["18", "18", lightColors.text, fixedIcons.body("database")],
      ["30", "30", lightColors.borderStrong, fixedIcons.body("user")],
      ["30", "30", lightColors.accent, fixedIcons.body("server")],
      ["30", "30", lightColors.category1, fixedIcons.body("database")],
    ],
  );
  assert.match(svg, new RegExp(`<path d="M[^"]*" fill="${lightColors.textMuted}"/>`));
});

test("a stack draws its boxes or pages from the back, each over a cover of the figure's color", () => {
  const stacks: Figure = {
    draw: (d) => {
      const pods = d.box("Pods", { replicas: 3, role: "muted" });
      const reports = d.doc("Reports", { replicas: 2, category: "New" });
      d.row([pods, reports]);
      d.arrow(pods, reports);
    },
    steps: [],
    build: false,
  };
  const { svg } = draw(stacks);
  assertWellFormed(svg);
  const body = (id: string) =>
    new RegExp(`<g data-element-id="${id}" data-shape="[^"]+">(.*?)</g>`, "s").exec(svg)?.[1] ?? "";
  const pods = body("pods");
  const xs = [...pods.matchAll(/<rect x="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(xs, [10, 10, 5, 5, 0, 0], "back to front, each over its cover");
  const covers = new RegExp(`<rect[^>]*fill="${lightColors.surface}" stroke="none"`, "g");
  assert.equal([...pods.matchAll(covers)].length, 3);
  const pages = [...body("reports").matchAll(/<path d="M[^"]*C[^"]*"([^>]*)\/>/g)];
  assert.equal(pages.length, 4);
  assert.match(pages[1]?.[1] ?? "", new RegExp(`fill="${lightColors.category1Surface}"`));
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
  assert.equal([...layer.matchAll(new RegExp(`fill="${lightColors.error}"`, "g"))].length, 2);
  assert.match(svg, new RegExp(`stroke="${lightColors.warning}"[^>]*stroke-dasharray="2 3"`));
});

test("text is drawn as outlines from the web app's font files", () => {
  const { measure: fontWidth } = fontMeasure();
  const figure: Figure = { draw: (d) => void d.box("Outline"), steps: [], build: false };
  const drawing = compileFigure(figure, { measure: fontWidth, icons: fixedIcons });
  const { svg } = pictureOf(drawing, {}, { measure: fontWidth, outline: textOutline }, lightPaint);
  assert.doesNotMatch(svg, /<text/);
  assert.match(svg, /<path d="M[^"]*Q[^"]*" fill="#11141b"\/>/);
});
