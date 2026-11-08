/**
 * Checks the StyleX rules that the compiler does not enforce, across every `stylex.create`
 * and `stylex.keyframes` call in src/:
 *
 * - No shorthands StyleX drops when they hold theme variables: `border*`, `background`,
 *   and `outline`. Write the longhands.
 * - No literal colors. Colors come from the theme, in src/reader/theme.stylex.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const shorthand =
  /(?<![\w-])(border(?:Top|Right|Bottom|Left|Block|Inline)?|background|outline)\s*:/g;
const color = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/g;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(file);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".stylex.ts") ? [file] : [];
  });
}

/** The source of each style call, from its opening parenthesis to the matching one. */
function styleCalls(source: string) {
  const calls: { start: number; text: string }[] = [];
  for (const match of source.matchAll(/stylex\.(?:create|keyframes)\(/g)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = start; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")" && --depth === 0) {
        calls.push({ start, text: source.slice(start, i + 1) });
        break;
      }
    }
  }
  return calls;
}

const problems: string[] = [];
for (const file of files("src")) {
  const source = readFileSync(file, "utf8");
  for (const call of styleCalls(source)) {
    const report = (index: number, message: string) => {
      const line = source.slice(0, call.start + index).split("\n").length;
      problems.push(`${file}:${line}: ${message}`);
    };
    for (const m of call.text.matchAll(shorthand))
      report(m.index, `"${m[1]}" is a shorthand; write its longhand properties.`);
    for (const m of call.text.matchAll(color))
      report(m.index, `"${m[0]}" is a literal color; use a theme role.`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
