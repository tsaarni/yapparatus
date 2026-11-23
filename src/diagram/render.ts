/**
 * A compiled diagram as a tree of SVG elements, drawn once for both the web app and pictures. The
 * paint says what the values are: CSS variables in the web app, literal colors in a picture.
 */

import {
  type CompiledDiagram,
  type CompiledEdge,
  type CompiledNode,
  headsOf,
  type TextLine,
} from "./drawing.ts";
import type { Role } from "./elements.ts";
import { type Rect, union } from "./geometry.ts";
import { badge, corner, defaultMetrics, iconGrid } from "./metrics.ts";
import * as shape from "./outlines.ts";
import type { ColorToken, DashToken, StrokeToken } from "./paint.ts";

/** An attribute value: numbers are pixels or plain numbers. */
export type SvgValue = string | number;
/** SVG attributes by their SVG names, such as `stroke-width`. */
export type SvgAttributes = Record<string, SvgValue | undefined>;

/** The role and category whose colors a group paints with; a frame without a role has its own. */
export interface Look {
  role?: Role | undefined;
  category?: number | undefined;
  frame?: boolean;
}

/**
 * What a group of the drawing is: the element it shows (`id`), whose step state it takes
 * (`state`), whether the reader can point at it (`target`), and whether it only paints (`decor`).
 */
export interface Layer {
  id?: string;
  /** What the element is drawn as: its shape, or `edge`, `enclosure`, or `frame`. */
  shape?: string;
  state?: string;
  target?: { label: string };
  decor?: boolean;
  look?: Look;
}

/** An SVG element and its children. An icon's markup comes from the icon package as `markup`. */
export interface SvgElement {
  tag: string;
  attributes: SvgAttributes;
  children?: SvgNode[];
  markup?: string;
  layer?: Layer;
}

/** A line of text in a color, with a halo in the figure's color when it crosses lines. */
export interface SvgText {
  line: TextLine;
  fill: string;
  halo: boolean;
}

/** A node of the drawn tree. */
export type SvgNode = SvgElement | SvgText;

/** Is this node a line of text? */
export const isText = (node: SvgNode): node is SvgText => "line" in node;

/** The colors an element paints with: its ink, fill, label color, and stroke weight. */
export interface Ink {
  ink: string;
  fill: string;
  label: string;
  weight: SvgValue;
}

/** What only a pointer needs: wide hit areas on lines, and the ring a cell shows on hover. */
export interface PointerPaint {
  hitWidth: number;
  ringWidth: SvgValue;
}

/**
 * The values a drawing paints with. `ink` gives an element's colors from its look, and `boost`
 * the weight of a line that grows when the reader points at its element.
 */
export interface DiagramPaint {
  colors: Record<ColorToken, string>;
  stroke: Record<StrokeToken, SvgValue>;
  dash: Record<DashToken, string>;
  /** The figure's own color, under halos and stacked shapes. */
  background: string;
  ink: (look: Look) => Ink;
  boost: (weight: SvgValue) => SvgValue;
  /** Present in the web app, where the reader points at elements; absent in pictures. */
  pointer?: PointerPaint;
}

/** Options of `drawDiagram`. */
export interface DrawOptions {
  /** Elements outlined in the warning color, for the diagnostics that name them. */
  flagged?: ReadonlySet<string>;
  /** Elements left out, with the parts that follow them. */
  omit?: ReadonlySet<string>;
  /** Prefix of the ids the drawing defines, unique on the page. */
  idPrefix?: string;
}

const m = defaultMetrics;

const element = (
  tag: string,
  attributes: SvgAttributes,
  children?: SvgNode[],
  layer?: Layer,
): SvgElement => ({ tag, attributes, ...(children ? { children } : {}), ...(layer && { layer }) });

const rect = (r: Rect, rx: number, paint: SvgAttributes) =>
  element("rect", {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    rx: rx || undefined,
    ...paint,
  });

/**
 * Draws a compiled diagram, in the web app's layers: frame outlines, enclosures, passive edges,
 * edges, nodes, record outlines, cell badges, pins, and frame labels. It must have compiled.
 */
export function drawDiagram(
  diagram: CompiledDiagram,
  paint: DiagramPaint,
  options: DrawOptions = {},
): SvgElement[] {
  const { colors: color, stroke, dash, background, pointer } = paint;
  const flagged = options.flagged ?? new Set<string>();
  const omit = options.omit ?? new Set<string>();
  const clip = (id: string) => `${options.idPrefix ?? "clip"}-${id}`;
  const text = (line: TextLine, fill: string, halo = false): SvgText => ({
    line,
    fill: line.muted ? color.textMuted : fill,
    halo,
  });
  const layer = (info: Layer, children: (SvgNode | undefined | false)[]) =>
    element(
      "g",
      {},
      children.filter((c): c is SvgNode => !!c),
      info,
    );
  const outlined = (k: Ink, dashed: boolean): SvgAttributes => ({
    fill: k.fill,
    stroke: k.ink,
    "stroke-width": paint.boost(k.weight),
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
    return element("g", {}, [
      element("circle", {
        cx: c.x,
        cy: c.y,
        r: badge.radius,
        fill: color.warning,
        stroke: background,
        "stroke-width": 2,
      }),
      element("path", {
        d: shape.badgeMark(c),
        fill: "none",
        stroke: color.canvas,
        "stroke-width": 1.8,
        "stroke-linecap": "round",
      }),
    ]);
  };

  const shapeOf = (node: CompiledNode, k: Ink): SvgNode[] => {
    const r = node.rect;
    const style = outlined(k, node.role === "external");
    switch (node.shape) {
      case "box":
      case "doc": {
        const rects = shape.stack(r, node.replicas);
        const part = (s: Rect, attributes: SvgAttributes) =>
          node.shape === "doc"
            ? element("path", { d: shape.page(s), ...attributes })
            : rect(s, corner.shape, attributes);
        const cover = { fill: background, stroke: "none" };
        return rects.flatMap((s) => [
          ...(rects.length > 1 ? [part(s, cover)] : []),
          part(s, style),
        ]);
      }
      case "cylinder":
      case "queue": {
        const { body, cap } = node.shape === "cylinder" ? shape.cylinder(r) : shape.queue(r);
        return [element("path", { d: body, ...style }), element("ellipse", { ...cap, ...style })];
      }
      case "io":
        return [element("polygon", { points: shape.pointList(shape.parallelogram(r)), ...style })];
      case "actor": {
        const { head, body } = shape.actor(r);
        const figure = {
          fill: "none",
          stroke: k.ink,
          "stroke-width": paint.boost(k.weight),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        };
        return [
          element("g", figure, [element("circle", { ...head }), element("path", { d: body })]),
        ];
      }
      case "note": {
        const { body, fold } = shape.note(r);
        return [
          element("path", { d: body, ...style }),
          element("path", {
            d: fold,
            ...style,
            fill: color.diagramShade,
            "stroke-dasharray": undefined,
          }),
        ];
      }
      case "decision":
        return [element("polygon", { points: shape.pointList(shape.diamond(r)), ...style })];
      case "start":
        return [
          element("circle", {
            cx: r.x + r.width / 2,
            cy: r.y + r.height / 2,
            r: r.width / 2,
            fill: color.text,
          }),
        ];
      case "end": {
        const center = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
        return [
          element("circle", {
            ...center,
            r: r.width / 2 - 0.75,
            fill: "none",
            stroke: color.text,
            "stroke-width": stroke.line,
          }),
          element("circle", { ...center, r: r.width / 2 - 5, fill: color.text }),
        ];
      }
      case "record": {
        if (node.rules !== undefined)
          return [
            element("clipPath", { id: clip(node.id) }, [rect(r, corner.shape, {})]),
            rect(r, corner.shape, { fill: k.fill, stroke: "none" }),
          ];
        const divider =
          node.divider === undefined
            ? []
            : [
                element("path", {
                  d: shape.rule(r, node.divider),
                  stroke: k.ink,
                  "stroke-width": stroke.hairline,
                }),
              ];
        return [rect(r, corner.shape, style), ...divider];
      }
      case "cell": {
        const filled = node.role !== "default" || node.category !== undefined;
        const parts = [
          filled
            ? rect(r, 0, { fill: k.fill, stroke: "none" })
            : pointer && rect(r, 0, { fill: "transparent", stroke: "none" }),
          pointer &&
            rect(shape.outline(r, -2), 0, {
              fill: "none",
              stroke: k.ink,
              "stroke-width": pointer.ringWidth,
            }),
        ].filter((p): p is SvgElement => !!p);
        if (!parts.length) return [];
        return [
          element(
            "g",
            { "clip-path": node.parent ? `url(#${clip(node.parent)})` : undefined },
            parts,
          ),
        ];
      }
      case "mark":
        return [
          rect(r, corner.mark, {
            fill: k.fill,
            stroke: k.ink,
            "stroke-width": paint.boost(stroke.hairline),
          }),
        ];
      default:
        return pointer ? [rect(r, 0, { fill: "transparent" })] : [];
    }
  };

  const iconOf = (node: CompiledNode, k: Ink): SvgElement | undefined => {
    if (!node.icon || !Object.hasOwn(diagram.icons, node.icon.name)) return;
    const { x, y, width, height } = node.icon.rect;
    return {
      tag: "svg",
      attributes: {
        x,
        y,
        width,
        height,
        viewBox: `0 0 ${iconGrid} ${iconGrid}`,
        color: node.shape === "icon" ? k.ink : k.label,
        overflow: "visible",
        "aria-hidden": "true",
      },
      markup: diagram.icons[node.icon.name] as string,
    };
  };

  const nodeOf = (node: CompiledNode): SvgElement | undefined => {
    if (node.shape === "space") return;
    const state = node.passive ? node.follows : node.id;
    if (node.shape === "bar")
      return layer({ id: node.id, shape: "bar", ...(state && { state }) }, [
        rect(node.rect, 2, {
          fill: color.surfaceHover,
          stroke: color.borderControl,
          "stroke-width": stroke.hairline,
        }),
      ]);
    const layered = (node.shape === "record" && node.rules !== undefined) || node.shape === "cell";
    const look = { role: node.role, category: node.category };
    const k = paint.ink(look);
    const info: Layer = node.passive
      ? { shape: node.shape, ...(state && { state }), look }
      : { id: node.id, shape: node.shape, state: node.id, target: { label: node.label }, look };
    const r = node.rect;
    return layer(info, [
      ...shapeOf(node, k),
      iconOf(node, k),
      ...node.lines.map((line) => text(line, k.label)),
      node.role === "warning" && !layered && warningBadge(r),
      flagged.has(node.id) &&
        !layered &&
        flag(node.labelRect ? (union([r, node.labelRect]) as Rect) : r, 4, 8),
    ]);
  };

  const recordOutline = (node: CompiledNode): SvgElement => {
    const look = { role: node.role, category: node.category };
    const k = paint.ink(look);
    const rule = { stroke: k.ink, "stroke-width": stroke.hairline };
    return layer({ state: node.id, decor: true, look }, [
      rect(node.rect, corner.shape, { ...outlined(k, node.role === "external"), fill: "none" }),
      node.divider !== undefined &&
        element("path", { d: shape.rule(node.rect, node.divider), ...rule }),
      !!node.rules?.length && element("path", { d: shape.segments(node.rules), ...rule }),
      node.role === "warning" && warningBadge(node.rect),
      flagged.has(node.id) && flag(node.rect, 4, 8),
    ]);
  };

  const pin = (node: CompiledNode): SvgElement => {
    const look = { role: node.role, category: node.category };
    const k = paint.ink(look);
    const { x, y } = node.rect;
    const label: TextLine = {
      text: String(node.pin),
      x,
      y,
      size: m.tabSize,
      weight: m.labelWeight,
    };
    return layer({ state: node.id, decor: true, look }, [
      element("circle", {
        cx: x,
        cy: y,
        r: badge.radius + 1,
        fill: k.ink,
        stroke: background,
        "stroke-width": 2,
      }),
      text(label, color.canvas),
    ]);
  };

  const edgeOf = (edge: CompiledEdge): SvgElement => {
    const d = shape.roundedPath(edge.points, edge.radius);
    const look = { role: edge.role, category: edge.category };
    const k = paint.ink(look);
    if (edge.passive)
      return layer({ look }, [
        element("path", {
          d,
          fill: "none",
          stroke: k.ink,
          "stroke-width": stroke.hairline,
          "stroke-dasharray": dash.dotted,
        }),
      ]);
    const line = {
      fill: "none",
      stroke: k.ink,
      "stroke-width": paint.boost(k.weight),
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    };
    const target = { label: edge.ariaLabel };
    return layer({ id: edge.id, shape: "edge", state: edge.id, target, look }, [
      element("path", { d, ...line, "stroke-dasharray": edge.dashed ? dash.dashed : undefined }),
      pointer &&
        element("path", {
          d,
          fill: "none",
          stroke: "transparent",
          "stroke-width": pointer.hitWidth,
        }),
      ...headsOf(edge).map((head) =>
        head.kind === "open"
          ? element("polyline", { points: shape.pointList(head.points), ...line })
          : element("polygon", { points: shape.pointList(head.points), fill: k.ink }),
      ),
      ...edge.labels.flatMap((label) => label.lines.map((l) => text(l, color.textBody, true))),
      ...(flagged.has(edge.id) ? edge.labels.map((label) => flag(label.rect, 1, 4)) : []),
    ]);
  };

  const frameLook = (f: { role?: Role | undefined; category?: number | undefined }): Look =>
    f.role ? { role: f.role, category: f.category } : { frame: true, category: f.category };

  const out: (SvgElement | undefined)[] = [];
  for (const f of diagram.frames) {
    const look = frameLook(f);
    const k = paint.ink(look);
    const line = { fill: "none", stroke: k.ink, "stroke-width": k.weight };
    out.push(
      layer({ id: f.id, shape: "frame", state: f.id, look }, [
        rect(f.rect, corner.frame, {
          ...line,
          "stroke-dasharray": f.role === "external" ? dash.dashed : undefined,
        }),
        ...f.dividers.map((divider) =>
          element("path", {
            d: shape.rule(f.rect, divider.y),
            ...line,
            "stroke-dasharray": dash.dashed,
          }),
        ),
      ]),
    );
  }
  for (const e of diagram.enclosures) {
    const look = { role: e.role, category: e.category };
    const k = paint.ink(look);
    const ink = { stroke: k.ink, "stroke-width": paint.boost(k.weight) };
    out.push(
      layer({ id: e.id, shape: "enclosure", state: e.id, look }, [
        rect(e.rect, corner.group, {
          fill: pointer ? "transparent" : "none",
          ...ink,
          "stroke-dasharray": dash.dashed,
        }),
        e.title &&
          e.titleRect &&
          rect(e.titleRect, e.titleRect.height / 2, { fill: background, ...ink }),
        e.title && e.titleRect && text(e.title, k.label),
      ]),
    );
  }
  for (const edge of diagram.edges) if (edge.passive) out.push(edgeOf(edge));
  for (const edge of diagram.edges) if (!edge.passive) out.push(edgeOf(edge));
  for (const node of diagram.nodes) out.push(nodeOf(node));
  for (const node of diagram.nodes) if (node.rules) out.push(recordOutline(node));
  for (const node of diagram.nodes)
    if (node.shape === "cell" && node.role === "warning")
      out.push(
        layer({ state: node.id, decor: true, look: { role: node.role } }, [
          warningBadge(node.rect),
        ]),
      );
  for (const node of diagram.nodes) if (node.pin !== undefined) out.push(pin(node));
  for (const f of diagram.frames) {
    const look = frameLook(f);
    const k = paint.ink(look);
    out.push(
      layer({ state: f.id, look }, [
        f.tab &&
          element("path", {
            d: shape.fragmentTab(f.tab.rect),
            fill: k.fill,
            stroke: k.ink,
            "stroke-width": k.weight,
          }),
        f.tab && text(f.tab.line, k.label),
        f.title && text(f.title, k.label, true),
        ...f.dividers.map((divider) => divider.label && text(divider.label, k.label, true)),
      ]),
    );
  }
  return out.filter(
    (g): g is SvgElement =>
      !!g && !!g.children?.length && !(g.layer?.state !== undefined && omit.has(g.layer.state)),
  );
}
