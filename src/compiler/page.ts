/**
 * Compiling a page: the stages an MDX file passes through, in order, and compiling one page on
 * the dev server as its file is on disk.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Options } from "@mdx-js/rollup";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ViteDevServer } from "vite";
import type { DocumentDirectory } from "./document-directory.ts";
import { charts } from "./stages/charts.ts";
import { markdownConventions } from "./stages/conventions.ts";
import { diagrams, pageFigures } from "./stages/diagrams.ts";
import { excerpts } from "./stages/excerpts.ts";
import { codeHighlighting } from "./stages/highlight.ts";
import { iconImports } from "./stages/icons.ts";
import { math } from "./stages/math.ts";
import { pageOutline } from "./stages/outline.ts";
import { sourceContext } from "./stages/source-context.ts";

/**
 * The stages of a page, in the order they run; each later stage reads what earlier ones wrote.
 * Math runs first so no later stage reads it as code; highlighting runs last, on excerpts too.
 */
export function pageStages(
  document: DocumentDirectory,
): Pick<Options, "remarkPlugins" | "rehypePlugins"> {
  const { root, content, files } = document;
  return {
    remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: false }], iconImports],
    rehypePlugins: [
      math,
      rehypeSlug,
      markdownConventions,
      excerpts(files),
      charts(files),
      diagrams,
      [pageOutline, (file: string) => file.startsWith(path.join(root(), content) + path.sep)],
      sourceContext(root),
      codeHighlighting,
    ],
  };
}

/**
 * Compile the page at `url`, such as `/docs/cache.mdx`, as its file is on disk, in the SSR
 * environment so the browser's dependency optimizer does not see it. A stale module is recompiled.
 */
export function compilePage(server: ViteDevServer, root: string, url: string) {
  const environment = server.environments.ssr;
  const file = path.join(root, url);
  const module = environment.moduleGraph.getModuleById(file);
  if (module && existsSync(file) && pageFigures.get(file)?.source !== readFileSync(file, "utf8"))
    environment.moduleGraph.invalidateModule(module);
  return environment.transformRequest(url);
}
