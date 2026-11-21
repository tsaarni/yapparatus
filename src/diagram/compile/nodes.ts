/**
 * Nodes, enclosures, and frames: their compiled form, with text lines placed.
 */

import type { CompiledEnclosure, CompiledFrame, CompiledNode, TextLine } from "../drawing.ts";
import { type Corner, type Enclosure, type Frame, type Node, toExpr } from "../elements.ts";
import type { Rect, Vec } from "../geometry.ts";
import {
  enclosure,
  fontsOf,
  fragment,
  type Measure,
  type Metrics,
  shapes,
  tab,
} from "../metrics.ts";
import { room, stack } from "../outlines.ts";
import type { Icons } from "./icons.ts";
import type { Layout } from "./layout.ts";
import { type Align, type Content, linesHeight, type Text, textLine } from "./text.ts";

/** The compilers for nodes, frames, and enclosures over a finished layout. */
export function createNodes(
  m: Metrics,
  measure: Measure,
  text: Text,
  layout: Layout,
  categoryOf: (name: string | undefined) => { category?: number },
  icons: Icons,
) {
  const fonts = fontsOf(m);
  const { measureNode, textAt, tabWidth } = text;
  const { terminalLabel, member, recordLines, evalPoint, enclosureRect, bounds } = layout;

  function compileNode(node: Node, rect: Rect): CompiledNode {
    const c = measureNode(node);
    const stackLines = (list: Content["lines"], top: number, x: number, align: Align) => {
      let y = top;
      return list.map((l) => {
        const lh = l.size * m.lineHeight;
        const out = textLine(l.text, x, y + lh / 2, l, l.muted, align);
        y += lh;
        return out;
      });
    };
    const centerX = rect.x + rect.width / 2;
    let lines: TextLine[];
    let divider: number | undefined;
    let rules: Array<[Vec, Vec]> | undefined;
    let iconRect: Rect | undefined;
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
      case "icon": {
        const size = shapes.icon.size;
        iconRect = { x: centerX - size / 2, y: rect.y, width: size, height: size };
        lines = stackLines(c.lines, rect.y + size + shapes.icon.gap, centerX, "middle");
        break;
      }
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
        const front = stack(rect, node.options.replicas).at(-1) ?? rect;
        const outline = room(node.shape, front);
        const code = node.shape === "text" && node.options.mono;
        const middle = {
          x: front.x + front.width / 2 + outline.dx,
          y: front.y + front.height / 2 + outline.dy,
        };
        const left = middle.x - c.width / 2;
        if (c.lead) {
          const size = shapes.labelIcon.size;
          iconRect = { x: left, y: middle.y - size / 2, width: size, height: size };
        }
        lines = stackLines(
          c.lines,
          middle.y - linesHeight(c.lines, m) / 2,
          code ? front.x : left + c.lead + (c.width - c.lead) / 2,
          code ? "start" : "middle",
        );
      }
    }
    const icon = icons.iconOf(node);
    return {
      id: node.id,
      shape: node.shape,
      role: node.options.role ?? "default",
      ...categoryOf(node.options.category),
      label: [node.label, node.options.sub].filter(Boolean).join(", "),
      rect,
      lines,
      ...(node.passive ? { passive: true } : {}),
      ...(node.options.stepOnly ? { stepOnly: true } : {}),
      ...(node.follows ? { follows: node.follows.id } : {}),
      ...(divider !== undefined ? { divider } : {}),
      ...(rules && node.members.length ? { rules } : {}),
      ...(node.membership ? { parent: node.membership.parent.id } : {}),
      ...(node.membership?.pin !== undefined ? { pin: node.membership.pin } : {}),
      ...(labelRect ? { labelRect } : {}),
      ...(node.options.replicas ? { replicas: node.options.replicas } : {}),
      ...(icon && iconRect ? { icon: { name: icon, rect: iconRect } } : {}),
    };
  }

  function titleGeometry(title: string, rect: Rect, corner: Corner = "topLeft") {
    const width = tabWidth(title);
    const x = corner.endsWith("Right")
      ? rect.x + rect.width - enclosure.titleInset - width
      : rect.x + enclosure.titleInset;
    const y = corner.startsWith("bottom") ? rect.y + rect.height : rect.y;
    const titleRect = { x, y: y - tab.height / 2, width, height: tab.height };
    return { title: textAt(title, x + tab.pad, y, fonts.tab, true), titleRect };
  }

  function fragmentTab(text: string, x: number, y: number) {
    const width = measure(text, fonts.tab) + fragment.padX + fragment.slant + fragment.padX / 2;
    return {
      rect: { x, y, width, height: fragment.tabHeight },
      line: textAt(text, x + fragment.padX, y + fragment.textY, fonts.tab),
    };
  }

  function compileFrame(frame: Frame): CompiledFrame {
    const rect = bounds(frame);
    const { role, category, stepOnly } = frame.options;
    const tabOf = frame.options.tab ? fragmentTab(frame.options.tab, rect.x, rect.y) : undefined;
    const titleX = rect.x + (tabOf ? tabOf.rect.width : 0) + fragment.padX;
    return {
      id: frame.id,
      ...(role ? { role } : {}),
      ...categoryOf(category),
      ...(stepOnly ? { stepOnly: true } : {}),
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
                  y + fragment.textY + fragment.dividerDrop,
                  fonts.frameTitle,
                  true,
                ),
              }
            : {}),
        };
      }),
    };
  }

  function compileEnclosure(e: Enclosure): CompiledEnclosure {
    const rect = enclosureRect(e);
    return {
      id: e.id,
      role: e.options.role ?? "muted",
      ...categoryOf(e.options.category),
      ...(e.options.stepOnly ? { stepOnly: true } : {}),
      rect,
      ...(e.options.title ? titleGeometry(e.options.title, rect, e.options.titleAt) : {}),
    };
  }

  return { compileNode, compileFrame, compileEnclosure };
}
