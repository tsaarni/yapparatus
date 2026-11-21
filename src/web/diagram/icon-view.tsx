/**
 * A diagram icon: markup from the compiled diagram's icon table, drawn in the label's color on a
 * box, and in the element's ink on an icon shape, which has no outline to show its role.
 */

import * as stylex from "@stylexjs/stylex";
import type { Rect } from "../../diagram/geometry.ts";
import { iconGrid } from "../../diagram/metrics.ts";
import { theme } from "../style/theme.stylex.ts";

/**
 * An icon at its rectangle. The body comes from the icon package through the compiler, never
 * from the author; its strokes and fills are `currentColor`: the ink when `ink`, else the label's.
 */
export function IconView({ body, rect, ink }: { body: string; rect: Rect; ink: boolean }) {
  return (
    <svg
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      viewBox={`0 0 ${iconGrid} ${iconGrid}`}
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: The body is the icon package's markup.
      dangerouslySetInnerHTML={{ __html: body }}
      {...stylex.props(styles.icon, ink && styles.ink)}
    />
  );
}

const styles = stylex.create({
  icon: { color: `var(--label, ${theme.text})`, overflow: "visible" },
  /** An icon shape's icon, in the element's ink as an actor's figure. */
  ink: { color: "var(--ink)" },
});
