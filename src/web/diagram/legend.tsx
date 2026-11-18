/**
 * The legend under a figure: one entry per category, which highlights its elements.
 */

import * as stylex from "@stylexjs/stylex";
import type { LegendEntry } from "../../diagram/drawing.ts";
import { Button } from "../controls/button.tsx";
import { styled } from "../style/styled.ts";
import { space } from "../style/theme.stylex.ts";
import { categoryStyle } from "./element.tsx";

/**
 * One entry per category with its color and words. Pointing at or focusing an entry highlights
 * the category's elements, so the reader can find them without telling colors apart.
 */
export function Legend({
  legend,
  preview,
}: {
  legend: LegendEntry[];
  preview: (elements: string[] | undefined) => void;
}) {
  return (
    <ul aria-label="Legend" {...styled("diagram-legend", styles.legend)}>
      {legend.map((entry) => (
        <li key={entry.id}>
          <Button
            variant="ghost"
            size="small"
            title="Highlight these elements"
            onMouseEnter={() => preview(entry.elements)}
            onMouseLeave={() => preview(undefined)}
            onFocus={() => preview(entry.elements)}
            onBlur={() => preview(undefined)}
          >
            <span {...stylex.props(categoryStyle(entry.slot), styles.swatch)} />
            {entry.name}
          </Button>
        </li>
      ))}
    </ul>
  );
}

const styles = stylex.create({
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.xs,
    margin: 0,
    marginTop: space.md,
    padding: 0,
    listStyle: "none",
  },
  swatch: {
    display: "inline-block",
    flexShrink: 0,
    width: 14,
    height: 10,
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "var(--ink)",
    borderRadius: 3,
    backgroundColor: "var(--fill)",
  },
});
