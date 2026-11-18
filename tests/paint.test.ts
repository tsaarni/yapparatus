/**
 * The picture writer paints roles from the table in `diagram/paint.ts`; the web app paints them
 * with the role styles in `web/diagram/element.tsx`. The two must agree, so a picture shows what
 * the web app shows.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type ColorToken,
  categories,
  type DashToken,
  haloWidth,
  roles,
  type StrokeToken,
} from "../src/diagram/paint.ts";
import type { dash, stroke, theme } from "../src/web/style/theme.stylex.ts";

// Every token the table names is a theme role or constant.
type Within<T extends K, K> = T;
type _Colors = Within<ColorToken, keyof typeof theme>;
type _Strokes = Within<StrokeToken, keyof typeof stroke>;
type _Dashes = Within<DashToken, keyof typeof dash>;

const source = readFileSync(new URL("../src/web/diagram/element.tsx", import.meta.url), "utf8");

/** The style object `name: { … }` in `element.tsx`, as its text. */
function style(name: string): string {
  const found =
    new RegExp(`^  ${name}: \\{(.*)\\},$`, "m").exec(source)?.[1] ??
    new RegExp(`^  ${name}: \\{\\n([\\s\\S]*?)\\n  \\},$`, "m").exec(source)?.[1];
  assert.ok(found !== undefined, `element.tsx has no style ${name}`);
  return found;
}

/** The token that a style sets a property to, such as `accent` in `"--ink": theme.accent`. */
function token(name: string, property: string, scale: "theme" | "stroke"): string | undefined {
  const text = style(name);
  return (
    new RegExp(`"${property}": ${scale}\\.(\\w+)`).exec(text)?.[1] ??
    new RegExp(`"${property}": "(transparent)"`).exec(text)?.[1]
  );
}

const styleOf = {
  default: "roleDefault",
  accent: "roleAccent",
  warning: "roleWarning",
  muted: "roleMuted",
} as const;

test("each role paints with the tokens the web app's role style sets", () => {
  for (const [role, paint] of Object.entries(roles)) {
    const name = styleOf[role as keyof typeof styleOf];
    assert.deepEqual(
      {
        ink: token(name, "--ink", "theme"),
        fill: token(name, "--fill", "theme"),
        label: token(name, "--label", "theme"),
        weight: token(name, "--weight", "stroke"),
      },
      paint,
      role,
    );
  }
});

test("each category paints with the tokens the web app's category style sets", () => {
  categories.forEach((paint, i) => {
    const name = `category${i + 1}`;
    assert.deepEqual(
      { ink: token(name, "--ink", "theme"), fill: token(name, "--fill", "theme") },
      paint,
      name,
    );
  });
  assert.throws(() => style(`category${categories.length + 1}`));
});

test("the halo is as wide as the web app's", () => {
  assert.equal(Number(/strokeWidth: ([\d.]+),/.exec(style("halo"))?.[1]), haloWidth);
});
