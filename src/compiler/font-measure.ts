/**
 * Diagram text measurement in Node with the widths a browser's canvas `measureText` gives.
 * It reads the web app's Fontsource stylesheets and picks subset files as a browser does.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import * as fontkit from "fontkit";
import type { FontSpec, Measure } from "../diagram/metrics.ts";

/** The stylesheets `src/web/main.tsx` imports. A test checks that the two lists agree. */
export const fontStylesheets = [
  "@fontsource-variable/inter/standard.css",
  "@fontsource-variable/jetbrains-mono/wght.css",
];

/**
 * A measure and the characters it met that no font file has. A browser draws those with a
 * system font, so their width is an estimate.
 */
export interface FontMeasure {
  measure: Measure;
  uncovered: Set<string>;
}

/** One `@font-face`: a subset file of a family and the code points it serves. */
interface Face {
  family: string;
  /** Inclusive [first, last] code point ranges. */
  ranges: Array<[number, number]>;
  weights: [number, number];
  file: string;
}

interface Width {
  width: number;
  uncovered: string[];
}

/** Estimated width of a character no font file has, in em: the width of a CJK character. */
const uncoveredAdvance = 1;

let faces: Map<string, Face[]> | undefined;
const fonts = new Map<string, fontkit.Font>();
const instances = new Map<string, fontkit.Font>();
const widths = new Map<string, Width>();

/**
 * A new measure that records the uncovered characters of the texts it measures. Font files
 * and widths are shared between measures; each records only what it was asked to measure.
 */
export function fontMeasure(): FontMeasure {
  const uncovered = new Set<string>();
  const measure: Measure = (text, font) => {
    const key = `${font.family}|${font.weight}|${font.size}|${font.tabular ?? false}|${text}`;
    let width = widths.get(key);
    if (!width) {
      width = measureText(text, font);
      widths.set(key, width);
    }
    for (const char of width.uncovered) uncovered.add(char);
    return width.width;
  };
  return { measure, uncovered };
}

/** A run of text that one face draws, or characters no face has. */
interface Run {
  face: Face | undefined;
  text: string;
}

/** Split text into runs, each drawn by one face, as a browser picks the face for each character. */
function runsOf(text: string, spec: FontSpec): Run[] {
  const family = familyFaces(spec.family);
  const runs: Run[] = [];
  for (const char of text.replace(/[\t\n\f\r]/g, " ")) {
    const face = faceFor(family, char);
    const last = runs.at(-1);
    if (last && last.face === face) last.text += char;
    else runs.push({ face, text: char });
  }
  return runs;
}

/** Width of text in a font, with the characters no font file has. */
function measureText(text: string, spec: FontSpec): Width {
  const uncovered: string[] = [];
  let width = 0;
  for (const run of runsOf(text, spec)) {
    if (run.face) width += advance(run.face, run.text, spec);
    else {
      uncovered.push(...run.text);
      width += [...run.text].length * uncoveredAdvance * spec.size;
    }
  }
  return { width, uncovered };
}

/**
 * Text as SVG path data starting at `x` with its central baseline at `y`, shaped as `fontMeasure`
 * measures it so it is exactly as wide. A character no font file has is drawn as an empty box.
 */
export function textOutline(text: string, spec: FontSpec, x: number, y: number): string {
  const primary = faceFor(familyFaces(spec.family), " ");
  const metrics = primary ? instance(primary, spec.weight, spec.size) : undefined;
  const baseline = metrics
    ? y + ((metrics.ascent + metrics.descent) / 2 / metrics.unitsPerEm) * spec.size
    : y + spec.size * 0.35;
  let pen = x;
  let d = "";
  for (const run of runsOf(text, spec)) {
    if (!run.face) {
      for (const _ of run.text) {
        const size = spec.size;
        d += `M${round(pen + size * 0.1)} ${round(baseline - size * 0.7)}h${round(size * 0.8)}v${round(size * 0.8)}h${round(-size * 0.8)}Z`;
        pen += uncoveredAdvance * size;
      }
      continue;
    }
    const font = instance(run.face, spec.weight, spec.size);
    const scale = spec.size / font.unitsPerEm;
    const laid = font.layout(run.text, features(spec), script(run.text));
    laid.glyphs.forEach((glyph, i) => {
      const at = laid.positions[i];
      if (!at) return;
      const path = glyph.path
        .scale(scale, -scale)
        .translate(pen + at.xOffset * scale, baseline - at.yOffset * scale);
      d += path.toSVG();
      pen += at.xAdvance * scale;
    });
  }
  return d;
}

/**
 * The ascent and descent of a family's text, in em: how far a line reaches above and below its
 * baseline, from the first face's line metrics, as a browser sets SVG text.
 */
export function fontExtent(family: string): { ascent: number; descent: number } {
  const face = faceFor(familyFaces(family), " ");
  if (!face) throw new Error(`No font file of ${family} has a space.`);
  const font = fontFile(face.file);
  return { ascent: font.ascent / font.unitsPerEm, descent: -font.descent / font.unitsPerEm };
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The face that draws a character. A browser checks the faces whose range has the character,
 * the last defined first, and takes the first whose file has a glyph for it.
 */
function faceFor(family: Face[], char: string): Face | undefined {
  const code = char.codePointAt(0) ?? 0;
  for (let i = family.length - 1; i >= 0; i--) {
    const face = family[i] as Face;
    if (face.ranges.some(([first, last]) => code >= first && code <= last))
      if (fontFile(face.file).hasGlyphForCodePoint(code)) return face;
  }
  return undefined;
}

/** Characters that belong to a script, unlike digits, punctuation, and combining marks. */
const scriptCharacter = /[^\p{Script=Common}\p{Script=Inherited}]/u;

/**
 * Width of a run of text that one face draws, shaped with kerning and default features.
 * Runs without letters are shaped as Latin: fontkit would kern them twice in the default script.
 */
function advance(face: Face, text: string, spec: FontSpec): number {
  const font = instance(face, spec.weight, spec.size);
  return (
    (font.layout(text, features(spec), script(text)).advanceWidth / font.unitsPerEm) * spec.size
  );
}

/** The OpenType features a font spec turns on: tabular digits. */
function features(spec: FontSpec): string[] | undefined {
  return spec.tabular ? ["tnum"] : undefined;
}

/** The script to shape a run with: its own, or Latin for a run without letters. See `advance`. */
function script(text: string): string | undefined {
  return scriptCharacter.test(text) ? undefined : "latn";
}

/**
 * The font file at a weight and size. A browser sets `wght` to the weight and, with automatic
 * optical sizing, `opsz` to the size in pixels, each limited to the axis range.
 */
function instance(face: Face, weight: number, size: number): fontkit.Font {
  const key = `${face.file}|${weight}|${size}`;
  let font = instances.get(key);
  if (!font) {
    const base = fontFile(face.file);
    const settings: Record<string, number> = {};
    const axes = base.variationAxes;
    const set = (tag: string, value: number) => {
      const axis = axes[tag];
      if (axis) settings[tag] = Math.min(axis.max, Math.max(axis.min, value));
    };
    set("wght", Math.min(face.weights[1], Math.max(face.weights[0], weight)));
    set("opsz", size);
    font = Object.keys(settings).length > 0 ? base.getVariation(settings) : base;
    instances.set(key, font);
  }
  return font;
}

/** The font file at a path, opened once. */
function fontFile(file: string): fontkit.Font {
  let font = fonts.get(file);
  if (!font) {
    font = fontkit.openSync(file) as fontkit.Font;
    fonts.set(file, font);
  }
  return font;
}

/** The faces of the first family in a CSS font family list, in the order they are defined. */
function familyFaces(family: string): Face[] {
  faces ??= readFaces();
  const name = family
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  const found = name === undefined ? undefined : faces.get(name);
  if (!found) throw new Error(`No font files for the font family ${family}`);
  return found;
}

/** The faces of every family in `fontStylesheets`, by family name. */
function readFaces(): Map<string, Face[]> {
  const require = createRequire(import.meta.url);
  const byFamily = new Map<string, Face[]>();
  for (const stylesheet of fontStylesheets) {
    const file = require.resolve(stylesheet);
    for (const face of parseFaces(readFileSync(file, "utf8"), path.dirname(file))) {
      const family = byFamily.get(face.family) ?? [];
      family.push(face);
      byFamily.set(face.family, family);
    }
  }
  return byFamily;
}

/** The normal-style `@font-face` rules in a stylesheet, with file paths resolved from `dir`. */
function parseFaces(css: string, dir: string): Face[] {
  const found: Face[] = [];
  for (const [, body = ""] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const get = (name: string) => new RegExp(`${name}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim();
    if ((get("font-style") ?? "normal") !== "normal") continue;
    const family = get("font-family")?.replace(/^["']|["']$/g, "");
    const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(get("src") ?? "")?.[1];
    if (!family || !url) continue;
    const [low = 400, high = low] = (get("font-weight") ?? "400").split(/\s+/).map(Number);
    found.push({
      family,
      ranges: parseUnicodeRange(get("unicode-range") ?? "U+0-10FFFF"),
      weights: [low, high],
      file: path.resolve(dir, url),
    });
  }
  return found;
}

/** `U+0000-00FF,U+0131,U+4??` as inclusive code point ranges. */
function parseUnicodeRange(value: string): Array<[number, number]> {
  return value.split(",").map((item) => {
    const range = item.trim().replace(/^U\+/i, "");
    if (range.includes("?"))
      return [
        Number.parseInt(range.replace(/\?/g, "0"), 16),
        Number.parseInt(range.replace(/\?/g, "F"), 16),
      ];
    const [first = "0", last = first] = range.split("-");
    return [Number.parseInt(first, 16), Number.parseInt(last, 16)];
  });
}
