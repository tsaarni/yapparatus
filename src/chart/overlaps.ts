/** Labels of a chart that run into each other, which no margin can fix. */
import { type Axis, axes, type Label, type Labels } from "./labels.ts";
import { crowding } from "./margins.ts";
import type { ChartProblem } from "./spec.ts";
import { quadsOverlap } from "./text-box.ts";

/** How far two labels may overlap, in pixels, before it shows. */
const overlapTolerance = 1;

/** Do two labels cover each other by more than the tolerance? */
function collide(a: Label, b: Label): boolean {
  return a.quads.some((p) => b.quads.some((q) => quadsOverlap(p, q, overlapTolerance)));
}

/** The middle of a label along an axis, to put its tick labels in order. */
function along(axis: Axis, label: Label): number {
  const { box } = label;
  return axis.endsWith("x") ? box.left + box.right : box.top + box.bottom;
}

/**
 * Tick labels of one axis that run into their neighbors, and axis labels that run into the tick
 * labels beside them, each a `CHART_OVERLAP` problem.
 */
export function overlaps(labels: Labels): ChartProblem[] {
  const problems: ChartProblem[] = [];
  for (const axis of axes) {
    const sorted = [...labels.ticks[axis]].sort((a, b) => along(axis, a) - along(axis, b));
    const at = sorted.findIndex((a, i) => {
      const b = sorted[i + 1];
      return b !== undefined && collide(a, b);
    });
    if (at >= 0)
      problems.push({
        code: "CHART_OVERLAP",
        subject: axis,
        message: `The ${axis} tick labels "${sorted[at]?.text}" and "${sorted[at + 1]?.text}" overlap. Show fewer ticks with ${axis}: { ticks: 5 }, rotate them with ${axis}: { tickRotate: -30 }, shorten the values, or swap the axes.`,
      });
    const title = labels.titles[axis];
    const tick = title && crowding(labels, axis, title).find((t) => collide(title, t));
    if (title && tick)
      problems.push({
        code: "CHART_OVERLAP",
        subject: `${axis} label`,
        message: `The ${axis} axis label "${title.text}" overlaps the tick label "${tick.text}". Shorten it with ${axis}: { label: "…" }, or leave it out with ${axis}: { label: null }.`,
      });
  }
  return problems;
}
