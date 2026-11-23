/**
 * The legend under a figure, a diagram's or a chart's: one entry per category, which highlights
 * the figure's marks of that category.
 */

import * as stylex from "@stylexjs/stylex";
import { Button } from "../controls/button.tsx";
import { styled } from "../style/styled.ts";
import { space } from "../style/theme.stylex.ts";

/** A category in the legend: its words, and the styles that give its swatch the category color. */
export interface FigureLegendEntry {
  key: string;
  name: string;
  swatch: Array<stylex.StyleXStyles | null>;
}

/**
 * One entry per category with its color and words. Pointing at or focusing an entry highlights
 * the category's marks, so the reader can find them without telling colors apart.
 */
export function FigureLegend({
  entries,
  preview,
}: {
  entries: FigureLegendEntry[];
  preview: (key: string | undefined) => void;
}) {
  return (
    <ul aria-label="Legend" {...styled("figure-legend", styles.legend)}>
      {entries.map((entry) => (
        <li key={entry.key}>
          <Button
            variant="ghost"
            size="small"
            title="Highlight this category"
            onMouseEnter={() => preview(entry.key)}
            onMouseLeave={() => preview(undefined)}
            onFocus={() => preview(entry.key)}
            onBlur={() => preview(undefined)}
          >
            <span {...stylex.props(styles.swatch, ...entry.swatch)} />
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
    borderRadius: 3,
  },
});
