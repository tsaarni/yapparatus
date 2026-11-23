/**
 * The picture writer draws a compiled figure as a standalone SVG: every shape the web app draws,
 * step-only elements left out, and the id overlay.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fontMeasure, textOutline } from "../../../src/compiler/font-measure.ts";
import { lightPaint } from "../../../src/compiler/theme-values.ts";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compileFigure, type Figure } from "../../../src/diagram/figure.ts";
import { type PictureOptions, pictureOf } from "../../../src/diagram/picture.ts";
import type { Measure } from "../../../src/figure/font.ts";
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
      { fragment: "loop", title: "each", messages: [{ from: a, to: b, label: "ask" }] },
      { from: b, to: a, label: "answer", reply: true },
    ],
  );
  d.place(sequence, { below: request, gap: 40 });
  const flow = d.row([d.io("Upload"), d.doc("Report"), d.queue("Events")]);
  d.place(flow, { below: sequence, gap: 40 });
};

test("a decision, a start, and an end have their calls' names and draw as before", () => {
  const drawing = compileFigure(
    { draw: (d) => void d.row([d.start(), d.decision("Ok?"), d.end()]), steps: [], build: false },
    lookups,
  );
  assert.deepEqual(
    drawing.nodes.map((n) => n.shape),
    ["start", "decision", "end"],
  );
  const { svg } = pictureOf(drawing, {}, { measure, outline }, lightPaint);
  const { text, surfaceRaised, borderControl } = lightColors;
  assert.deepEqual(
    [...svg.matchAll(/<g data-element-id=.*?<\/g>/g)].map((m) => m[0]),
    [
      `<g data-element-id="start-1" data-shape="start"><circle cx="8" cy="27.74" r="8" fill="${text}"/></g>`,
      `<g data-element-id="ok" data-shape="decision"><polygon points="144,0 184,27.735 144,55.47 104,27.735" fill="${surfaceRaised}" stroke="${borderControl}" stroke-width="1.5" stroke-linejoin="round"/><path d="M133.5 27.74h3" fill="${text}"/></g>`,
      `<g data-element-id="end-1" data-shape="end"><circle cx="282" cy="27.74" r="9.25" fill="none" stroke="${text}" stroke-width="1.5"/><circle cx="282" cy="27.74" r="5" fill="${text}"/></g>`,
    ],
  );
});

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
    "decision",
    "start",
    "end",
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
  const clip = /<clipPath id="(clip-[^"]+)">/.exec(svg)?.[1];
  assert.ok(clip, "a record with cells clips them");
  assert.match(svg, new RegExp(`clip-path="url\\(#${clip}\\)"`));
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
      /<svg x="([\d.]+)" y="([\d.]+)" width="(\d+)" height="(\d+)" viewBox="0 0 24 24" color="([^"]+)" overflow="visible" aria-hidden="true">(.*?)<\/svg>/g,
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
    d.frame(c.topLeft.offset(-8, -8), c.bottomRight.offset(8, 8), {
      id: "later",
      tab: "later",
      stepOnly: true,
    });
    d.enclose([a], { id: "first", stepOnly: true });
  },
  steps: [
    { focus: ["a", "first"] },
    { focus: ["b", "a->b", "aside"] },
    { focus: ["c", "b->c", "later"] },
  ],
  build: true,
};

test("every element is drawn plainly, and step-only elements are left out", () => {
  const { svg } = draw(flow);
  assert.deepEqual(elements(svg).sort(), ["a", "a->b", "b", "b->c", "c"]);
  assert.doesNotMatch(svg, /h5"/, "the step-only frame's tab");
  assert.doesNotMatch(svg, /opacity=/);
});

test("a frame without a role draws its own look, and a role or a category replaces it", () => {
  const framed = (options: Record<string, unknown>) =>
    draw({
      draw: (d) => {
        const a = d.box("A");
        d.row([a]);
        d.frame(a.topLeft.offset(-10, -30), a.bottomRight.offset(10, 10), {
          id: "zone",
          tab: "opt",
          title: "t",
          ...options,
        });
      },
      steps: [],
      build: false,
    }).svg;
  const { borderControl, surfaceRaised, text, accent, accentSurface } = lightColors;
  assert.ok(
    framed({}).includes(
      `<g data-element-id="zone" data-shape="frame"><rect x="-10" y="-30" width="124" height="86" rx="4" fill="none" stroke="${borderControl}" stroke-width="1"/></g>`,
    ),
  );
  assert.match(
    framed({}),
    new RegExp(
      `<g><path d="[^"]+" fill="${surfaceRaised}" stroke="${borderControl}" stroke-width="1"/><path d="M-2 -20h3" fill="${text}"/>`,
    ),
  );
  const accented = framed({ role: "accent" });
  assert.match(accented, new RegExp(`rx="4" fill="none" stroke="${accent}" stroke-width="2"/>`));
  assert.match(accented, new RegExp(`fill="${accentSurface}" stroke="${accent}" stroke-width="2"`));
  const external = framed({ role: "external" });
  assert.match(external, /rx="4" fill="none" stroke="[^"]+" stroke-width="1.5" stroke-dasharray/);
  const category = framed({ category: "New" });
  assert.match(
    category,
    new RegExp(`rx="4" fill="none" stroke="${lightColors.category1}" stroke-width="1"/>`),
  );
  assert.match(category, /<g data-layer="legend">/);
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
