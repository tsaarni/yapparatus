/**
 * The modules the web app imports that no file holds: the document with every page's outline,
 * the source files a build carries, each file's view, and the entry page every address serves.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginOption, ViteDevServer } from "vite";
import {
  appPrefix,
  checkFiles,
  type FileAddress,
  parseFileAddress,
} from "../document/file-address.ts";
import type { PageOutline } from "../document/page-module.ts";
import { pageIdOf, type ThemeSetting } from "../document/settings.ts";
import { apiPrefix } from "../protocol/rest-api.ts";
import { checkIcons, checkPages, checkTheme } from "./document-checks.ts";
import { type DocumentDirectory, pageIds } from "./document-directory.ts";
import { compilePage } from "./page.ts";
import { dataModule, dataModuleCode, readChartFile } from "./stages/charts.ts";
import { excerptFiles } from "./stages/excerpts.ts";
import { fileView } from "./stages/highlight.ts";
import { compiled } from "./stages/outline.ts";

const documentModule = "virtual:yapparatus/document";
/** The source files a build carries, each loaded when a reader opens it. Empty in live mode. */
const filesModule = "virtual:yapparatus/files";
const fileModule = "virtual:yapparatus/file:";

/** The web app's entry, as the page names it. From `src/` and from `lib/` alike. */
const appEntry = `${appPrefix}/main.tsx`;
/** The web app's entry file on disk, which the shared React and StyleX resolve from. */
export const appSource = fileURLToPath(new URL("../../src/web/main.tsx", import.meta.url));

/**
 * A virtual module's resolved id, ending in `.js` before any query, so plugins that claim modules
 * by extension, such as Vite's JSON and CSS plugins, leave file modules like `package.json` alone.
 */
const resolvedId = (id: string) => `\0${id.replace(/(?=\?|$)/, ".js")}`;
/** The virtual id a resolved id stands for, or undefined for any other module. */
const virtualOf = (id: string) =>
  id.startsWith("\0virtual:yapparatus/") ? id.slice(1).replace(/\.js(?=\?|$)/, "") : undefined;

/** The one HTML page every address serves; the web app routes inside it. */
function indexHtml(theme: ThemeSetting): string {
  const scheme = theme === "auto" ? "light dark" : theme;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta name="color-scheme" content="${scheme}"/><meta name="theme-color" content="#0a0c11"/><title>Yapparatus</title></head><body><div id="root"></div><script type="module" src="${appEntry}"></script></body></html>
`;
}

/** Every source file address written in a page, whole: links, excerpts, and examples alike. */
const fileAddresses = /\/-\/files\/[^\s"'`()<>[\]#]+/g;

/**
 * The files a build carries: those the pages name that can be shown. A build never carries a
 * whole folder, only what the document points at.
 */
export function builtFiles(document: DocumentDirectory): FileAddress[] {
  const { root, content, files } = document;
  const named = new Map<string, FileAddress>();
  for (const id of pageIds(root(), content)) {
    const text = readFileSync(path.join(root(), content, `${id}.mdx`), "utf8");
    for (const [written] of text.matchAll(fileAddresses)) {
      const file = parseFileAddress(written);
      if (file && !("error" in files.read(file)))
        named.set(`${file.folder}/${file.path}`, { folder: file.folder, path: file.path });
    }
  }
  return [...named.values()];
}

/** The plugin that resolves and loads the virtual modules and serves the entry page. */
export function virtualModules(document: DocumentDirectory): PluginOption {
  const { root, content, files: sourceFiles } = document;
  let building = false;
  let devServer: ViteDevServer | undefined;
  let loadedSettings: string | undefined;
  const feedsOutline = (file: string) =>
    (file.endsWith(".mdx") && file.startsWith(path.join(root(), content) + path.sep)) ||
    [...excerptFiles.values()].some((read) => read.has(file));
  const outlineOf = async (
    id: string,
    compile: (url: string) => Promise<string | undefined>,
  ): Promise<PageOutline> => {
    const empty = {
      revision: "",
      title: id,
      headings: [],
      numbered: [],
      anchors: [],
      links: [],
      refs: [],
    };
    try {
      const file = await compile(`/${content}/${id}.mdx`);
      return (file && compiled.get(file)?.outline) || empty;
    } catch {
      return empty;
    }
  };
  const page = () => {
    let theme: ThemeSetting = "dark";
    try {
      theme = JSON.parse(readFileSync(path.join(root(), content, "document.json"), "utf8")).theme;
    } catch {}
    return indexHtml(theme ?? "dark");
  };
  const indexFile = () => path.join(root(), "index.html");
  return {
    name: "yapparatus:virtual-modules",
    configResolved(config) {
      building = config.command === "build";
    },
    resolveId(id) {
      if (id === appEntry) return appSource;
      if (id === indexFile()) return id;
      return id === documentModule ||
        id === filesModule ||
        id.startsWith(fileModule) ||
        id.startsWith(dataModule)
        ? resolvedId(id)
        : undefined;
    },
    async load(resolved) {
      if (resolved === indexFile()) return page();
      const id = virtualOf(resolved);
      if (!id) return;
      if (id === filesModule) {
        if (!building) return "export const files = {};";
        const entries = builtFiles(document).map(({ folder, path: file }) => {
          const key = JSON.stringify(`${folder}/${file}`);
          const module = JSON.stringify(`${fileModule}${folder}/${file}`);
          return `  ${key}: () => import(${module}),`;
        });
        return `export const files = {\n${entries.join("\n")}\n};`;
      }
      if (id.startsWith(fileModule)) {
        const address = parseFileAddress(`/-/files/${id.slice(fileModule.length)}`);
        const source = address && sourceFiles.read(address);
        if (!address || !source || "error" in source)
          return this.error(`yapparatus: cannot read ${id}.`);
        this.addWatchFile(source.file);
        const view = JSON.stringify(await fileView(address, source));
        return `export default JSON.parse(${JSON.stringify(view)});`;
      }
      if (id.startsWith(dataModule)) {
        const name = id.slice(dataModule.length).split("?")[0] ?? "";
        const address = parseFileAddress(`/-/files/${name}`);
        const read = address && readChartFile(sourceFiles, address);
        if (!read || "error" in read)
          return this.error(`yapparatus: cannot read the chart data ${name}.`);
        this.addWatchFile(read.source.file);
        return dataModuleCode(read.data);
      }
      if (id !== documentModule) return;
      const settingsFile = path.join(root(), content, "document.json");
      this.addWatchFile(settingsFile);
      let settings: {
        pages?: unknown;
        theme?: unknown;
        files?: unknown;
        logo?: unknown;
        favicon?: unknown;
      } = {};
      loadedSettings = existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : undefined;
      if (loadedSettings !== undefined) {
        try {
          settings = JSON.parse(loadedSettings);
        } catch (error) {
          this.error(`${content}/document.json: ${(error as Error).message}`);
        }
      }
      const errors = [
        ...checkPages(pageIds(root(), content), settings.pages),
        ...checkTheme(settings.theme),
        ...checkFiles(settings.files),
        ...checkIcons(settings),
      ];
      if (errors.length) this.error(`Pages in ${content}/: ${errors.join(" ")}`);
      const ids = (settings.pages as string[]).map(pageIdOf);
      const files = ids.map((id) => `/${content}/${id}.mdx`);
      const server = devServer;
      const compile = server
        ? async (url: string) => {
            await compilePage(server, root(), url);
            return path.join(root(), url);
          }
        : async (url: string) => {
            const resolved = await this.resolve(url);
            if (resolved) await this.load({ id: resolved.id });
            return resolved?.id;
          };
      const outlines = Object.fromEntries(
        await Promise.all(ids.map(async (id) => [id, await outlineOf(id, compile)] as const)),
      );
      const icon = (name: unknown) => JSON.stringify(`~icons/${String(name).replace(":", "/")}`);
      return [
        settings.logo
          ? `import Logo from ${icon(settings.logo)};\nexport const logo = Logo;`
          : "export const logo = undefined;",
        settings.favicon
          ? `import favicon from ${icon(`${settings.favicon}?raw`)};\nexport { favicon };`
          : "export const favicon = undefined;",
        `const modules = import.meta.glob(${JSON.stringify(`/${content}/**/*.mdx`)});`,
        `const outlines = ${JSON.stringify(outlines)};`,
        `export const contentDir = ${JSON.stringify(content)};`,
        `export const settings = ${JSON.stringify(settings)};`,
        `const loading = [];`,
        `export const pages = ${JSON.stringify(ids)}.map((id, i) => ({`,
        `  id,`,
        `  source: \`${content}/\${id}.mdx\`,`,
        `  outline: outlines[id],`,
        `  module: undefined,`,
        `  error: undefined,`,
        `  load: () =>`,
        `    (loading[i] ??= modules[\`/${content}/\${id}.mdx\`]().then(`,
        `      (module) => (pages[i].module = module),`,
        `      (error) => {`,
        `        pages[i].error = error;`,
        `        throw error;`,
        `      },`,
        `    )),`,
        `}));`,
        `const listeners = new Set();`,
        `export function onPagesChanged(listener) {`,
        `  listeners.add(listener);`,
        `  return () => listeners.delete(listener);`,
        `}`,
        `if (import.meta.hot)`,
        `  import.meta.hot.accept(${JSON.stringify(files)}, (updated) => {`,
        `    updated.forEach((module, i) => {`,
        `      if (!module) return;`,
        `      Object.assign(pages[i], { module, outline: module.outline, error: undefined });`,
        `      loading[i] = Promise.resolve(module);`,
        `    });`,
        `    for (const listener of listeners) listener();`,
        `  });`,
      ].join("\n");
    },
    hotUpdate({ file }) {
      if (this.environment.name !== "client" || !feedsOutline(file)) return;
      const graph = this.environment.moduleGraph;
      const module = graph.getModuleById(resolvedId(documentModule));
      if (module) graph.invalidateModule(module);
    },
    configureServer(server) {
      devServer = server;
      return () =>
        server.middlewares.use(async (req, res, next) => {
          const url = (req.url ?? "/").split(/[?#]/)[0] ?? "/";
          const isPage = url === "/index.html" || !path.posix.extname(url);
          if (req.method !== "GET" || !isPage || url.startsWith(apiPrefix)) return next();
          const settingsFile = path.join(root(), content, "document.json");
          const settings = existsSync(settingsFile)
            ? readFileSync(settingsFile, "utf8")
            : undefined;
          const graph = server.environments.client.moduleGraph;
          const module = graph.getModuleById(resolvedId(documentModule));
          if (module && settings !== loadedSettings) graph.invalidateModule(module);
          try {
            const html = await server.transformIndexHtml(url, page(), req.originalUrl);
            res.setHeader("Content-Type", "text/html");
            res.end(html);
          } catch (error) {
            next(error);
          }
        });
    },
  };
}
