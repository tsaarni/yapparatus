/** Text boxes from attributes: transforms, anchors, lines, font sizes, and rotated overlap. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { type ChartFont, quadsOverlap, textBox, textQuads } from "../../../src/chart/text-box.ts";
import type { Measure } from "../../../src/figure/font.ts";

/** Half an em per character, and 0.6 em for tabular digits. */
const measure: Measure = (text, font) => text.length * font.size * (font.tabular ? 0.6 : 0.5);
const font: ChartFont = { family: "Test", size: 10, weight: 400, ascent: 0.8, descent: 0.2 };

/** The first text of an SVG fragment, in a document without a browser. */
function text(svg: string): Element {
  const { document } = parseHTML(`<html><body><svg>${svg}</svg></body></html>`);
  return document.querySelector("text") as unknown as Element;
}

const rounded = (box: object | undefined) =>
  box &&
  Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v * 100) / 100 + 0]));

test("a text's box follows its position, its ancestors' translations, and its anchor", () => {
  assert.deepEqual(rounded(textBox(text('<text x="10" y="20">abcd</text>'), font, measure)), {
    left: 10,
    top: 12,
    right: 30,
    bottom: 22,
  });
  const nested = text(
    '<g transform="translate(5,6)" text-anchor="end"><text transform="translate(10,20)" y="0.5em">ab</text></g>',
  );
  assert.deepEqual(rounded(textBox(nested, font, measure)), {
    left: 5,
    top: 23,
    right: 15,
    bottom: 33,
  });
  const middle = text('<text text-anchor="middle" x="50">abcd</text>');
  assert.deepEqual(rounded(textBox(middle, font, measure))?.left, 40);
});

test("a style's font size beats an attribute, and tabular digits are measured as such", () => {
  const styled = text(
    '<g font-size="10" style="font-size: 20px"><text font-variant="tabular-nums">12</text></g>',
  );
  assert.deepEqual(rounded(textBox(styled, font, measure)), {
    left: 0,
    top: -16,
    right: 24,
    bottom: 4,
  });
});

test("each tspan that moves starts a line, anchored on its own", () => {
  const lines = text(
    '<text text-anchor="middle" transform="translate(100,0)"><tspan x="0" y="0.7em">1</tspan><tspan x="0" dy="1em">Octo</tspan></text>',
  );
  assert.deepEqual(rounded(textBox(lines, font, measure)), {
    left: 90,
    top: -1,
    right: 110,
    bottom: 19,
  });
  assert.equal(textQuads(lines, font, measure).length, 2);
});

test("a rotated text covers a turned rectangle, which overlaps only where the text does", () => {
  const rotated = (x: number) =>
    text(`<text text-anchor="end" transform="translate(${x},0) rotate(-90)">abcdefghij</text>`);
  const box = rounded(textBox(rotated(0), font, measure));
  assert.deepEqual(box, { left: -8, top: 0, right: 2, bottom: 50 });
  const [a] = textQuads(rotated(0), font, measure);
  const [near] = textQuads(rotated(5), font, measure);
  const [far] = textQuads(rotated(20), font, measure);
  assert.ok(a && near && far);
  assert.ok(quadsOverlap(a, near));
  assert.ok(!quadsOverlap(a, far));
  const tilted = (x: number) =>
    text(`<text text-anchor="end" transform="translate(${x},0) rotate(-30)">abcdefghij</text>`);
  const [t1] = textQuads(tilted(0), font, measure);
  const [t2] = textQuads(tilted(25), font, measure);
  assert.ok(t1 && t2);
  const b1 = textBox(tilted(0), font, measure);
  const b2 = textBox(tilted(25), font, measure);
  assert.ok(b1 && b2 && b1.right > b2.left, "the upright boxes overlap");
  assert.ok(!quadsOverlap(t1, t2), "the turned rectangles do not");
});
