import { palettes } from "yapparatus/theme.stylex";

type Role = keyof typeof palettes.dark;

/** The relative luminance of an opaque `#rrggbb` color, as WCAG defines it. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The WCAG contrast of one role on another, computed from the theme file's colors, so the
 * number follows any change to them. `more` uses the increased-contrast values.
 */
export function Contrast({
  fg,
  bg = "surface",
  theme,
  more = false,
}: {
  fg: Role;
  bg?: Role;
  theme: "dark" | "light";
  more?: boolean;
}) {
  const screen = palettes[theme];
  const stronger = more ? palettes[theme === "dark" ? "darkMore" : "lightMore"] : {};
  const color = (role: Role) => stronger[role] ?? screen[role];
  const [x, y] = [luminance(color(fg)), luminance(color(bg))].sort((p, q) => q - p) as [
    number,
    number,
  ];
  return <>{((x + 0.05) / (y + 0.05)).toFixed(2)}</>;
}
