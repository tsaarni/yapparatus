/**
 * How a drawing is painted in the light theme, as plain values for code outside the browser:
 * the picture writer, which draws a figure as a standalone SVG.
 *
 * The values are read when this module loads, from the reader's own files: the theme file and
 * the role styles in `part.tsx`. StyleX's functions throw outside its compiler, so the theme
 * file is loaded with a stub in which they return their input.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { theme } from "../reader/theme.stylex.ts";
import type { Role } from "./scene.ts";

// The same path from src/diagram/ and from the compiled lib/diagram/.
const source = (file: string) => fileURLToPath(new URL(`../../src/${file}`, import.meta.url));

type Value = string | Record<string, string>;
export type Roles = Record<string, Value>;

/**
 * The theme file's values: each role's screen, print, and increased-contrast values, and each
 * constant. The file is copied out of the package first, because Node strips types only from
 * files outside node_modules.
 */
export async function loadThemes(): Promise<{
  theme: Roles;
  lightTheme: Roles;
  stroke: Record<string, string>;
  dash: Record<string, string>;
}> {
  const text = readFileSync(source("reader/theme.stylex.ts"), "utf8").replace(
    'import * as stylex from "@stylexjs/stylex";',
    "const stylex = { defineVars: (v: any) => v, defineConsts: (v: any) => v, createTheme: (_: unknown, v: any) => v };",
  );
  const dir = mkdtempSync(path.join(os.tmpdir(), "yapparatus-theme-"));
  try {
    const file = path.join(dir, "theme.ts");
    writeFileSync(file, text);
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const themes = await loadThemes();
const part = readFileSync(source("diagram/part.tsx"), "utf8");

/** The style object `name: { … }` in `part.tsx`, as its text. */
function style(name: string): string {
  const found =
    new RegExp(`^  ${name}: \\{(.*)\\},$`, "m").exec(part)?.[1] ??
    new RegExp(`^  ${name}: \\{\\n([\\s\\S]*?)\\n  \\},$`, "m").exec(part)?.[1];
  if (found === undefined) throw new Error(`part.tsx has no style ${name}.`);
  return found;
}

/** The token that a style sets a property to, such as `accent` in `"--ink": theme.accent`. */
function token(name: string, property: string, scale: "theme" | "stroke"): string {
  const text = style(name);
  const found =
    new RegExp(`"${property}": ${scale}\\.(\\w+)`).exec(text)?.[1] ??
    new RegExp(`"${property}": "(transparent)"`).exec(text)?.[1];
  if (!found) throw new Error(`part.tsx's ${name} does not set ${property} to a token.`);
  return found;
}

/** A theme role, such as `accent`. */
export type ColorRole = Extract<keyof typeof theme, string>;

/** The light theme's colors, by theme role. Roles that are not colors, such as fonts, are left out. */
export const lightColors = Object.fromEntries(
  Object.entries(themes.lightTheme).flatMap(([role, value]) => {
    const color = typeof value === "string" ? value : value.default;
    return color?.startsWith("#") ? [[role, color]] : [];
  }),
) as Record<ColorRole, string>;

/** Diagram stroke weights in px. */
export const stroke = Object.fromEntries(
  Object.entries(themes.stroke).map(([name, value]) => [name, Number.parseFloat(value)]),
) as Record<"hairline" | "line" | "strong" | "boost", number>;

/** Diagram dash patterns. */
export const dash = themes.dash as Record<"dashed" | "dotted", string>;

/** What a role paints: its ink, fill, label color, and stroke weight. */
export interface RolePaint {
  ink: ColorRole;
  fill: ColorRole | "transparent";
  label: ColorRole;
  weight: keyof typeof stroke;
}

const rolePaint = (name: string): RolePaint => ({
  ink: token(name, "--ink", "theme") as ColorRole,
  fill: token(name, "--fill", "theme") as ColorRole,
  label: token(name, "--label", "theme") as ColorRole,
  weight: token(name, "--weight", "stroke") as keyof typeof stroke,
});

/** The role table. An external part paints as a default part and is dashed. */
export const roles: Record<Exclude<Role, "external">, RolePaint> = {
  default: rolePaint("roleDefault"),
  accent: rolePaint("roleAccent"),
  warning: rolePaint("roleWarning"),
  muted: rolePaint("roleMuted"),
};

/** Each category's ink and fill, by its slot: they replace the role's. */
export const categories = [1, 2, 3, 4].map((slot) => ({
  ink: token(`category${slot}`, "--ink", "theme") as ColorRole,
  fill: token(`category${slot}`, "--fill", "theme") as ColorRole,
}));

/** The width of the halo in the figure's color that keeps text readable over lines. */
export const haloWidth = Number(/strokeWidth: ([\d.]+),/.exec(style("halo"))?.[1]);
