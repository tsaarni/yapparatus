/**
 * How the picture writer paints each role, as theme token names. The web app paints the same
 * roles in `web/diagram/element.tsx`, and a unit test checks that the two agree.
 */
import type { Role } from "./elements.ts";

/** The theme's color roles that a picture paints with. */
export const colorTokens = [
  "accent",
  "accentSurface",
  "borderControl",
  "borderStrong",
  "canvas",
  "category1",
  "category1Surface",
  "category2",
  "category2Surface",
  "category3",
  "category3Surface",
  "category4",
  "category4Surface",
  "diagramShade",
  "error",
  "surface",
  "surfaceHover",
  "surfaceRaised",
  "text",
  "textBody",
  "textMuted",
  "warning",
  "warningSurface",
] as const;

/** A theme color role, such as `accent`. */
export type ColorToken = (typeof colorTokens)[number];
/** A diagram stroke weight in the theme. */
export type StrokeToken = "hairline" | "line" | "strong" | "boost";
/** A diagram dash pattern in the theme. */
export type DashToken = "dashed" | "dotted";

/** The concrete values of the tokens in one theme. */
export interface Paint {
  colors: Record<ColorToken, string>;
  /** Stroke weights in px. */
  stroke: Record<StrokeToken, number>;
  dash: Record<DashToken, string>;
}

/** What a role paints: its ink, fill, label color, and stroke weight. */
export interface RolePaint {
  ink: ColorToken;
  fill: ColorToken | "transparent";
  label: ColorToken;
  weight: StrokeToken;
}

/** The role table. An external element paints as a default element and is dashed. */
export const roles: Record<Exclude<Role, "external">, RolePaint> = {
  default: { ink: "borderControl", fill: "surfaceRaised", label: "text", weight: "line" },
  accent: { ink: "accent", fill: "accentSurface", label: "text", weight: "strong" },
  warning: { ink: "warning", fill: "warningSurface", label: "text", weight: "line" },
  muted: { ink: "borderStrong", fill: "transparent", label: "textMuted", weight: "hairline" },
};

/** Each category's ink and fill, by its slot: they replace the role's. */
export const categories: Array<{ ink: ColorToken; fill: ColorToken }> = [
  { ink: "category1", fill: "category1Surface" },
  { ink: "category2", fill: "category2Surface" },
  { ink: "category3", fill: "category3Surface" },
  { ink: "category4", fill: "category4Surface" },
];

/** The width of the halo in the figure's color that keeps text readable over lines. */
export const haloWidth = 5;
