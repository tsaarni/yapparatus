/**
 * Text: measuring labels, wrapping them, and placing lines in the fonts the compiler chose.
 */
import type { DiagnosticCode } from "../../document/diagnostic.ts";
import type { TextLine } from "../drawing.ts";
import type { Node, Shape } from "../elements.ts";
import { round } from "../geometry.ts";
import {
  cylinderCap,
  type FontSpec,
  fontsOf,
  type Measure,
  type Metrics,
  shapes,
  tab,
} from "../metrics.ts";

/** Reports a diagnostic; every compiler step takes one. */
export type Report = (code: DiagnosticCode, message: string, ids: string[]) => void;

/** A node's label and sublabel, wrapped and measured. */
export interface Content {
  lines: Array<{
    text: string;
    width: number;
    size: number;
    weight: number;
    mono: boolean;
    muted: boolean;
  }>;
  width: number;
  height: number;
}

/** The text functions that layout and the node compiler share. */
export type Text = ReturnType<typeof createText>;

/** Where a line of text is anchored: at its start, or at its middle. */
export type Align = "start" | "middle";

/** A placed line of text, with its false flags and its default alignment left out. */
export function textLine(
  text: string,
  x: number,
  y: number,
  font: { size: number; weight: number; mono: boolean },
  muted: boolean,
  align: Align,
): TextLine {
  return {
    text,
    x,
    y,
    size: font.size,
    weight: font.weight,
    ...(font.mono ? { mono: true } : {}),
    ...(muted ? { muted: true } : {}),
    ...(align === "start" ? { align } : {}),
  };
}

/** Break words into lines greedily, so each line fits the width unless one word is wider. */
function greedy(words: string[], font: FontSpec, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, font) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Break text into lines at spaces so each fits the width, then wrap again at the narrowest width
 * that keeps the number of lines, so the lines are balanced. One line if the width is infinite.
 */
function wrap(text: string, font: FontSpec, width: number, measure: Measure): string[] {
  if (!Number.isFinite(width) || measure(text, font) <= width) return [text];
  const words = text.split(/\s+/);
  const count = greedy(words, font, width, measure).length;
  let fits = width;
  let short = Math.min(width, Math.max(...words.map((w) => measure(w, font))));
  while (fits - short > 1) {
    const mid = (fits + short) / 2;
    if (greedy(words, font, mid, measure).length === count) fits = mid;
    else short = mid;
  }
  return greedy(words, font, fits, measure);
}

/** The shapes whose text wraps at `wrapWidth` when no width is fixed. */
const labelShapes = new Set<Shape>(["box", "cylinder", "diamond", "actor"]);

/** The shapes whose text wraps at `textWrapWidth` when no width is fixed. */
const textShapes = new Set<Shape>(["note", "text", "dot", "ring"]);

/** Text measuring for one compile, with each node's measured content cached. */
export function createText(m: Metrics, measure: Measure, report: Report) {
  const content = new Map<Node, Content>();
  const fonts = fontsOf(m);

  function measureNode(node: Node): Content {
    const cached = content.get(node);
    if (cached) return cached;
    const o = node.options;
    const small = node.shape === "note" || node.shape === "text";
    const labelFont = {
      family: o.mono ? m.mono : m.sans,
      size: small ? m.smallSize : m.labelSize,
      weight: small ? m.textWeight : m.labelWeight,
    };
    const subFont = { family: m.sans, size: m.smallSize, weight: m.textWeight };
    const pad =
      node.shape === "text" ||
      node.shape === "actor" ||
      node.shape === "bar" ||
      node.shape === "dot" ||
      node.shape === "ring"
        ? 0
        : node.shape === "note"
          ? shapes.note.padX
          : m.padX;
    const fixed = o.width !== undefined ? o.width - 2 * pad : undefined;
    const shapeWidth = labelShapes.has(node.shape)
      ? m.wrapWidth
      : textShapes.has(node.shape)
        ? m.textWrapWidth
        : Number.POSITIVE_INFINITY;
    const wrapWidth = (font: FontSpec) =>
      fixed ?? (font.family === m.mono ? Number.POSITIVE_INFINITY : shapeWidth);
    const lines: Content["lines"] = [];
    const push = (text: string, font: FontSpec, muted: boolean) => {
      for (const paragraph of text.split("\n")) {
        for (const line of wrap(paragraph, font, wrapWidth(font), measure)) {
          lines.push({
            text: line,
            width: measure(line, font),
            size: font.size,
            weight: font.weight,
            mono: font.family === m.mono,
            muted,
          });
        }
      }
    };
    if (node.label) push(node.label, labelFont, false);
    if (o.sub) push(o.sub, subFont, true);
    const width = Math.max(0, ...lines.map((l) => l.width));
    const height = lines.reduce((sum, l) => sum + l.size * m.lineHeight, 0);
    const c = { lines, width, height };
    content.set(node, c);
    if (fixed !== undefined && lines.length && width > fixed + 0.5)
      report(
        "TEXT_OVERFLOW",
        `${node.id}: a word is ${round(width - fixed)} units wider than the fixed width allows.`,
        [node.id],
      );
    return c;
  }

  function capHeight(node: Node, width: number) {
    return node.shape === "cylinder" ? cylinderCap(width) : 0;
  }

  function textAt(
    text: string,
    x: number,
    y: number,
    font: FontSpec,
    muted = false,
    align: Align = "start",
  ): TextLine {
    return textLine(text, x, y, { ...font, mono: font.family === m.mono }, muted, align);
  }

  function textFont(node: Node): FontSpec {
    return {
      family: node.options.mono ? m.mono : m.sans,
      size: m.smallSize,
      weight: m.textWeight,
    };
  }

  function tabWidth(text: string) {
    return measure(text, fonts.tab) + 2 * tab.pad;
  }

  return { measureNode, capHeight, textAt, textFont, tabWidth };
}
