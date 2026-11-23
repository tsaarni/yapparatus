/** A diagram's legend: the figure legend, with swatches drawn as the diagram draws its elements. */

import * as stylex from "@stylexjs/stylex";
import type { LegendEntry } from "../../diagram/drawing.ts";
import { FigureLegend } from "../components/figure-legend.tsx";
import { categoryStyle } from "./element.tsx";

/** The figure legend of a diagram: an entry highlights the elements of its category. */
export function Legend({
  legend,
  preview,
}: {
  legend: LegendEntry[];
  preview: (elements: string[] | undefined) => void;
}) {
  const entries = legend.map((entry) => ({
    key: entry.id,
    name: entry.name,
    swatch: [categoryStyle(entry.slot), styles.swatch],
  }));
  return (
    <FigureLegend
      entries={entries}
      preview={(key) => preview(legend.find((entry) => entry.id === key)?.elements)}
    />
  );
}

const styles = stylex.create({
  /** A diagram category has an ink edge around its fill, as its elements have. */
  swatch: {
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "var(--ink)",
    backgroundColor: "var(--fill)",
  },
});
