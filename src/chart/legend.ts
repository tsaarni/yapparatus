/** The legend under a chart: its categories and their colors, or the range of a ramp. */
import { type ChartSpec, columnOf, marksOf } from "./spec.ts";

/** A category of the legend and its color. */
export interface LegendEntry {
  value: string;
  color: string;
}

/** Categories with their colors, or a ramp of amounts from `low` to `high`. */
export type ChartLegend =
  | { kind: "categories"; entries: LegendEntry[] }
  | { kind: "ramp"; low: number; high: number };

/** Position channels by the scale whose axis shows them. */
const positions = { x: ["x", "x1", "x2"], y: ["y", "y1", "y2"] } as const;

/**
 * Does the legend repeat an axis? It does when every mark colored by a column also places that
 * column on an axis the drawing shows, as bars with `x` and `fill` both "Language" do.
 */
export function repeatsAxis(spec: ChartSpec, svg: Element): boolean {
  const shown = (axis: string) =>
    svg.querySelector(`g[aria-label="${axis}-axis tick label"] text`) !== null;
  const colored = marksOf(spec).flatMap((mark) => {
    const color = columnOf(mark.channels.fill) ?? columnOf(mark.channels.stroke);
    return color ? [{ mark, color }] : [];
  });
  return (
    colored.length > 0 &&
    colored.every(({ mark, color }) => {
      const on = (axis: "x" | "y") =>
        shown(axis) && positions[axis].some((c) => columnOf(mark.channels[c]) === color);
      return (
        on("x") ||
        on("y") ||
        (mark.fx === color && shown("fx")) ||
        (mark.fy === color && shown("fy"))
      );
    })
  );
}
