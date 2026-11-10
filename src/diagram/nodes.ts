/**
 * Nodes, enclosures, and frames: their compiled form, with text lines placed.
 */

import type { CompiledEnclosure, CompiledFrame, CompiledNode, TextLine } from "./compiled.ts";
import type { Rect, Vec } from "./geometry.ts";
import type { Layout } from "./layout.ts";
import { fontsOf, fragment, type Measure, type Metrics, shapes, tab } from "./metrics.ts";
import { type Corner, type Enclosure, type Frame, type Node, toExpr } from "./scene.ts";
import type { Content, Text } from "./text.ts";

export function createNodes(
  m: Metrics,
  measure: Measure,
  text: Text,
  layout: Layout,
  categoryOf: (name: string | undefined) => { category?: number },
) {
  const fonts = fontsOf(m);
  const { measureNode, capHeight, textAt, tabWidth } = text;
  const { terminalLabel, member, recordLines, evalPoint, enclosureRect } = layout;

  function compileNode(node: Node, rect: Rect): CompiledNode {
    const c = measureNode(node);
    const line = (l: Content["lines"][number], x: number, y: number, align: TextLine["align"]) => ({
      text: l.text,
      x,
      y,
      size: l.size,
      weight: l.weight,
      mono: l.mono,
      muted: l.muted,
      align,
    });
    const stackLines = (
      list: Content["lines"],
      top: number,
      x: number,
      align: TextLine["align"],
    ) => {
      let y = top;
      return list.map((l) => {
        const lh = l.size * m.lineHeight;
        const out = line(l, x, y + lh / 2, align);
        y += lh;
        return out;
      });
    };
    const centerX = rect.x + rect.width / 2;
    let lines: TextLine[];
    let divider: number | undefined;
    let rules: Array<[Vec, Vec]> | undefined;
    const labelRect = terminalLabel(node, rect);
    switch (node.shape) {
      case "cell":
      case "mark":
        lines = member(node).lines;
        break;
      case "dot":
      case "ring":
        lines = labelRect
          ? node.options.side === undefined || node.options.side === "right"
            ? stackLines(c.lines, labelRect.y, labelRect.x, "start")
            : stackLines(c.lines, labelRect.y, labelRect.x + labelRect.width / 2, "middle")
          : [];
        break;
      case "actor":
        lines = stackLines(
          c.lines,
          rect.y + shapes.actor.figure + shapes.actor.gap,
          centerX,
          "middle",
        );
        break;
      case "note":
        lines = stackLines(c.lines, rect.y + shapes.note.padY, rect.x + shapes.note.padX, "start");
        break;
      case "record": {
        lines = stackLines(c.lines, rect.y + shapes.record.padY, centerX, "middle");
        const record = recordLines(node, rect);
        lines.push(...record.lines);
        divider = record.divider;
        rules = record.rules;
        break;
      }
      default: {
        const cap = capHeight(node, rect.width);
        // Code keeps its lines' start; other text is centered.
        const code = node.shape === "text" && node.options.mono;
        lines = stackLines(
          c.lines,
          rect.y + rect.height / 2 + cap / 2 - c.height / 2,
          code ? rect.x : centerX,
          code ? "start" : "middle",
        );
      }
    }
    return {
      id: node.id,
      explicitId: node.explicitId,
      shape: node.shape,
      role: node.options.role ?? "default",
      ...categoryOf(node.options.category),
      label: [node.label, node.options.sub].filter(Boolean).join(", "),
      rect,
      lines,
      passive: node.passive,
      stepOnly: node.options.stepOnly ?? false,
      ...(node.follows ? { follows: node.follows.id } : {}),
      ...(divider !== undefined ? { divider } : {}),
      // A record with cells always has rules, even none: it is drawn under and over its cells.
      ...(rules && node.members.length ? { rules } : {}),
      ...(node.member ? { parent: node.member.parent.id } : {}),
      ...(node.member?.pin !== undefined ? { pin: node.member.pin } : {}),
      ...(labelRect ? { labelRect } : {}),
    };
  }

  /** A title tab sitting on the border at one corner. */
  function titleGeometry(title: string, rect: Rect, corner: Corner = "topLeft") {
    const width = tabWidth(title);
    const x = corner.endsWith("Right") ? rect.x + rect.width - 14 - width : rect.x + 14;
    const y = corner.startsWith("bottom") ? rect.y + rect.height : rect.y;
    const titleRect = { x, y: y - tab.height / 2, width, height: tab.height };
    return { title: textAt(title, x + tab.pad, y, fonts.tab, true), titleRect };
  }

  /** A fragment's operator tab: text, padding, and a slanted lower-right corner. */
  function fragmentTab(text: string, x: number, y: number) {
    const width = measure(text, fonts.tab) + fragment.padX + fragment.slant + fragment.padX / 2;
    return {
      rect: { x, y, width, height: fragment.tabHeight },
      line: textAt(text, x + fragment.padX, y + fragment.textY, fonts.tab),
    };
  }

  function compileFrame(frame: Frame): CompiledFrame {
    const a = evalPoint(toExpr(frame.from));
    const b = evalPoint(toExpr(frame.to));
    const rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
    const tabOf = frame.options.tab ? fragmentTab(frame.options.tab, rect.x, rect.y) : undefined;
    const titleX = rect.x + (tabOf ? tabOf.rect.width : 0) + fragment.padX;
    return {
      id: frame.id,
      rect,
      ...(tabOf ? { tab: tabOf } : {}),
      ...(frame.options.title
        ? {
            title: textAt(
              frame.options.title,
              titleX,
              rect.y + fragment.textY,
              fonts.frameTitle,
              true,
            ),
          }
        : {}),
      dividers: (frame.options.dividers ?? []).map((d) => {
        const y = evalPoint(toExpr(d.at)).y;
        return {
          y,
          ...(d.label
            ? {
                label: textAt(
                  d.label,
                  rect.x + fragment.padX,
                  y + fragment.textY + 1,
                  fonts.frameTitle,
                  true,
                ),
              }
            : {}),
        };
      }),
    };
  }

  /** An enclosure's compiled form: its rectangle and its title tab. */
  function compileEnclosure(e: Enclosure): CompiledEnclosure {
    const rect = enclosureRect(e);
    return {
      id: e.id,
      explicitId: e.explicitId,
      role: e.options.role ?? "muted",
      ...categoryOf(e.options.category),
      rect,
      ...(e.options.title ? titleGeometry(e.options.title, rect, e.options.titleAt) : {}),
    };
  }

  return { compileNode, compileFrame, compileEnclosure };
}
