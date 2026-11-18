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

/** The options of the Vite plugin. */
export interface YapparatusOptions {
  /** The document's directory, holding its document.json and MDX pages, from the Vite root. */
  document: string;
  /** Inline all application assets. Default: false. */
  singleFile?: boolean;
}

/** The Vite plugin for one document directory of the project. */
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
        server: { watch: { ignored: ["**/dist/**", "**/dist-single/**", "**/.yapparatus/**"] } },
        build: {
          assetsDir: `${appPrefix.slice(1)}/assets`,
          outDir: path.join(options.singleFile ? "dist-single" : "dist", content),
        },
        define: {
          __YAPPARATUS_HASH_ROUTES__: JSON.stringify(!!options.singleFile),
          __YAPPARATUS_LOG__: JSON.stringify(logLevel()),
        },
      }),
      configResolved(config) {
        root = config.root;
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
            name: "yapparatus:single-file-css",
            enforce: "post",
            config: () => ({ build: { cssCodeSplit: true } }),
          } satisfies PluginOption,
        ]
      : [pageFiles(document)]),
  ];
}
