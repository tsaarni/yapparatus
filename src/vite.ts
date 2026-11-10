import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { CustomCollectionIconLoader } from "unplugin-icons";
import { FileSystemHMRIconLoader } from "unplugin-icons/loaders";
import Icons from "unplugin-icons/vite";
import type { PluginOption } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { charts, dataModule, dataModuleCode, readChartFile } from "./chart-plugin.ts";
import { codeHighlighting, excerptFiles, excerpts, fileView } from "./code-plugin.ts";
import { checkIcons, checkPages, checkTheme, pageIdOf, type ThemeSetting } from "./document.ts";
import { documentError } from "./document-directory.ts";
import { checkFiles, type FileAddress, parseFileAddress } from "./files.ts";
import { iconImports } from "./icon-plugin.ts";
import { logLevel } from "./logger.ts";
import { markdownConventions } from "./markdown-plugin.ts";
import { pageOutline } from "./outline-plugin.ts";
import { apiPrefix, appPrefix } from "./protocol.ts";
import { installApi } from "./server/api.ts";
import { SourceFiles } from "./source-files.ts";
import { sourceContext } from "./source-plugin.ts";

export interface YapparatusOptions {
  /** The document's directory, which holds its document.json and MDX pages, relative to the Vite root. */
  document: string;
  /** Inline all application assets. Default: false. */
  singleFile?: boolean;
}

const documentModule = "virtual:yapparatus/document";
/** The source files a build carries, each loaded when a reader opens it. Empty in live mode. */
const filesModule = "virtual:yapparatus/files";
const fileModule = "virtual:yapparatus/file:";

/** The reader app's entry, as the page names it. From `src/` and from `dist/` alike. */
const appEntry = `${appPrefix}/main.tsx`;
const readerEntry = fileURLToPath(new URL("../src/reader/main.tsx", import.meta.url));

/** Packages that pages and the reader must share: one React, one StyleX. */
const sharedRuntime = /^(react|react-dom|@stylexjs\/stylex)(\/|$)/;
const sharedEntries = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "@stylexjs/stylex",
];

/**
 * A virtual module's resolved id, which ends in `.js` before any query. File and data modules
 * end with the file's name, and plugins that claim modules by extension, such as Vite's JSON
 * and CSS plugins, would otherwise compile `package.json` or `styles.css` as their own.
 */
const resolvedId = (id: string) => `\0${id.replace(/(?=\?|$)/, ".js")}`;
/** The virtual id a resolved id stands for, or undefined for any other module. */
const virtualOf = (id: string) =>
  id.startsWith("\0virtual:yapparatus/") ? id.slice(1).replace(/\.js(?=\?|$)/, "") : undefined;

/** Is yapparatus a dependency of the project at `root`, rather than the project itself? */
const installedIn = (root: string) => existsSync(path.join(root, "node_modules", "yapparatus"));

/** The one HTML page every address serves; the reader app routes inside it. */
function indexHtml(theme: ThemeSetting): string {
  const scheme = theme === "auto" ? "light dark" : theme;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta name="color-scheme" content="${scheme}"/><meta name="theme-color" content="#0a0c11"/><title>Yapparatus</title></head><body><div id="root"></div><script type="module" src="${appEntry}"></script></body></html>
`;
}

/** Every source file address written in a page, whole: links, excerpts, and examples alike. */
const fileAddresses = /\/-\/files\/[^\s"'`()<>[\]#]+/g;

export function yapparatus(options: YapparatusOptions): PluginOption[] {
  let root = process.cwd();
  const content = options.document
    .split(path.sep)
    .join("/")
    .replace(/^\.?\/+|\/+$/g, "");
  if (!content || content === "." || content.split("/").includes(".."))
    throw new Error(
      `yapparatus: document must be a directory inside the project, got "${options.document}".`,
    );
  const iconCollections: Record<string, CustomCollectionIconLoader> = {};
  const sourceFiles = new SourceFiles(() => root, content);
  let building = false;
  /**
   * The files a build carries: those the pages name that can be shown. A build never
   * carries a whole folder, only what the document points at.
   */
  const builtFiles = (): FileAddress[] => {
    const named = new Map<string, FileAddress>();
    for (const id of pageIds()) {
      const text = readFileSync(path.join(root, content, `${id}.mdx`), "utf8");
      for (const [written] of text.matchAll(fileAddresses)) {
        const file = parseFileAddress(written);
        if (file && !("error" in sourceFiles.read(file)))
          named.set(`${file.folder}/${file.path}`, { folder: file.folder, path: file.path });
      }
    }
    return [...named.values()];
  };
  /** Page ids from disk, relative to the content folder and without extension. */
  const pageIds = () => {
    const dir = path.join(root, content);
    if (!existsSync(dir)) return [];
    return (readdirSync(dir, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".mdx"))
      .map((file) =>
        file
          .split(path.sep)
          .join("/")
          .replace(/\.mdx$/, ""),
      )
      .sort();
  };
  /** The first paint, before the reader app runs, uses the document's color scheme. */
  const page = () => {
    let theme: ThemeSetting = "dark";
    try {
      theme = JSON.parse(readFileSync(path.join(root, content, "document.json"), "utf8")).theme;
    } catch {
      // A missing or broken document.json is reported when the document module loads.
    }
    return indexHtml(theme ?? "dark");
  };
  const indexFile = () => path.join(root, "index.html");
  return [
    {
      // Compiled pages and custom components import React and StyleX. A project depends only on
      // yapparatus, so these resolve from here, to the same copies the reader uses.
      name: "yapparatus:runtime",
      enforce: "pre",
      resolveId(id, importer, options) {
        if (!sharedRuntime.test(id) || importer === readerEntry) return;
        return this.resolve(id, readerEntry, { ...options, skipSelf: true });
      },
    },
    {
      name: "yapparatus:workspace",
      config: (user) => ({
        // Build output is not source; rebuilding must not reload open pages.
        // Nor is the chat's storage: the server compiles each reply as a temporary file before
        // accepting it, and Vite reloads the page when a file it compiled is removed.
        server: { watch: { ignored: ["**/dist/**", "**/dist-single/**", "**/.yapparatus/**"] } },
        // The reader is source, compiled with the document's pages and styles.
        optimizeDeps: {
          // Scanned at startup, so the first page load does not discover and reload.
          entries: [readerEntry],
          exclude: ["yapparatus"],
          // An installed yapparatus's dependencies are pre-bundled through it, since the project
          // may not depend on them.
          include: installedIn(path.resolve(user.root ?? process.cwd()))
            ? sharedEntries.map((entry) => `yapparatus > ${entry}`)
            : [],
        },
        // Beside the pages, under the application's prefix, so no page name can collide with it.
        // Each document builds to its own directory, which mirrors the document's path.
        build: {
          assetsDir: `${appPrefix.slice(1)}/assets`,
          outDir: path.join(options.singleFile ? "dist-single" : "dist", content),
        },
        // A single file opened from disk has no server to answer page paths.
        // The browser logs at the same level as the server.
        define: {
          __YAPPARATUS_HASH_ROUTES__: JSON.stringify(!!options.singleFile),
          __YAPPARATUS_LOG__: JSON.stringify(logLevel()),
        },
      }),
      resolveId(id) {
        if (id === appEntry) return readerEntry;
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
          const entries = builtFiles().map(({ folder, path: file }) => {
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
          return `export default ${JSON.stringify(await fileView(address, source))};`;
        }
        // A chart's data, loaded when the chart nears the screen. Its id carries the file's
        // version, so a changed file is a new module, and a build gives it its own chunk.
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
        const settingsFile = path.join(root, content, "document.json");
        this.addWatchFile(settingsFile);
        let settings: {
          pages?: unknown;
          theme?: unknown;
          files?: unknown;
          logo?: unknown;
          favicon?: unknown;
        } = {};
        if (existsSync(settingsFile)) {
          try {
            settings = JSON.parse(readFileSync(settingsFile, "utf8"));
          } catch (error) {
            this.error(`${content}/document.json: ${(error as Error).message}`);
          }
        }
        const errors = [
          ...checkPages(pageIds(), settings.pages),
          ...checkTheme(settings.theme),
          ...checkFiles(settings.files),
          ...checkIcons(settings),
        ];
        if (errors.length) this.error(`Pages in ${content}/: ${errors.join(" ")}`);
        const ids = (settings.pages as string[]).map(pageIdOf);
        const files = ids.map((id) => `/${content}/${id}.mdx`);
        // Generated so the glob pattern and the accepted files are literal, as Vite requires.
        // An edited page updates its entry in place and notifies listeners, instead of
        // reloading the app: page modules export `outline`, so React cannot refresh them alone.
        // The logo is a component and the favicon its SVG text, from the same icon collections
        // as pages use, so only the named icons are bundled.
        const icon = (name: unknown) => JSON.stringify(`~icons/${String(name).replace(":", "/")}`);
        return [
          settings.logo
            ? `import Logo from ${icon(settings.logo)};\nexport const logo = Logo;`
            : "export const logo = undefined;",
          settings.favicon
            ? `import favicon from ${icon(`${settings.favicon}?raw`)};\nexport { favicon };`
            : "export const favicon = undefined;",
          `const modules = import.meta.glob(${JSON.stringify(`/${content}/**/*.mdx`)}, { eager: true });`,
          `export const contentDir = ${JSON.stringify(content)};`,
          `export const settings = ${JSON.stringify(settings)};`,
          `export const pages = ${JSON.stringify(ids)}.map((id) => ({`,
          `  id,`,
          `  source: \`${content}/\${id}.mdx\`,`,
          `  ...modules[\`/${content}/\${id}.mdx\`],`,
          `}));`,
          `const listeners = new Set();`,
          `export function onPagesChanged(listener) {`,
          `  listeners.add(listener);`,
          `  return () => listeners.delete(listener);`,
          `}`,
          `if (import.meta.hot)`,
          `  import.meta.hot.accept(${JSON.stringify(files)}, (updated) => {`,
          `    updated.forEach((module, i) => { if (module) Object.assign(pages[i], module); });`,
          `    for (const listener of listeners) listener();`,
          `  });`,
        ].join("\n");
      },
      // A page re-renders when a file it excerpts changes: the file is one of its imports.
      transform(_code, id) {
        for (const file of excerptFiles.get(id.split("?")[0] ?? id) ?? []) this.addWatchFile(file);
      },
      configResolved(config) {
        root = config.root;
        // The yap command adds the plugin, and a project's vite.config.ts may add it again.
        if (config.plugins.filter((plugin) => plugin.name === "yapparatus:workspace").length > 1)
          throw new Error(
            "yapparatus: the plugin is added twice. The yap command adds it, so remove yapparatus() from vite.config.ts.",
          );
        const error = documentError(root, content);
        if (error) throw new Error(`yapparatus: ${error}`);
        // The React plugin asks for React by its plain name, which a project that installed
        // yapparatus need not have; the same entries resolve through yapparatus.
        if (installedIn(root)) {
          const include = config.optimizeDeps.include ?? [];
          config.optimizeDeps.include = include.filter((entry) => !sharedEntries.includes(entry));
        }
        building = config.command === "build";
        Object.assign(iconCollections, FileSystemHMRIconLoader(path.join(root, "icons"), "local"));
      },
      configureServer(server) {
        installApi(server, content, sourceFiles);
        // After Vite's own middlewares: every page address, and every source file's, is the
        // reader app. Other paths with an extension are missing assets.
        return () =>
          server.middlewares.use(async (req, res, next) => {
            const url = (req.url ?? "/").split(/[?#]/)[0] ?? "/";
            // Vite's fallback has already rewritten page addresses to /index.html.
            const isPage = url === "/index.html" || !path.posix.extname(url);
            if (req.method !== "GET" || !isPage || url.startsWith(apiPrefix)) return next();
            try {
              const html = await server.transformIndexHtml(url, page(), req.originalUrl);
              res.setHeader("Content-Type", "text/html");
              res.end(html);
            } catch (error) {
              next(error);
            }
          });
      },
      writeBundle(output) {
        // Give every page a real file, so any static host can serve its path directly.
        if (options.singleFile || !output.dir) return;
        const index = path.join(output.dir, "index.html");
        if (!existsSync(index)) return;
        const fileIds = builtFiles().map(({ folder, path: file }) =>
          path.join(appPrefix.slice(1), "files", folder, file),
        );
        for (const id of [...pageIds(), ...fileIds]) {
          const dir = path.join(output.dir, id);
          mkdirSync(dir, { recursive: true });
          copyFileSync(index, path.join(dir, "index.html"));
        }
        copyFileSync(index, path.join(output.dir, "404.html"));
      },
    },
    {
      ...mdx({
        remarkPlugins: [remarkGfm, iconImports],
        rehypePlugins: [
          rehypeSlug,
          markdownConventions,
          excerpts(sourceFiles),
          charts(sourceFiles),
          [pageOutline, (file: string) => file.startsWith(path.join(root, content) + path.sep)],
          sourceContext(() => root),
          codeHighlighting,
        ],
      }),
      enforce: "pre",
    },
    stylex.vite({
      useCSSLayers: true,
      runtimeInjection: false,
      unstable_moduleResolution: { type: "commonJS" },
    }),
    Icons({
      compiler: "jsx",
      jsx: "react",
      autoInstall: false,
      scale: 1,
      customCollections: iconCollections,
      // The installed collections are yapparatus's dependencies, not the project's.
      collectionsNodeResolvePath: fileURLToPath(new URL("..", import.meta.url)),
    }),
    // Not for pages: their updates go to the page list, which swaps them in place. Fast Refresh
    // would refuse them for exporting `outline` and reload the app.
    react({ include: /\.(js|jsx|ts|tsx)$/ }),
    ...(options.singleFile ? [viteSingleFile()] : []),
  ];
}
