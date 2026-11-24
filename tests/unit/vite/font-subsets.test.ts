/** Font subsetting: `@font-face` rules and their ranges, and the characters of an output. */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rollup } from "vite";
import {
  charactersIn,
  fontFaces,
  outputCharacters,
  unicodeRanges,
} from "../../../src/vite/font-subsets.ts";

test("unicode ranges read single points, spans, and wildcards", () => {
  assert.deepEqual(unicodeRanges("U+0-FF, U+131,U+1F??"), [
    [0, 0xff],
    [0x131, 0x131],
    [0x1f00, 0x1fff],
  ]);
});

test("a font face's family, style, source, and ranges are read from minified CSS", () => {
  const css =
    'a{color:red}@font-face{font-family:Inter Variable;font-style:normal;font-weight:100 900;src:url(/-/assets/inter-latin-A1.woff2)format("woff2-variations");unicode-range:U+0-FF}';
  const [face] = fontFaces(css);
  assert.equal(face?.family, "Inter Variable");
  assert.equal(face?.style, "normal");
  assert.equal(face?.url, "/-/assets/inter-latin-A1.woff2");
  assert.deepEqual(face?.ranges, [[0, 0xff]]);
});

test("a face draws only the output's characters inside its ranges", () => {
  assert.equal(charactersIn([[0x370, 0x3ff]], new Set("aµλ−")), "λ");
});

test("the output's characters include escapes in scripts and style sheets", () => {
  const bundle = {
    "main.js": { type: "chunk", code: 'const minus = "\\u2212", arrow = "→";' },
    "main.css": { type: "asset", fileName: "main.css", source: '.more::after{content:"\\2026"}' },
  } as unknown as Rollup.OutputBundle;
  const characters = outputCharacters(bundle);
  for (const char of ["−", "→", "…", "a", " "]) assert.ok(characters.has(char), char);
  assert.equal(characters.has("λ"), false);
});
