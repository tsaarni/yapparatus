/**
 * Records and marked text: the grid of a record's cells, and where each member sits.
 */

import type { TextLine } from "./compiled.ts";
import { anchorOf, type Rect, round, type Side, sideToward, type Vec } from "./geometry.ts";
import { type FontSpec, fontsOf, type Measure, type Metrics, shapes } from "./metrics.ts";
import type { Element, Member, Node } from "./scene.ts";
import type { Report, Text } from "./text.ts";

/** A record's grid, relative to the record's top-left corner. */
export interface GridLayout {
  width: number;
  height: number;
  /** Bottom of the title band, and of the header under it; 0 without them. */
  titleBand: number;
  headerBand: number;
  /** Top and left of the cells, after the title, the header, the ruler, and the row labels. */
  top: number;
  left: number;
  unit: number;
  columns: number;
  rows: number;
  /** Where each tab-separated column of text starts, from the start of the cell's text. */
  stops: number[];
  /** Each cell's rectangle at the natural width, in the order of `node.members`. */
  cells: Rect[];
  font: FontSpec;
  /** Ruler labels over each column and beside each row; empty when that side has none. */
  ruler: { top: string[]; left: string[] };
}

/**
 * Records need the layout to place a member inside its parent, and the layout needs records
 * to size a record. The layout creates them and passes its own `bounds`.
 */
export function createRecords(
  m: Metrics,
  measure: Measure,
  report: Report,
  text: Text,
  bounds: (el: Element) => Rect,
) {
  const grids = new Map<Node, GridLayout>();
  const memberRects = new Map<Node, { rect: Rect; lines: TextLine[] }>();
  const fonts = fontsOf(m);
  const { measureNode, textAt, textFont } = text;

  /**
   * A record's cells fill `columns` grid columns left to right, each spanning `span` of
   * them. A cell is always a rectangle: it fits the rest of its row, or it starts a row and
   * covers whole rows. One column is as wide as the widest cell needs per column it spans.
   */
  function grid(node: Node): GridLayout {
    const cached = grids.get(node);
    if (cached) return cached;
    const r = shapes.record;
    const o = node.options;
    const columns = Math.max(1, Math.round(o.columns ?? 1));
    const font = { family: o.mono ? m.mono : m.sans, size: m.smallSize, weight: m.textWeight };
    const cells = node.members;
    // Tab-separated columns of text line up across all cells and the header.
    const header = o.header !== undefined ? [o.header] : [];
    const segments = [...header, ...cells.map((c) => c.label)].map((t) =>
      t.split("\t").map((x) => measure(x, font)),
    );
    const stops: number[] = [0];
    for (let k = 1; k < Math.max(1, ...segments.map((s) => s.length)); k++) {
      const before = segments.filter((s) => s.length > k).map((s) => s[k - 1] as number);
      stops[k] = (stops[k - 1] as number) + Math.max(0, ...before) + r.tabGap;
    }
    const textWidth = (s: number[] = []) =>
      (stops[s.length - 1] as number) + (s[s.length - 1] ?? 0) + 2 * r.cellPad;
    // Place each cell: in the rest of its row, or over whole rows from the start of one.
    let row = 0;
    let col = 0;
    const placed = cells.map((cell) => {
      const span = cell.member?.kind === "cell" ? cell.member.span : 1;
      if (col === 0 && span > columns && span % columns === 0) {
        const at = { row, col, span: columns, rows: span / columns };
        row += at.rows;
        return at;
      }
      const fits = Math.min(span, columns - col);
      if (fits < span)
        report(
          "CELL_SPAN",
          `${cell.id} spans ${span} columns, but ${columns - col} remain in its row. A cell fills the rest of its row or whole rows; split it into two cells.`,
          [cell.id],
        );
      const at = { row, col, span: fits, rows: 1 };
      col += fits;
      if (col >= columns) {
        col = 0;
        row++;
      }
      return at;
    });
    const rows = row + (col > 0 ? 1 : 0);
    const c = measureNode(node);
    const titleBand = node.label ? c.height + 2 * r.padY : 0;
    const headerBand = header.length ? r.row : 0;
    const labels = (f: ((i: number) => string | number) | undefined, n: number) =>
      f ? Array.from({ length: n }, (_, i) => String(f(i))) : [];
    const ruler = { top: labels(o.ruler?.top, columns), left: labels(o.ruler?.left, rows) };
    const gutter = ruler.left.length
      ? Math.max(...ruler.left.map((t) => measure(t, fonts.ruler))) + 2 * r.gutterPad
      : 0;
    const needed = Math.max(
      0,
      ...placed.map((p, i) => textWidth(segments[i + header.length]) / p.span),
      (Math.max(
        header.length ? textWidth(segments[0]) : 0,
        c.width + 2 * r.padX,
        columns === 1 ? 140 : 0,
      ) -
        gutter) /
        columns,
    );
    const unit = o.width !== undefined ? (o.width - gutter) / columns : needed;
    // Column labels are centered on their columns; two that touch cannot be read apart.
    const shown = ruler.top.flatMap((t, i) => (t ? [{ i, w: measure(t, fonts.ruler) }] : []));
    const crowded = shown.some((a, k) => {
      const b = shown[k - 1];
      return b !== undefined && b.w / 2 + a.w / 2 + 4 > (a.i - b.i) * unit;
    });
    if (crowded)
      report(
        "RULER_CROWDED",
        `${node.id}: the column labels are wider than the columns. Return "" for the columns to skip, such as (i) => (i % 4 ? "" : i).`,
        [node.id],
      );
    const top = titleBand + headerBand + (ruler.top.length ? r.ruler : 0);
    const g: GridLayout = {
      width: gutter + unit * columns,
      height: top + rows * r.row,
      titleBand,
      headerBand,
      top,
      left: gutter,
      unit,
      columns,
      rows,
      stops,
      cells: placed.map((p) => ({
        x: gutter + p.col * unit,
        y: top + p.row * r.row,
        width: p.span * unit,
        height: p.rows * r.row,
      })),
      font,
      ruler,
    };
    grids.set(node, g);
    return g;
  }

  /**
   * The columns and cells at the record's final width. A record can be wider than its grid
   * needs, as with `equalWidth`; its columns then share the extra width.
   */
  function fitted(g: GridLayout, width: number): { unit: number; cells: Rect[] } {
    const unit = Math.max(g.unit, (width - g.left) / g.columns);
    const k = g.unit > 0 ? unit / g.unit : 1;
    return {
      unit,
      cells: g.cells.map((c) => ({ ...c, x: g.left + (c.x - g.left) * k, width: c.width * k })),
    };
  }

  /** One row of tab-separated text, its columns at the record's tab stops. */
  function tabbed(text: string, g: GridLayout, x: number, y: number, muted: boolean): TextLine[] {
    return text
      .split("\t")
      .map((t, k) =>
        textAt(t, x + shapes.record.cellPad + (g.stops[k] ?? 0), y, g.font, muted || k > 0),
      );
  }

  /** A member's place: a cell in its record, or a mark's span in its text. */
  function member(node: Node): { rect: Rect; lines: TextLine[] } {
    const cached = memberRects.get(node);
    if (cached) return cached;
    const place = node.member;
    if (!place) throw new Error(`${node.id} is not a member.`);
    const outer = bounds(place.parent);
    const result =
      place.kind === "cell" ? cell(node, place.parent, outer) : mark(node, place, outer);
    memberRects.set(node, result);
    return result;
  }

  function cell(node: Node, record: Node, outer: Rect) {
    const g = grid(record);
    const r = fitted(g, outer.width).cells[record.members.indexOf(node)] ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    const rect = { ...r, x: outer.x + r.x, y: outer.y + r.y };
    const cy = rect.y + rect.height / 2;
    // On a grid of several columns, as in a packet header, a field's name is centered. In a
    // table, it starts the row, and tabs align its columns with the others.
    const segs = node.label.split("\t");
    const centered = (record.options.columns ?? 1) > 1 && segs.length === 1;
    const lines = centered
      ? [
          {
            ...textAt(node.label, rect.x + rect.width / 2, cy, g.font),
            align: "middle" as const,
          },
        ]
      : tabbed(node.label, g, rect.x, cy, false);
    const need =
      (g.stops[segs.length - 1] ?? 0) +
      measure(segs[segs.length - 1] ?? "", g.font) +
      2 * shapes.record.cellPad;
    if (need > rect.width + 0.5)
      report(
        "TEXT_OVERFLOW",
        `${node.id}: "${node.label}" needs ${round(need)} units but its cell is ${round(rect.width)} wide. Shorten it, or give the record a larger width.`,
        [node.id],
      );
    return { rect, lines };
  }

  /** A mark: a substring that occurs once in the text, or whole lines of it. */
  function mark(node: Node, place: Extract<Member, { kind: "mark" }>, outer: Rect) {
    const text = place.parent;
    const c = measureNode(text);
    const font = textFont(text);
    const lh = font.size * m.lineHeight;
    const top = outer.y + outer.height / 2 - c.height / 2;
    // Where a line starts: at the left in code, centered otherwise.
    const startOf = (width: number) =>
      text.options.mono ? outer.x : outer.x + (outer.width - width) / 2;
    const unmatched = (why: string) => {
      report("MARK_UNMATCHED", `${node.id}: ${why}`, [node.id]);
      return { rect: { x: outer.x, y: outer.y, width: 0, height: 0 }, lines: [] };
    };
    if ("lines" in place) {
      const [a = Number.NaN, b = a] = place.lines.split("-").map(Number);
      if (!(a >= 1 && b >= a && b <= c.lines.length))
        return unmatched(`lines "${place.lines}" are not within 1–${c.lines.length}.`);
      const pad = shapes.mark.linesPad;
      const rect = {
        x: outer.x - pad,
        y: top + (a - 1) * lh,
        width: outer.width + 2 * pad,
        height: (b - a + 1) * lh,
      };
      const lines = c.lines
        .slice(a - 1, b)
        .map((l, i) => textAt(l.text, startOf(l.width), top + (a - 1 + i + 0.5) * lh, font));
      return { rect, lines };
    }
    const found = c.lines.flatMap((l, line) => {
      const at: Array<{ line: number; at: number }> = [];
      for (
        let i = l.text.indexOf(place.text);
        place.text && i >= 0;
        i = l.text.indexOf(place.text, i + 1)
      )
        at.push({ line, at: i });
      return at;
    });
    if (found.length > 1)
      return unmatched(
        `"${place.text}" occurs ${found.length} times. Mark a longer text, or whole lines.`,
      );
    const only = found[0];
    const line = only && c.lines[only.line];
    if (!only || !line)
      return unmatched(
        text.label.replace(/\s+/g, " ").includes(place.text)
          ? `"${place.text}" is split across wrapped lines. Widen the text, or mark whole lines.`
          : `"${place.text}" does not occur in ${text.id}.`,
      );
    const x = startOf(line.width) + measure(line.text.slice(0, only.at), font);
    const rect = { x, y: top + only.line * lh, width: measure(place.text, font), height: lh };
    return { rect, lines: [textAt(place.text, x, rect.y + lh / 2, font)] };
  }

  /** A record's header, ruler labels, and the lines under its title and between its cells. */
  function recordLines(node: Node, rect: Rect) {
    const g = grid(node);
    const fit = fitted(g, rect.width);
    const lines: TextLine[] = [];
    let divider: number | undefined;
    const top = rect.y + g.top;
    const left = rect.x + g.left;
    const right = rect.x + rect.width;
    const across = (y: number): [Vec, Vec] => [
      { x: rect.x, y },
      { x: right, y },
    ];
    if (g.titleBand && (node.members.length || g.headerBand)) divider = rect.y + g.titleBand;
    const rules: Array<[Vec, Vec]> = [];
    if (node.options.header !== undefined) {
      const y = rect.y + g.titleBand;
      lines.push(...tabbed(node.options.header, g, left, y + g.headerBand / 2, true));
      rules.push(across(y + g.headerBand));
    }
    // Hairlines between cells: each cell draws the right and bottom sides it shares
    // with another. The outline draws the outer sides, over the cells' fills.
    for (const p of fit.cells) {
      const x = rect.x + p.x;
      const y = rect.y + p.y;
      if (p.x + p.width < rect.width - 0.5)
        rules.push([
          { x: x + p.width, y },
          { x: x + p.width, y: y + p.height },
        ]);
      if (p.y + p.height < g.height - 0.5)
        rules.push([
          { x, y: y + p.height },
          { x: x + p.width, y: y + p.height },
        ]);
    }
    const label = (text: string, x: number, y: number) =>
      text ? [{ ...textAt(text, x, y, fonts.ruler, true), align: "middle" as const }] : [];
    g.ruler.top.forEach((t, k) => {
      lines.push(...label(t, left + (k + 0.5) * fit.unit, top - shapes.record.ruler / 2));
    });
    g.ruler.left.forEach((t, r) => {
      lines.push(...label(t, rect.x + g.left / 2, top + (r + 0.5) * shapes.record.row));
    });
    if (g.ruler.top.length)
      rules.push([
        { x: left, y: top },
        { x: right, y: top },
      ]);
    if (g.ruler.left.length)
      rules.push([
        { x: left, y: top },
        { x: left, y: rect.y + rect.height },
      ]);
    return { lines, rules, ...(divider !== undefined ? { divider } : {}) };
  }

  /**
   * Where an edge toward `toward` leaves a cell: the middle of a side on the record's outline,
   * so the edge crosses no other cell: a table row's left or right, an array slot's top or
   * bottom. Of those, the side a line toward the other end crosses first, as for any shape.
   */
  function cellSide(cell: Node, rect: Rect, toward: Vec): Vec {
    const outline = outlineSides(cell, rect);
    return anchorOf(rect, sideToward(rect, toward, outline.length ? outline : undefined));
  }

  /** The sides of a cell that lie on its record's outline, under any title or ruler. */
  function outlineSides(cell: Node, rect: Rect): Side[] {
    const record = cell.member?.parent;
    const outer = record ? bounds(record) : rect;
    const bandAbove = record ? grid(record).top > 0 : false;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
    const sides: Array<[Side, boolean]> = [
      ["left", near(rect.x, outer.x)],
      ["right", near(rect.x + rect.width, outer.x + outer.width)],
      ["top", !bandAbove && near(rect.y, outer.y)],
      ["bottom", near(rect.y + rect.height, outer.y + outer.height)],
    ];
    return sides.filter(([, out]) => out).map(([side]) => side);
  }

  return { grid, member, recordLines, cellSide };
}
