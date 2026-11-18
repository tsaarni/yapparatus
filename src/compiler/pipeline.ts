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
import type { CustomCollectionIconLoader } from "unplugin-icons";
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

export function pipeline(document: DocumentDirectory): PluginOption[] {
  const iconCollections: Record<string, CustomCollectionIconLoader> = {};
  return [
    {
      // Compiled pages and custom components import React and StyleX. A project depends only on
      // yapparatus, so these resolve from here, to the same copies the web app uses.
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
        // The web app is source, compiled with the document's pages and styles.
        optimizeDeps: {
          // Scanned at startup, so the first page load does not discover and reload.
          entries: [appSource],
          exclude: ["yapparatus"],
          // An installed yapparatus's dependencies are pre-bundled through it, since the project
          // may not depend on them.
          include: installedIn(path.resolve(user.root ?? process.cwd()))
            ? sharedEntries.map((entry) => `yapparatus > ${entry}`)
            : [],
        },
      }),
      configResolved(config) {
        // The React plugin asks for React by its plain name, which a project that installed
        // yapparatus need not have; the same entries resolve through yapparatus.
        if (installedIn(config.root)) {
          const include = config.optimizeDeps.include ?? [];
          config.optimizeDeps.include = include.filter((entry) => !sharedEntries.includes(entry));
        }
        Object.assign(
          iconCollections,
          FileSystemHMRIconLoader(path.join(config.root, "icons"), "local"),
        );
      },
      // A page re-renders when a file it excerpts changes: the file is one of its imports.
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
      customCollections: iconCollections,
      // The installed collections are yapparatus's dependencies, not the project's.
      collectionsNodeResolvePath: fileURLToPath(new URL("../..", import.meta.url)),
    }),
    // Not for pages: their updates go to the page list, which swaps them in place. Fast Refresh
    // would refuse them for exporting `outline` and reload the app.
    react({ include: /\.(js|jsx|ts|tsx)$/ }),
  ];
}
