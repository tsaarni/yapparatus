/**
 * A compiled drawing as a standalone SVG picture for an agent, drawn like the web app draws it.
 * Paint values are written in and text is glyph outlines, so a rasterizer needs no fonts or styles.
 */

import type { Measure } from "../figure/font.ts";
import { legend, legendLayout, type Picture, type PictureFonts } from "../figure/picture.ts";
import { type Align, textLine } from "./compile/text.ts";
import { type CompiledDiagram, stepOnlyElements, type TextLine } from "./drawing.ts";
import type { Rect } from "./geometry.ts";
import { defaultMetrics } from "./metrics.ts";
import { categories, frameLook, haloWidth, type Paint, type RolePaint, roles } from "./paint.ts";
import {
  type DiagramPaint,
  drawDiagram,
  type Ink,
  isText,
  type Look,
  type SvgNode,
} from "./render.ts";

/** Options of `pictureOf`. */
export interface PictureOptions {
  /** Draw each element's id beside it, and outline the elements that diagnostics name. */
  ids?: boolean;
}

const m = defaultMetrics;

/** The legend's swatch border: a diagram category has an ink edge around its fill. */
const swatchBorder = 1.5;

const n = (value: number) => Math.round(value * 100) / 100;
const xml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SVG attributes from a record; undefined values are left out. */
function attrs(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .flatMap(([name, value]) =>
      value === undefined
        ? []
        : [` ${name}="${typeof value === "number" ? n(value) : xml(value)}"`],
    )
    .join("");
}

const rect = (r: Rect, rx: number, style: Record<string, string | number | undefined>) =>
  `<rect${attrs({ x: r.x, y: r.y, width: r.width, height: r.height, rx: rx || undefined, ...style })}/>`;

/** A picture's paint: the theme's literal values, and each look's colors from the role table. */
function picturePaint(paint: Paint): DiagramPaint {
  const { colors: color, stroke } = paint;
  return {
    ...paint,
    background: color.surface,
    boost: (weight) => weight,
    ink: (look: Look): Ink => {
      const role: RolePaint =
        look.role === undefined
          ? frameLook
          : roles[look.role === "external" ? "default" : (look.role as keyof typeof roles)];
      const category = look.category === undefined ? undefined : categories[look.category - 1];
      const fill = category?.fill ?? role.fill;
      return {
        ink: color[category?.ink ?? role.ink],
        fill: fill === "transparent" ? "none" : color[fill],
        label: color[role.label],
        weight: stroke[role.weight],
      };
    },
  };
}

/**
 * Draws a compiled drawing as the web app shows it before any step: every element plain, and the
 * elements that only a step shows left out. The drawing must have compiled (`ok`).
 */
export function pictureOf(
  diagram: CompiledDiagram,
  options: PictureOptions,
  fonts: PictureFonts,
  paint: Paint,
): Picture {
  const background = paint.colors.surface;
  if (!diagram.ok) throw new Error("The drawing did not compile, so it has no picture.");
  const text = (line: TextLine, fill: string, halo = false) => {
    const font = { family: line.mono ? m.mono : m.sans, size: line.size, weight: line.weight };
    const words = line.text.replace(/\s+/g, " ").trim();
    const x = line.align === "start" ? line.x : line.x - fonts.measure(words, font) / 2;
    const d = fonts.outline(words, font, x, line.y);
    if (!d) return "";
    const behind = halo
      ? `<path${attrs({ d, fill: background, stroke: background, "stroke-width": haloWidth, "stroke-linejoin": "round" })}/>`
      : "";
    return `${behind}<path${attrs({ d, fill })}/>`;
  };
  const write = (node: SvgNode): string => {
    if (isText(node)) return text(node.line, node.fill, node.halo);
    const tag = node.layer?.id
      ? { "data-element-id": node.layer.id, "data-shape": node.layer.shape }
      : {};
    const inner = node.markup ?? (node.children ?? []).map(write).join("");
    const open = `<${node.tag}${attrs({ ...tag, ...node.attributes })}`;
    return inner ? `${open}>${inner}</${node.tag}>` : `${open}/>`;
  };
  const flagged = new Set(options.ids ? diagram.diagnostics.flatMap((d) => d.ids) : []);
  const drawn = drawDiagram(diagram, picturePaint(paint), {
    flagged,
    omit: stepOnlyElements(diagram),
  });
  const out = drawn.map(write);
  if (options.ids) out.push(idLayer(diagram, fonts.measure, text, paint.colors));

  const vb = diagram.viewBox;
  const key = diagram.legend.length
    ? legendOf(diagram, vb, fonts, text, paint.colors)
    : { svg: "", height: 0 };
  const height = vb.height + key.height;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg"${attrs({ viewBox: `${n(vb.x)} ${n(vb.y)} ${n(vb.width)} ${n(height)}`, width: vb.width, height })}>`,
    rect({ x: vb.x, y: vb.y, width: vb.width, height }, 0, { fill: background }),
    ...out,
    key.svg,
    "</svg>",
  ].join("\n");
  return { svg, width: vb.width, height };
}

/**
 * Each element's id beside it, small and in the error color with a halo, placed where it
 * covers the least: above nodes, inside cells, under edges, inside enclosures and frames.
 */
function idLayer(
  diagram: CompiledDiagram,
  measure: Measure,
  text: (line: TextLine, fill: string, halo?: boolean) => string,
  color: Paint["colors"],
): string {
  const font = { family: m.mono, size: 9, weight: 400 };
  const tag = (id: string, x: number, y: number, align: Align = "start") =>
    text(textLine(id, x, y, { ...font, mono: true }, false, align), color.error, true);
  const out: string[] = [];
  for (const node of diagram.nodes) {
    if (node.passive || node.shape === "space") continue;
    const r = node.rect;
    out.push(
      node.shape === "cell" ? tag(node.id, r.x + 3, r.y + 7) : tag(node.id, r.x + 2, r.y - 6),
    );
  }
  for (const edge of diagram.edges) {
    if (edge.passive) continue;
    let best: { x: number; y: number; length: number } | undefined;
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      if (!a || !b) continue;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (!best || length > best.length) best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length };
    }
    if (best) out.push(tag(edge.id, best.x, best.y + 9, "middle"));
  }
  for (const element of [...diagram.enclosures, ...diagram.frames]) {
    const r = element.rect;
    out.push(tag(element.id, r.x + r.width - 6 - measure(element.id, font), r.y + 9));
  }
  return `<g data-layer="ids">${out.join("")}</g>`;
}

/** The legend: a swatch and the words of each category, in rows as wide as the drawing. */
function legendOf(
  diagram: CompiledDiagram,
  vb: Rect,
  fonts: PictureFonts,
  text: (line: TextLine, fill: string) => string,
  color: Paint["colors"],
): { svg: string; height: number } {
  const { swatch } = legend;
  const names = diagram.legend.map((entry) => entry.name);
  const { places, height } = legendLayout(names, vb.width, m.sans, fonts.measure);
  const top = vb.y + vb.height;
  const inset = swatchBorder / 2;
  const out = diagram.legend.map((entry, i) => {
    const place = places[i] as (typeof places)[number];
    const middle = top + place.middle;
    const slot = categories[entry.slot - 1];
    return (
      rect(
        {
          x: vb.x + place.swatchX + inset,
          y: middle - swatch.height / 2 + inset,
          width: swatch.width - swatchBorder,
          height: swatch.height - swatchBorder,
        },
        swatch.radius - inset,
        {
          fill: slot ? color[slot.fill] : "none",
          stroke: slot ? color[slot.ink] : color.borderControl,
          "stroke-width": swatchBorder,
        },
      ) +
      text(
        { text: entry.name, x: vb.x + place.wordsX, y: middle, ...legend.font, align: "start" },
        color.textMuted,
      )
    );
  });
  return { svg: `<g data-layer="legend">${out.join("")}</g>`, height };
}
