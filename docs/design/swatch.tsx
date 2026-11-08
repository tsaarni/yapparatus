import * as stylex from "@stylexjs/stylex";
import { radius, theme } from "yapparatus/theme.stylex";

const styles = stylex.create({
  swatch: (color: string) => ({
    display: "inline-block",
    width: "1.5em",
    height: "1em",
    verticalAlign: "-0.15em",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.borderStrong,
    backgroundColor: color,
  }),
});

/** A sample of a theme color, drawn from the live theme, so it follows any theme. */
export function Swatch({ role }: { role: keyof typeof theme }) {
  return <span {...stylex.props(styles.swatch(theme[role]))} />;
}
