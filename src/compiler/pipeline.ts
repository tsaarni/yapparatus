/**
 * The Vite plugins that compile a document: its pages through their stages, and the web app
 * with them, with one React and one StyleX for both.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import stylex from "@stylexjs/unplugin";
import react from "@vitejs/plugin-react";
import { FileSystemHMRIconLoader } from "unplugin-icons/loaders";
import Icons from "unplugin-icons/vite";
import type { PluginOption } from "vite";
import type { DocumentDirectory } from "./document-directory.ts";
import { pageStages } from "./page.ts";
import { excerptFiles } from "./stages/excerpts.ts";
import { appSource } from "./virtual-modules.ts";

/** Packages that pages and the web app must share: one React, one StyleX. */
const sharedRuntime = /^(react|react-dom|@stylexjs\/stylex)(\/|$)/;
const sharedEntries = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "@stylexjs/stylex",
];

/** Is yapparatus a dependency of the project at `root`, rather than the project itself? */
const installedIn = (root: string) => existsSync(path.join(root, "node_modules", "yapparatus"));

/** The loader with hot updates that unplugin-icons takes for a directory of SVG files. */
type HotIconLoader = ReturnType<typeof FileSystemHMRIconLoader>[string];

/**
 * The project's SVG files as `assets:name`. The icon plugin takes the loader before Vite resolves
 * the root, and tracks files for hot updates only through loaders it has from the start.
 */
function assetIcons() {
  let loader: HotIconLoader | undefined;
  const collection: HotIconLoader = {
    __iconifyCustomHmrIconLoader: true,
    name: "assets",
    iconLoader: (name) => loader?.iconLoader(name),
    resolveModuleIconName: (file) => loader?.resolveModuleIconName(file),
    resolveSVGIconPath: (name) => loader?.resolveSVGIconPath(name),
  };
  const setRoot = (root: string) => {
    loader = FileSystemHMRIconLoader(path.join(root, "assets"), "assets").assets;
  };
  return { collection, setRoot };
}

/** The plugins for a document: shared runtime, MDX pages, StyleX, icons, and the web app. */
export function pipeline(document: DocumentDirectory): PluginOption[] {
  const assets = assetIcons();
  return [
    {
      name: "yapparatus:runtime",
      enforce: "pre",
      resolveId(id, importer, options) {
        if (!sharedRuntime.test(id) || importer === appSource) return;
        return this.resolve(id, appSource, { ...options, skipSelf: true });
      },
    },
    {
      name: "yapparatus:pages",
      config: (user) => ({
        optimizeDeps: {
          entries: [appSource],
          exclude: ["yapparatus"],
          include: installedIn(path.resolve(user.root ?? process.cwd()))
            ? sharedEntries.map((entry) => `yapparatus > ${entry}`)
            : [],
        },
      }),
      configResolved(config) {
        if (installedIn(config.root)) {
          const include = config.optimizeDeps.include ?? [];
          config.optimizeDeps.include = include.filter((entry) => !sharedEntries.includes(entry));
        }
        assets.setRoot(config.root);
      },
      transform(_code, id) {
        for (const file of excerptFiles.get(id.split("?")[0] ?? id) ?? []) this.addWatchFile(file);
      },
    },
    { ...mdx(pageStages(document)), enforce: "pre" },
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
      customCollections: { assets: assets.collection },
      collectionsNodeResolvePath: fileURLToPath(new URL("../..", import.meta.url)),
    }),
    react({ include: /\.(js|jsx|ts|tsx)$/ }),
  ];
}
