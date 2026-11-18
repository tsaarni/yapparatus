/**
 * Text: measuring labels, wrapping them, and placing lines in the fonts the compiler chose.
 */
import type { DiagnosticCode } from "../../document/diagnostic.ts";
import type { TextLine } from "../drawing.ts";
import type { Node } from "../elements.ts";
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

/** Break text into lines at spaces so each fits the width; one line if the width is infinite. */
function wrap(text: string, font: FontSpec, width: number, measure: Measure): string[] {
  if (!Number.isFinite(width) || measure(text, font) <= width) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, font) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

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
    const wrapWidth = o.width !== undefined ? o.width - 2 * pad : Number.POSITIVE_INFINITY;
    const lines: Content["lines"] = [];
    const push = (text: string, font: FontSpec, muted: boolean) => {
      for (const paragraph of text.split("\n")) {
        for (const line of wrap(paragraph, font, wrapWidth, measure)) {
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
    if (lines.length && width > wrapWidth + 0.5)
      report(
        "TEXT_OVERFLOW",
        `${node.id}: a word is ${round(width - wrapWidth)} units wider than the fixed width allows.`,
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
