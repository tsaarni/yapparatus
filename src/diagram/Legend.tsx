/**
 * The legend under a figure: one entry per category, which highlights its parts.
 */
import * as stylex from "@stylexjs/stylex";
import { space } from "../reader/theme.stylex.ts";
import { Button, styled } from "../reader/ui.tsx";
import type { LegendEntry } from "./compiled.ts";
import { categoryStyle } from "./part.tsx";

/**
 * The legend: one entry per category, with its color and its words. Pointing at an entry,
 * or focusing it, highlights the category's parts, so the reader can find them without
 * telling colors apart.
 */
export function Legend({
  legend,
  preview,
}: {
  legend: LegendEntry[];
  preview: (parts: string[] | undefined) => void;
}) {
  return (
    <ul aria-label="Legend" {...styled("diagram-legend", styles.legend)}>
      {legend.map((entry) => (
        <li key={entry.id}>
          <Button
            variant="ghost"
            size="small"
            title="Highlight these parts"
            onMouseEnter={() => preview(entry.parts)}
            onMouseLeave={() => preview(undefined)}
            onFocus={() => preview(entry.parts)}
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
