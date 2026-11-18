/**
 * The Vite plugin: the compiler's plugins, the dev server's REST API, and what only a build
 * needs, for one document directory of the project.
 */
import path from "node:path";
import type { PluginOption } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { documentError } from "../compiler/document-directory.ts";
import { ExternalFiles } from "../compiler/external-files.ts";
import { pipeline } from "../compiler/pipeline.ts";
import { virtualModules } from "../compiler/virtual-modules.ts";
import { appPrefix } from "../document/file-address.ts";
import { logLevel } from "../protocol/log.ts";
import { installRestApi } from "../server/rest-api.ts";
import { pageFiles } from "./page-files.ts";

export interface YapparatusOptions {
  /** The document's directory, which holds its document.json and MDX pages, relative to the Vite root. */
  document: string;
  /** Inline all application assets. Default: false. */
  singleFile?: boolean;
}

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
  const files = new ExternalFiles(() => root, content);
  const document = { root: () => root, content, files };
  return [
    {
      name: "yapparatus:workspace",
      config: () => ({
        // Build output is not source; rebuilding must not reload open pages.
        // Nor is the chat's storage: the server compiles each reply as a temporary file before
        // accepting it, and Vite reloads the page when a file it compiled is removed.
        server: { watch: { ignored: ["**/dist/**", "**/dist-single/**", "**/.yapparatus/**"] } },
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
      configResolved(config) {
        root = config.root;
        // The yap command adds the plugin, and a project's vite.config.ts may add it again.
        if (config.plugins.filter((plugin) => plugin.name === "yapparatus:workspace").length > 1)
          throw new Error(
            "yapparatus: the plugin is added twice. The yap command adds it, so remove yapparatus() from vite.config.ts.",
          );
        const error = documentError(root, content);
        if (error) throw new Error(`yapparatus: ${error}`);
      },
      configureServer(server) {
        installRestApi(server, content, files);
      },
    },
    virtualModules(document),
    ...pipeline(document),
    ...(options.singleFile
      ? [
          viteSingleFile(),
          {
            // vite-plugin-singlefile turns off CSS code splitting. Vite then emits the CSS file after
            // StyleX looks for one to append its rules to, and StyleX writes them to a separate file.
            // Code splitting is off, so the one chunk still has one CSS file to inline.
            name: "yapparatus:single-file-css",
            enforce: "post",
            config: () => ({ build: { cssCodeSplit: true } }),
          } satisfies PluginOption,
        ]
      : [pageFiles(document)]),
  ];
}
