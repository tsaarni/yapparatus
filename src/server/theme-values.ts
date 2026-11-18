/**
 * The light theme's values for pictures. The theme file is read when this module loads. StyleX's
 * functions throw outside its compiler, so the file is loaded with a stub in which they return
 * their input.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { colorTokens, type DashToken, type Paint, type StrokeToken } from "../diagram/paint.ts";

// The same path from src/server/ and from the compiled lib/server/.
const themeFile = fileURLToPath(new URL("../../src/web/theme.stylex.ts", import.meta.url));

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
