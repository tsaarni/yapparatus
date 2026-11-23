/**
 * Areas that stack and lines that do not: `Plot.areaY` with a series stacks implicitly, and
 * `Plot.lineY` over the same columns draws each series from zero, below its area.
 */
import { type ChartProblem, type ChartSpec, columnOf, marksOf, type PlotMark } from "./spec.ts";

/** A stacked area's columns: x, y, and the series, when the stack transform made its y. */
function stackedArea(mark: PlotMark) {
  const { channels } = mark;
  const [y1, y2] = [channels.y1?.value, channels.y2?.value];
  if (mark.ariaLabel !== "area" || typeof y1 !== "object" || typeof y2 !== "object") return;
  const series = columnOf(channels.z) ?? columnOf(channels.fill) ?? columnOf(channels.stroke);
  const [x, y] = [columnOf(channels.x1), columnOf(channels.y2)];
  return x && y && series ? { x, y, series } : undefined;
}

/** Problems for each stacked area with an unstacked line over its columns: `CHART_STACK`. */
export function stackProblems(spec: ChartSpec): ChartProblem[] {
  const marks = marksOf(spec);
  return marks.flatMap((mark) => {
    const area = stackedArea(mark);
    if (!area) return [];
    const { x, y, series } = area;
    const line = marks.find(
      (m) => m.ariaLabel === "line" && m.channels.y?.value === y && columnOf(m.channels.x) === x,
    );
    if (!line) return [];
    return [
      {
        code: "CHART_STACK",
        subject: `stack ${y}`,
        message: `Plot.areaY stacks the series of "${series}" on top of each other, and Plot.lineY draws "${y}" unstacked, so the lines sit below their areas. To draw each area from zero, add y1: 0, with fillOpacity so the areas behind show: Plot.areaY(rows, { x: "${x}", y: "${y}", y1: 0, fill: "${series}", fillOpacity: 0.3 }). To stack the lines too: Plot.lineY(rows, Plot.stackY2({ x: "${x}", y: "${y}", stroke: "${series}" })).`,
      },
    ];
  });
}
