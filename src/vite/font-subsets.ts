/**
 * Font subsetting for builds: each font file keeps only the glyphs of the characters that the
 * build's output holds, and a file that keeps none is left out with its `@font-face` rule.
 */
import path from "node:path";
import * as fontkit from "fontkit";
import subsetFont from "subset-font";
import type { Plugin, Rollup } from "vite";

/** What the browser writes itself: ASCII, the ellipsis, and the minus and spaces of numbers. */
const writtenByBrowser = String.fromCodePoint(
  ...Array.from({ length: 95 }, (_, i) => 32 + i),
  ...[0xa0, 0x2009, 0x202f, 0x2212, 0x2026],
);

/** One `@font-face` rule of a style sheet: its text, family, style, source, and characters. */
export interface FontFace {
  rule: string;
  family: string;
  style: string;
  url: string;
  ranges: [number, number][];
}

/** The `@font-face` rules of a style sheet. */
export function fontFaces(css: string): FontFace[] {
  return [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map(([rule]) => ({
    rule,
    family: /font-family:\s*["']?([^;"'}]+)/.exec(rule)?.[1]?.trim() ?? "",
    style: /font-style:\s*([^;}]+)/.exec(rule)?.[1]?.trim() ?? "normal",
    url: /url\(\s*["']?([^)"']+)/.exec(rule)?.[1] ?? "",
    ranges: unicodeRanges(/unicode-range:\s*([^;}]+)/.exec(rule)?.[1] ?? "U+0-10FFFF"),
  }));
}

/** The code point ranges of a `unicode-range` value, such as `U+0-FF,U+131,U+1F??`. */
export function unicodeRanges(value: string): [number, number][] {
  return value.split(",").map((part) => {
    const [low = "", high] = part.trim().replace(/^U\+/i, "").split("-");
    if (high) return [Number.parseInt(low, 16), Number.parseInt(high, 16)];
    return [
      Number.parseInt(low.replace(/\?/g, "0"), 16),
      Number.parseInt(low.replace(/\?/g, "F"), 16),
    ];
  });
}

/** The characters of the text that a font face with these ranges draws. */
export function charactersIn(ranges: [number, number][], text: Set<string>): string {
  return [...text]
    .filter((char) => {
      const point = char.codePointAt(0) ?? 0;
      return ranges.some(([low, high]) => point >= low && point <= high);
    })
    .join("");
}

/** Every character of a build's output in both cases, with escapes in scripts and styles read. */
export function outputCharacters(bundle: Rollup.OutputBundle): Set<string> {
  const characters = new Set(writtenByBrowser);
  const add = (text: string) => {
    for (const char of `${text}${text.toUpperCase()}${text.toLowerCase()}`) characters.add(char);
  };
  for (const output of Object.values(bundle)) {
    if (output.type === "chunk") {
      add(output.code);
      for (const [, short, long] of output.code.matchAll(
        /\\u(?:([\da-fA-F]{4})|\{([\da-fA-F]+)\})/g,
      ))
        add(String.fromCodePoint(Number.parseInt(short ?? long ?? "0", 16)));
    } else if (typeof output.source === "string") {
      add(output.source);
      if (output.fileName.endsWith(".css"))
        for (const [, hex] of output.source.matchAll(/\\([\da-fA-F]{1,6})/g))
          add(String.fromCodePoint(Math.min(Number.parseInt(hex ?? "0", 16), 0x10ffff)));
    }
  }
  return characters;
}

/**
 * The build plugin that subsets the fonts of every style sheet to the characters of the output.
 * A changed file gets a new name from its new content, so a cached copy is never used for it.
 */
export function fontSubsets(): Plugin {
  return {
    name: "yapparatus:font-subsets",
    apply: "build",
    generateBundle: {
      order: "post",
      async handler(_options, bundle) {
        const characters = outputCharacters(bundle);
        const subset = async (font: Uint8Array, face: FontFace) => {
          const glyphs = fontkit.create(Buffer.from(font));
          const drawn = [...charactersIn(face.ranges, characters)]
            .filter(
              (char) =>
                "hasGlyphForCodePoint" in glyphs &&
                glyphs.hasGlyphForCodePoint(char.codePointAt(0) ?? 0),
            )
            .join("");
          return drawn
            ? await subsetFont(Buffer.from(font), drawn, { targetFormat: "woff2" })
            : undefined;
        };
        const replace = (fileName: string, source: string | Uint8Array | undefined) => {
          const old = bundle[fileName];
          delete bundle[fileName];
          const name = old?.type === "asset" ? old.names[0] : undefined;
          const next = source
            ? this.getFileName(
                this.emitFile({ type: "asset", name: name ?? path.basename(fileName), source }),
              )
            : "";
          for (const output of Object.values(bundle)) {
            if (output.type === "chunk") output.code = output.code.replaceAll(fileName, next);
            else if (typeof output.source === "string")
              output.source = output.source.replaceAll(fileName, next);
          }
        };
        const sheets = Object.values(bundle).filter(
          (output) => output.type === "asset" && output.fileName.endsWith(".css"),
        );
        for (const { fileName: sheet } of sheets) {
          const css = () => String((bundle[sheet] as Rollup.OutputAsset).source);
          const original = css();
          for (const face of fontFaces(original)) {
            const data = /^data:font\/woff2;base64,(.*)$/.exec(face.url)?.[1];
            const font = Object.values(bundle).find(
              (output) => output.type === "asset" && face.url.endsWith(output.fileName),
            );
            if (data) {
              const kept = await subset(Buffer.from(data, "base64"), face);
              const url = `data:font/woff2;base64,${kept?.toString("base64")}`;
              const rule = kept ? face.rule.replace(face.url, url) : "";
              (bundle[sheet] as Rollup.OutputAsset).source = css().replace(face.rule, rule);
            } else if (font?.type === "asset" && typeof font.source !== "string") {
              const kept = await subset(font.source, face);
              if (!kept)
                (bundle[sheet] as Rollup.OutputAsset).source = css().replace(face.rule, "");
              replace(font.fileName, kept);
            }
          }
          if (css() !== original) replace(sheet, css());
        }
      },
    },
  };
}
