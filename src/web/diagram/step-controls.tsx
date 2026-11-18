/** A diagram's steps: the buttons that walk through them, and the text of each. */
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { AppIcon } from "../icons.tsx";
import { fontSize, lineHeight, sizes, space, theme, when } from "../theme.stylex.ts";
import { Button, styled } from "../ui.tsx";

/** One step, as the diagram collected it from its `<Step>` children. */
export interface StepItem {
  id?: string;
  /** The ids as written. */
  focus: string[];
  /** The focused elements, with containers expanded to their contents. */
  elements: Set<string>;
  content: ReactNode;
}

/** Previous and next buttons, and the text of every step; print shows all of them. */
export function StepControls({
  steps,
  active,
  go,
}: {
  steps: StepItem[];
  active: number | undefined;
  go: (step: number | undefined) => void;
}) {
  return (
    <div
      {...styled("diagram-steps", styles.steps)}
      // Comments on the figure record the step the reader had open.
      {...(active === undefined
        ? {}
        : {
            "data-step": `Step ${active + 1} of ${steps.length}${steps[active]?.id ? ` (${steps[active]?.id})` : ""}`,
          })}
    >
      <div {...stylex.props(styles.stepBar)}>
        <Button
          variant="icon"
          aria-label="Previous step"
          disabled={!active}
          onClick={() => go((active ?? 1) - 1)}
        >
          <AppIcon name="previous" />
        </Button>
        <span {...stylex.props(styles.stepCount)}>
          {active === undefined ? `${steps.length} steps` : `Step ${active + 1} of ${steps.length}`}
        </span>
        <Button
          variant="icon"
          aria-label={active === undefined ? "Start steps" : "Next step"}
          disabled={active === steps.length - 1}
          onClick={() => go(active === undefined ? 0 : active + 1)}
        >
          <AppIcon name="next" />
        </Button>
        {active !== undefined && (
          <Button size="small" variant="ghost" onClick={() => go(undefined)}>
            Show all
          </Button>
        )}
      </div>
      <ol aria-live="polite" {...stylex.props(styles.stepList)}>
        {steps.map((step, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: Steps are positional.
            key={i}
            {...(active === i ? { "data-active": "" } : {})}
            {...stylex.props(styles.stepText, active === i && styles.stepActive)}
          >
            {step.content}
          </li>
        ))}
      </ol>
    </div>
  );
}

const styles = stylex.create({
  steps: {
    maxWidth: sizes.textWidth,
    marginTop: space.md,
    color: theme.textBody,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  stepBar: {
    display: { default: "flex", [when.print]: "none" },
    alignItems: "center",
    gap: space.xs,
    marginInlineStart: `calc(-1 * ${space.sm})`,
  },
  stepCount: {
    minWidth: 92,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
  stepList: {
    margin: 0,
    paddingInlineStart: { default: 0, [when.print]: space.xl },
    listStylePosition: "outside",
    listStyleType: { default: "none", [when.print]: "decimal" },
  },
  stepText: {
    display: { default: "none", [when.print]: "list-item" },
    marginTop: space.xs,
  },
  stepActive: { display: "list-item" },
});
