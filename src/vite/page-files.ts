/**
 * A build's HTML files: one for every page and every source file it carries, so any static
 * host can serve each address directly. Each page's file preloads that page's code.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PluginOption } from "vite";
import { type DocumentDirectory, pageIds } from "../compiler/document-directory.ts";
import { builtFiles } from "../compiler/virtual-modules.ts";
import { appPrefix } from "../document/file-address.ts";
import { pageIdOf } from "../document/settings.ts";

export function pageFiles(document: DocumentDirectory): PluginOption {
  const { root, content } = document;
  let base = "/";
  /** Each page's chunk and the chunks it imports, other than the entry, by page id. */
  const pageChunks = new Map<string, string[]>();
  /** Page ids in the order of document.json, or none when the list is missing or broken. */
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
        // The chunks it imports, but not the entry, which every page loads already.
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
    writeBundle(output) {
      if (!output.dir) return;
      const index = path.join(output.dir, "index.html");
      if (!existsSync(index)) return;
      const html = readFileSync(index, "utf8");
      // Each page's file fetches that page's code with the app, so the page shows without a
      // second round trip. The root shows the first page.
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
