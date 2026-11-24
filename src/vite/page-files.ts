/**
 * A build's HTML files, one for every page and source file carried, so any static host serves each
 * address. Each page's file preloads the page's code and the font of body text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PluginOption, Rollup } from "vite";
import { type DocumentDirectory, pageIds } from "../compiler/document-directory.ts";
import { builtFiles } from "../compiler/virtual-modules.ts";
import { appPrefix } from "../document/file-address.ts";
import { pageIdOf } from "../document/settings.ts";
import { fontFaces } from "./font-subsets.ts";

/** The build plugin that writes an HTML file for every page and every source file carried. */
export function pageFiles(document: DocumentDirectory): PluginOption {
  const { root, content } = document;
  let base = "/";
  const pageChunks = new Map<string, string[]>();
  const listedPages = (): string[] => {
    try {
      const listed = JSON.parse(readFileSync(path.join(root(), content, "document.json"), "utf8"));
      return Array.isArray(listed.pages) ? listed.pages.map(pageIdOf) : [];
    } catch {
      return [];
    }
  };
  return {
    name: "yapparatus:page-files",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_output, bundle) {
      pageChunks.clear();
      const pagesDir = path.join(root(), content);
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.facadeModuleId?.endsWith(".mdx")) continue;
        const id = path
          .relative(pagesDir, chunk.facadeModuleId)
          .split(path.sep)
          .join("/")
          .replace(/\.mdx$/, "");
        const files = new Set<string>();
        const add = (name: string) => {
          const imported = bundle[name];
          if (files.has(name) || imported?.type !== "chunk" || imported.isEntry) return;
          files.add(name);
          for (const next of imported.imports) add(next);
        };
        add(chunk.fileName);
        pageChunks.set(id, [...files]);
      }
    },
    writeBundle(output, bundle) {
      if (!output.dir) return;
      const index = path.join(output.dir, "index.html");
      if (!existsSync(index)) return;
      const html = readFileSync(index, "utf8").replace(
        "</head>",
        `${bodyFontPreload(bundle)}</head>`,
      );
      const withPage = (id: string | undefined) => {
        const links = (id ? (pageChunks.get(id) ?? []) : [])
          .map((file) => `<link rel="modulepreload" crossorigin href="${base}${file}">`)
          .join("");
        return html.replace("</head>", `${links}</head>`);
      };
      writeFileSync(index, withPage(listedPages()[0]));
      for (const id of pageIds(root(), content)) {
        const dir = path.join(output.dir, id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "index.html"), withPage(id));
      }
      for (const { folder, path: file } of builtFiles(document)) {
        const dir = path.join(output.dir, appPrefix.slice(1), "files", folder, file);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "index.html"), html);
      }
      writeFileSync(path.join(output.dir, "404.html"), html);
    },
  };
}

/** The preload of the font file that draws the letters of body text, so text draws once. */
function bodyFontPreload(bundle: Rollup.OutputBundle): string {
  const css = Object.values(bundle)
    .map((output) =>
      output.type === "asset" && output.fileName.endsWith(".css") ? String(output.source) : "",
    )
    .join("");
  const latin = "a".codePointAt(0) ?? 0;
  const face = fontFaces(css).find(
    (face) =>
      face.family === "Inter Variable" &&
      face.style === "normal" &&
      face.ranges.some(([low, high]) => latin >= low && latin <= high),
  );
  return face
    ? `<link rel="preload" as="font" type="font/woff2" crossorigin href="${face.url}">`
    : "";
}
