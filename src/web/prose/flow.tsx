/** Flow, the layout of blocks inside a panel, and the flag that lets a block use the wide track. */

import * as stylex from "@stylexjs/stylex";
import { Children, isValidElement, type ReactNode } from "react";
import { sizes, space } from "../style/theme.stylex.ts";

/** Components that may use the wide figure track mark themselves with this flag. */
export interface Breakout {
  breakout?: boolean;
}

/** Whether a block's content may use the wide track. */
export function isBreakout(children: ReactNode): boolean {
  const child = Children.toArray(children).find(isValidElement);
  return !!(child?.type as Breakout | undefined)?.breakout;
}

/**
 * The blocks of a panel, top to bottom: text keeps the reading measure, wide blocks grow beyond it.
 * With `fill`, the last block takes the rest of the height, so code side by side ends level.
 */
export function Flow({ children, fill }: { children: ReactNode; fill?: boolean }) {
  const blocks = Children.toArray(children);
  return (
    <div {...stylex.props(s.flow)}>
      {blocks.map((block, index) => {
        const wide = isBreakout(block);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: The blocks are the page's, in source order.
            key={index}
            {...stylex.props(
              s.flowBlock,
              !wide && s.flowText,
              index === 0 && !wide && s.flowLead,
              fill && index === blocks.length - 1 && s.flowFill,
            )}
          >
            {block}
          </div>
        );
      })}
    </div>
  );
}

const s = stylex.create({
  flow: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  flowBlock: {
    minWidth: 0,
  },
  flowText: {
    maxWidth: sizes.textWidth,
  },
  flowLead: {
    paddingTop: space.md,
  },
  /** A grid stretches its one child, such as a code block's frame, to the full height. */
  flowFill: {
    flexGrow: 1,
    display: "grid",
  },
});
