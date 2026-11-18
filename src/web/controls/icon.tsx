import * as stylex from "@stylexjs/stylex";
import type { ComponentType, SVGProps } from "react";

const styles = stylex.create({
  icon: (size: number, color: string) => ({
    width: size,
    height: size,
    flexShrink: 0,
    display: "inline-block",
    verticalAlign: "-0.15em",
    color,
  }),
});

export interface IconProps {
  /** MDX-only literal collection:name, resolved at build time. */
  name?: string;
  /** Imported ~icons component, for TSX and dynamic component references. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Width and height in px. Default: 20. */
  size?: number;
  /** Accessible name. Omit for decorative icons. */
  label?: string;
  /** CSS color. Default: inherit. Multicolor logos preserve their authored fills. */
  color?: string;
}

export function Icon({ icon: Svg, name, size = 20, label, color = "inherit" }: IconProps) {
  if (!Svg)
    throw new Error(
      `Icon ${name ?? ""} requires a literal name in MDX, or an imported icon component in TSX.`,
    );
  return (
    <Svg
      {...stylex.props(styles.icon(size, color))}
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    />
  );
}
