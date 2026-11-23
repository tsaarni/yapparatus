/**
 * The light theme's values for pictures and charts, read when this module loads. StyleX's
 * functions throw outside its compiler, so the theme file is loaded with a stub.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { colorTokens, type DashToken, type Paint, type StrokeToken } from "../diagram/paint.ts";

/** The same path from src/compiler/ and from the compiled lib/compiler/. */
const themeFile = fileURLToPath(new URL("../../src/web/style/theme.stylex.ts", import.meta.url));

type Value = string | Record<string, string>;
/** Theme roles by name: one value, or values by condition such as print. */
export type Roles = Record<string, Value>;

/**
 * The theme file's roles and constants. The file is copied out of the package first, because
 * Node strips types only from files outside node_modules.
 */
export async function loadThemes(): Promise<{
  theme: Roles;
  lightTheme: Roles;
  stroke: Record<string, string>;
  dash: Record<string, string>;
  fontSize: Record<string, string>;
  fontWeight: Record<string, string>;
  space: Record<string, string>;
  sizes: Record<string, string>;
}> {
  const text = readFileSync(themeFile, "utf8").replace(
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

/** The light theme's color for a role. Roles that are not colors, such as fonts, have none. */
function lightColor(token: string): string {
  const value = themes.lightTheme[token];
  const color = typeof value === "string" ? value : value?.default;
  if (!color?.startsWith("#")) throw new Error(`The light theme has no color ${token}.`);
  return color;
}

/** The paint table's tokens as the light theme's values. */
export const lightPaint: Paint = {
  colors: Object.fromEntries(
    colorTokens.map((token) => [token, lightColor(token)]),
  ) as Paint["colors"],
  stroke: Object.fromEntries(
    Object.entries(themes.stroke).map(([name, value]) => [name, Number.parseFloat(value)]),
  ) as Record<StrokeToken, number>,
  dash: themes.dash as Record<DashToken, string>,
};

/** A constant in pixels, such as `"12px"`, as a number. */
const pixels = (value: string | undefined) => Number.parseFloat(value ?? "");

/**
 * The width a chart draws at in the widest reading layout: the text column and the breakout,
 * less the figure frame's padding and border, as the Chart component's style computes it.
 */
export const chartWidth =
  pixels(themes.sizes.textWidth) + pixels(themes.sizes.breakout) - 2 * pixels(themes.space.xl) - 2;

/** The type of a chart's text: the theme's sans family at the interface's smallest size. */
export const chartType = {
  family: themes.theme.sans as string,
  size: pixels(themes.fontSize.xs),
  weight: Number(themes.fontWeight.regular),
};

/** A chart's colors in the light theme: its categories, muted, and its text. */
export const chartColors = {
  categories: (["category1", "category2", "category3", "category4"] as const).map(
    (token) => lightPaint.colors[token],
  ),
  muted: lightPaint.colors.textMuted,
  text: lightPaint.colors.textBody,
};
