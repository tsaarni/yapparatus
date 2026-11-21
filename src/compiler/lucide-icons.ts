/**
 * The Lucide icons that diagrams draw, read from `@iconify-json/lucide`. A name is an own key of
 * the set's icons, or an alias of one; hidden icons and icons off the 24 unit grid are left out.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { type IconSet, iconGrid } from "../diagram/metrics.ts";

/** The parts of an Iconify JSON file that the lookup reads. */
interface IconifyJson {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number; hidden?: boolean }>;
  aliases?: Record<string, { parent: string }>;
}

let set: IconSet | undefined;

/** The Lucide icon set, read once. */
export function lucideIcons(): IconSet {
  set ??= read();
  return set;
}

/** Read the package's icons and resolve its aliases into one table of bodies. */
function read(): IconSet {
  const require = createRequire(import.meta.url);
  const file = require.resolve("@iconify-json/lucide/icons.json");
  const json = JSON.parse(readFileSync(file, "utf8")) as IconifyJson;
  const bodies = new Map<string, string>();
  for (const [name, icon] of Object.entries(json.icons)) {
    const width = icon.width ?? json.width ?? 16;
    const height = icon.height ?? json.height ?? 16;
    if (!icon.hidden && width === iconGrid && height === iconGrid) bodies.set(name, icon.body);
  }
  for (const [name, alias] of Object.entries(json.aliases ?? {})) {
    const body = Object.keys(alias).length === 1 ? bodies.get(alias.parent) : undefined;
    if (body !== undefined && !bodies.has(name)) bodies.set(name, body);
  }
  return { body: (name) => bodies.get(name), names: [...bodies.keys()] };
}
