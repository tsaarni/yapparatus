/**
 * A compiled drawing as a standalone SVG picture, for an agent that looks at a figure. It draws
 * what the web app draws, in the same order as `web/diagram/diagram-view.tsx`, with the paint
 * values it is given written into it and text as glyph outlines, so a rasterizer needs no fonts
 * and no styles.
 */

import { type Align, textLine } from "./compile/text.ts";
import {
  type CompiledDiagram,
  type CompiledEdge,
  type CompiledNode,
  stepOnlyElements,
  type TextLine,
} from "./drawing.ts";
import { type Rect, union } from "./geometry.ts";
import { badge, corner, defaultMetrics, type FontSpec, type Measure } from "./metrics.ts";
import * as shape from "./outlines.ts";
import { categories, haloWidth, type Paint, roles } from "./paint.ts";

/** Text as glyph outlines: path data for text that starts at x with its central baseline at y. */
export type TextOutline = (text: string, font: FontSpec, x: number, y: number) => string;

/** How the picture draws text: the widths, and the outlines. */
export interface PictureFonts {
  measure: Measure;
  outline: TextOutline;
}

export interface PictureOptions {
  /** Draw each element's id beside it, and outline the elements that diagnostics name. */
  ids?: boolean;
}

export interface Picture {
  svg: string;
  /** The picture's size in CSS pixels: the drawing, and the legend under it. */
  width: number;
  height: number;
}

const m = defaultMetrics;

/** The legend under the drawing, as the web app's legend buttons are laid out. */
const legend = {
  marginTop: 12,
  height: 28,
  padX: 8,
  gap: 4,
  swatch: { width: 14, height: 10, border: 1.5, radius: 3 },
  font: { family: m.sans, size: 12, weight: 500 },
};

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

/** The colors and weight an element paints with: its role's, and its category's hue. */
interface Ink {
  ink: string;
  fill: string;
  label: string;
  weight: number;
}

function inkOf(element: { role: string; category?: number }, paint: Paint): Ink {
  const { colors: color, stroke } = paint;
  const role =
    roles[element.role === "external" ? "default" : (element.role as keyof typeof roles)];
  const category = element.category === undefined ? undefined : categories[element.category - 1];
  const fill = category?.fill ?? role.fill;
  return {
    ink: color[category?.ink ?? role.ink],
    fill: fill === "transparent" ? "none" : color[fill],
    label: color[role.label],
    weight: stroke[role.weight],
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
  const { colors: color, stroke, dash } = paint;
  /** The figure's own color, behind the drawing and in the halos. */
  const background = color.surface;
  if (!diagram.ok) throw new Error("The drawing did not compile, so it has no picture.");
  const stepOnly = stepOnlyElements(diagram);
  const shown = (id: string) => !stepOnly.has(id);
  const flagged = new Set(options.ids ? diagram.diagnostics.flatMap((d) => d.ids) : []);

  /** A text line's outlines in a color, with a halo in the figure's color when asked. */
  const text = (line: TextLine, fill: string, halo = false) => {
    const font = { family: line.mono ? m.mono : m.sans, size: line.size, weight: line.weight };
    // SVG text collapses runs of white space and drops it at the ends, as HTML does.
    const words = line.text.replace(/\s+/g, " ").trim();
    const x = line.align === "start" ? line.x : line.x - fonts.measure(words, font) / 2;
    const d = fonts.outline(words, font, x, line.y);
    if (!d) return "";
    const behind = halo
      ? `<path${attrs({ d, fill: background, stroke: background, "stroke-width": haloWidth, "stroke-linejoin": "round" })}/>`
      : "";
    return `${behind}<path${attrs({ d, fill })}/>`;
  };
  const lines = (node: CompiledNode, label: string) =>
    node.lines.map((line) => text(line, line.muted ? color.textMuted : label)).join("");
  /** An element's group, tagged with its id for tests and tools. An element not shown has none. */
  const group = (visible: boolean, body: string, tag: Record<string, string> = {}) => {
    if (!visible || !body) return "";
    const data = Object.fromEntries(Object.entries(tag).map(([k, v]) => [`data-${k}`, v]));
    return `<g${attrs(data)}>${body}</g>`;
  };
  const outlined = (k: Ink, dashed: boolean) => ({
    fill: k.fill,
    stroke: k.ink,
    "stroke-width": k.weight,
    "stroke-linejoin": "round",
    "stroke-dasharray": dashed ? dash.dashed : undefined,
  });
  const flag = (r: Rect, pad: number, rx: number) =>
    rect(shape.outline(r, pad), rx, {
      fill: "none",
      stroke: color.warning,
      "stroke-width": stroke.hairline,
      "stroke-dasharray": dash.dotted,
    });
  const warningBadge = (r: Rect) => {
    const c = shape.badgeCenter(r);
    return (
      `<circle${attrs({ cx: c.x, cy: c.y, r: badge.radius, fill: color.warning, stroke: background, "stroke-width": 2 })}/>` +
      `<path${attrs({ d: shape.badgeMark(c), fill: "none", stroke: color.canvas, "stroke-width": 1.8, "stroke-linecap": "round" })}/>`
    );
  };
  // Each record with cells clips its cells' fills to its rounded corners.
  const clips = new Map(
    diagram.nodes.filter((node) => node.rules).map((node, i) => [node.id, `clip${i}`]),
  );
  const defs = diagram.nodes
    .filter((node) => node.rules)
    .map(
      (node) =>
        `<clipPath id="${clips.get(node.id)}">${rect(node.rect, corner.shape, {})}</clipPath>`,
    )
    .join("");

  const shapeOf = (node: CompiledNode, k: Ink): string => {
    const r = node.rect;
    const style = outlined(k, node.role === "external");
    switch (node.shape) {
      case "box":
        return rect(r, corner.shape, style);
      case "cylinder": {
        const { body, cap } = shape.cylinder(r);
        return `<path${attrs({ d: body, ...style })}/><ellipse${attrs({ ...cap, ...style })}/>`;
      }
      case "actor": {
        const { head, body } = shape.actor(r);
        // The web app draws a stick figure solid, even for an external element.
        const figure = {
          ...style,
          fill: "none",
          "stroke-linecap": "round",
          "stroke-dasharray": undefined,
        };
        return `<circle${attrs({ ...head, ...figure })}/><path${attrs({ d: body, ...figure })}/>`;
      }
      case "note": {
        const { body, fold } = shape.note(r);
        return (
          `<path${attrs({ d: body, ...style })}/>` +
          `<path${attrs({ d: fold, ...style, fill: color.diagramShade, "stroke-dasharray": undefined })}/>`
        );
      }
      case "diamond":
        return `<polygon${attrs({ points: shape.diamond(r), ...style })}/>`;
      case "dot":
        return `<circle${attrs({ cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.width / 2, fill: color.text })}/>`;
      case "ring": {
        const center = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
        return (
          `<circle${attrs({ ...center, r: r.width / 2 - 0.75, fill: "none", stroke: color.text, "stroke-width": stroke.line })}/>` +
          `<circle${attrs({ ...center, r: r.width / 2 - 5, fill: color.text })}/>`
        );
      }
      case "record": {
        // A record with cells: its fill here, and its outline over the cells later.
        if (node.rules !== undefined) return rect(r, corner.shape, { fill: k.fill });
        const divider =
          node.divider === undefined
            ? ""
            : `<path${attrs({ d: shape.rule(r, node.divider), stroke: k.ink, "stroke-width": stroke.hairline })}/>`;
        return rect(r, corner.shape, style) + divider;
      }
      case "cell": {
        // A cell with a role or category is filled, inside its record's rounded corners.
        if (node.role === "default" && node.category === undefined) return "";
        const clip = node.parent ? clips.get(node.parent) : undefined;
        return `<g${attrs({ "clip-path": clip ? `url(#${clip})` : undefined })}>${rect(r, 0, { fill: k.fill })}</g>`;
      }
      case "mark":
        return rect(r, corner.mark, {
          fill: k.fill,
          stroke: k.ink,
          "stroke-width": stroke.hairline,
        });
      default:
        return "";
    }
  };

  const nodeOf = (node: CompiledNode): string => {
    if (node.shape === "space") return "";
    // A decoration is shown with its edge.
    const visible = node.passive ? !node.follows || shown(node.follows) : shown(node.id);
    const tag = { "element-id": node.id, shape: node.shape };
    if (node.shape === "bar")
      return group(
        visible,
        rect(node.rect, 2, {
          fill: color.surfaceHover,
          stroke: color.borderControl,
          "stroke-width": stroke.hairline,
        }),
        tag,
      );
    const layered = (node.shape === "record" && node.rules !== undefined) || node.shape === "cell";
    const k = inkOf(node, paint);
    let body = shapeOf(node, k) + lines(node, k.label);
    if (node.role === "warning" && !layered) body += warningBadge(node.rect);
    if (flagged.has(node.id) && !layered)
      body += flag(node.labelRect ? (union([node.rect, node.labelRect]) as Rect) : node.rect, 4, 8);
    return group(visible, body, tag);
  };

  /** A record's outline over its cells, its title divider, and the hairlines between cells. */
  const recordOutline = (node: CompiledNode): string => {
    const k = inkOf(node, paint);
    const rule = { stroke: k.ink, "stroke-width": stroke.hairline };
    let body = rect(node.rect, corner.shape, {
      ...outlined(k, node.role === "external"),
      fill: "none",
    });
    if (node.divider !== undefined)
      body += `<path${attrs({ d: shape.rule(node.rect, node.divider), ...rule })}/>`;
    if (node.rules?.length) body += `<path${attrs({ d: shape.segments(node.rules), ...rule })}/>`;
    if (node.role === "warning") body += warningBadge(node.rect);
    if (flagged.has(node.id)) body += flag(node.rect, 4, 8);
    return group(shown(node.id), body);
  };

  const pin = (node: CompiledNode): string => {
    const k = inkOf(node, paint);
    const { x, y } = node.rect;
    const label: TextLine = {
      text: String(node.pin),
      x,
      y,
      size: m.tabSize,
      weight: m.labelWeight,
    };
    return group(
      shown(node.id),
      `<circle${attrs({ cx: x, cy: y, r: badge.radius + 1, fill: k.ink, stroke: background, "stroke-width": 2 })}/>${text(label, color.canvas)}`,
    );
  };

  const edgeOf = (edge: CompiledEdge): string => {
    const d = shape.roundedPath(edge.points, edge.radius);
    if (edge.passive) {
      const k = inkOf(edge, paint);
      return `<path${attrs({ d, fill: "none", stroke: k.ink, "stroke-width": stroke.hairline, "stroke-dasharray": dash.dotted })}/>`;
    }
    const k = inkOf(edge, paint);
    const line = {
      fill: "none",
      stroke: k.ink,
      "stroke-width": k.weight,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    };
    let body = `<path${attrs({ d, ...line, "stroke-dasharray": edge.dashed ? dash.dashed : undefined })}/>`;
    for (const head of edge.heads)
      body +=
        edge.head === "open"
          ? `<polyline${attrs({ points: shape.pointList(head), ...line })}/>`
          : `<polygon${attrs({ points: shape.pointList(head), fill: k.ink })}/>`;
    for (const label of edge.labels)
      body += label.lines.map((l) => text(l, color.textBody, true)).join("");
    if (flagged.has(edge.id)) for (const label of edge.labels) body += flag(label.rect, 1, 4);
    return group(shown(edge.id), body, { "element-id": edge.id, shape: "edge" });
  };

  const out: string[] = [];
  for (const f of diagram.frames) {
    const hairline = { fill: "none", stroke: color.borderControl, "stroke-width": stroke.hairline };
    const body =
      rect(f.rect, corner.frame, hairline) +
      f.dividers
        .map(
          (divider) =>
            `<path${attrs({ d: shape.rule(f.rect, divider.y), ...hairline, "stroke-dasharray": dash.dashed })}/>`,
        )
        .join("");
    out.push(group(shown(f.id), body, { "element-id": f.id, shape: "frame" }));
  }
  for (const e of diagram.enclosures) {
    const k = inkOf(e, paint);
    const ink = { stroke: k.ink, "stroke-width": k.weight };
    let body = rect(e.rect, corner.group, {
      fill: "none",
      ...ink,
      "stroke-dasharray": dash.dashed,
    });
    if (e.title && e.titleRect)
      body +=
        rect(e.titleRect, e.titleRect.height / 2, { fill: background, ...ink }) +
        text(e.title, e.title.muted ? color.textMuted : k.label);
    out.push(group(shown(e.id), body, { "element-id": e.id, shape: "enclosure" }));
  }
  for (const edge of diagram.edges) if (edge.passive) out.push(edgeOf(edge));
  for (const node of diagram.nodes) out.push(nodeOf(node));
  for (const node of diagram.nodes) if (node.rules) out.push(recordOutline(node));
  for (const node of diagram.nodes)
    if (node.shape === "cell" && node.role === "warning")
      out.push(group(shown(node.id), warningBadge(node.rect)));
  for (const node of diagram.nodes) if (node.pin !== undefined) out.push(pin(node));
  for (const edge of diagram.edges) if (!edge.passive) out.push(edgeOf(edge));
  for (const f of diagram.frames) {
    const labels = (line: TextLine | undefined) =>
      line ? text(line, line.muted ? color.textMuted : color.text, true) : "";
    let body = "";
    if (f.tab)
      body +=
        `<path${attrs({ d: shape.fragmentTab(f.tab.rect), fill: color.surfaceRaised, stroke: color.borderControl, "stroke-width": stroke.hairline })}/>` +
        text(f.tab.line, f.tab.line.muted ? color.textMuted : color.text);
    body += labels(f.title) + f.dividers.map((divider) => labels(divider.label)).join("");
    out.push(group(shown(f.id), body));
  }
  if (options.ids) out.push(idLayer(diagram, fonts.measure, text, paint.colors));

  const vb = diagram.viewBox;
  const key = diagram.legend.length
    ? legendOf(diagram, vb, fonts, text, paint.colors)
    : { svg: "", height: 0 };
  const height = vb.height + key.height;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg"${attrs({ viewBox: `${n(vb.x)} ${n(vb.y)} ${n(vb.width)} ${n(height)}`, width: vb.width, height })}>`,
    rect({ x: vb.x, y: vb.y, width: vb.width, height }, 0, { fill: background }),
    defs ? `<defs>${defs}</defs>` : "",
    ...out.filter(Boolean),
    key.svg,
    "</svg>",
  ].join("\n");
  return { svg, width: vb.width, height };
}

/**
 * Each element's id beside it, small and in the error color, with a halo: nodes above their
 * top-left corner, cells inside theirs, edges under the middle of their longest segment, and
 * enclosures and frames inside their top-right corner.
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
    // A cell's id goes inside it, since its neighbors touch it; any other element's above it.
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
  let x = vb.x;
  let y = vb.y + vb.height + legend.marginTop;
  const out: string[] = [];
  for (const entry of diagram.legend) {
    const words = fonts.measure(entry.name, legend.font);
    const width = legend.padX * 2 + swatch.width + legend.gap + words;
    if (x > vb.x && x + width > vb.x + vb.width) {
      x = vb.x;
      y += legend.height + legend.gap;
    }
    const middle = y + legend.height / 2;
    const slot = categories[entry.slot - 1];
    const inset = swatch.border / 2;
    out.push(
      rect(
        {
          x: x + legend.padX + inset,
          y: middle - swatch.height / 2 + inset,
          width: swatch.width - swatch.border,
          height: swatch.height - swatch.border,
        },
        swatch.radius - inset,
        {
          fill: slot ? color[slot.fill] : "none",
          stroke: slot ? color[slot.ink] : color.borderControl,
          "stroke-width": swatch.border,
        },
      ) +
        text(
          {
            text: entry.name,
            x: x + legend.padX + swatch.width + legend.gap,
            y: middle,
            ...{ size: legend.font.size, weight: legend.font.weight },
            align: "start",
          },
          color.textMuted,
        ),
    );
    x += width + legend.gap;
  }
  const height = y + legend.height - (vb.y + vb.height);
  return { svg: `<g data-layer="legend">${out.join("")}</g>`, height };
}
