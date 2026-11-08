import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

/**
 * The contrast every theme must reach, checked on the real theme file. StyleX only runs
 * when it compiles the app, so the file is loaded with `defineVars`, `defineConsts`, and
 * `createTheme` returning their input: each role's screen, print, and increased-contrast values.
 */
type Value = string | Record<string, string>;
type Roles = Record<string, Value>;
async function loadThemes(): Promise<{ theme: Roles; lightTheme: Roles }> {
  const source = readFileSync("src/reader/theme.stylex.ts", "utf8").replace(
    'import * as stylex from "@stylexjs/stylex";',
    "const stylex = { defineVars: (v: any) => v, defineConsts: (v: any) => v, createTheme: (_: unknown, v: any) => v };",
  );
  const dir = mkdtempSync(path.join(os.tmpdir(), "yapparatus-theme-"));
  try {
    const file = path.join(dir, "theme.ts");
    writeFileSync(file, source);
    return await import(pathToFileURL(file).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const { theme, lightTheme } = await loadThemes();

/** Each theme, in each condition its values change for: [roles, condition]. */
const modes = {
  dark: [theme, "default"],
  "dark, increased contrast": [theme, "@media (prefers-contrast: more)"],
  light: [lightTheme, "default"],
  "light, increased contrast": [lightTheme, "@media (prefers-contrast: more)"],
  print: [theme, "@media print"],
  "print from the light theme": [lightTheme, "@media print"],
} as const;
type Mode = keyof typeof modes;

function color(role: string, mode: Mode): string {
  const [roles, condition] = modes[mode];
  const value = roles[role];
  assert.ok(value, `unknown role ${role}`);
  if (typeof value === "string") return value;
  return value[condition] ?? value.default ?? "";
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** The WCAG contrast ratio of two opaque colors. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const surfaces = ["canvas", "surface", "surfaceRaised", "surfaceHover"];
const categories = ["category1", "category2", "category3", "category4"];
const tints = [
  "accentSurface",
  "warningSurface",
  "errorSurface",
  ...categories.map((c) => `${c}Surface`),
];
/** [foregrounds, backgrounds, minimum, why]. */
const rules: [string[], string[], number, string][] = [
  [["text", "textBody", "textMuted"], [...surfaces, ...tints], 4.5, "text"],
  [["accent", "accentStrong", "error", "warning", "success"], surfaces, 4.5, "text"],
  [["codeKeyword", "codeString", "codeFunction", "codeConstant"], ["surface"], 4.5, "code"],
  [["accentStrong"], ["accentSurface"], 4.5, "chip text"],
  [["error"], ["errorSurface"], 4.5, "error text"],
  [["warning"], ["warningSurface"], 4.5, "warning text"],
  [["borderControl"], ["canvas", "surface", "surfaceRaised"], 3, "control edge"],
  [["borderStrong"], ["surface"], 3, "muted diagram outline"],
  [["accent"], ["surface", "accentSurface"], 3, "diagram outline"],
  [["warning"], ["surface", "warningSurface"], 3, "diagram outline"],
  ...categories.map((c): [string[], string[], number, string] => [
    [c],
    ["surface", `${c}Surface`],
    3,
    "diagram outline",
  ]),
  [tints, ["surface"], 1.3, "a fill that shows"],
  [["border"], ["canvas", "surface", "surfaceRaised"], 1.3, "a divider that shows"],
];

for (const mode of Object.keys(modes) as Mode[])
  test(`${mode}: every role reaches its contrast`, () => {
    const failures: string[] = [];
    for (const [foregrounds, backgrounds, minimum, why] of rules)
      for (const fg of foregrounds)
        for (const bg of backgrounds) {
          const ratio = contrast(color(fg, mode), color(bg, mode));
          if (ratio < minimum)
            failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${minimum} (${why})`);
        }
    assert.deepEqual(failures, []);
  });

test("the HTML's theme-color is the canvas, so the first paint matches", () => {
  // The page is a template in the Vite plugin.
  const html = readFileSync("src/vite.ts", "utf8");
  assert.match(html, new RegExp(`name="theme-color" content="${color("canvas", "dark")}"`));
});

test("every theme gives every role a value", () => {
  assert.deepEqual(
    Object.keys(lightTheme).sort(),
    Object.keys(theme)
      .filter((r) => r !== "sans" && r !== "mono")
      .sort(),
  );
});

/* Color vision: OKLab distance, normally and as seen with the two common red-green deficiencies. */
function linear(hex: string) {
  return [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}
function oklab([r, g, b]: [number, number, number]) {
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt) as [number, number, number];
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** Machado, Oliveira & Fernandes (2009), full severity, in linear RGB. */
const deficiencies = {
  normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
};
function seen(hex: string, m: number[]) {
  const [r, g, b] = linear(hex);
  return oklab(
    [0, 3, 6].map((i) =>
      Math.min(1, Math.max(0, (m[i] ?? 0) * r + (m[i + 1] ?? 0) * g + (m[i + 2] ?? 0) * b)),
    ) as [number, number, number],
  );
}
/** The smallest OKLab distance (×100) of two colors across normal vision and both deficiencies. */
function apart(a: string, b: string) {
  return Math.min(
    ...Object.values(deficiencies).map((m) => {
      const [x, y] = [seen(a, m), seen(b, m)];
      return 100 * Math.hypot(...x.map((v, i) => v - (y[i] ?? 0)));
    }),
  );
}

for (const mode of ["dark", "light"] as const)
  test(`${mode}: diagram categories stay apart, also with red-green color blindness`, () => {
    const inks = [...categories, "borderControl"].map((role) => [role, color(role, mode)] as const);
    const close: string[] = [];
    for (let i = 0; i < inks.length; i++)
      for (let j = i + 1; j < inks.length; j++) {
        const [[a, x], [b, y]] = [inks[i], inks[j]] as [
          readonly [string, string],
          readonly [string, string],
        ];
        const distance = apart(x, y);
        if (distance < 9) close.push(`${a} and ${b}: ${distance.toFixed(1)}`);
      }
    assert.deepEqual(close, []);
  });
