/**
 * The single file's script, stored compressed: the page carries it gzipped as base64, and a
 * small loader unpacks it with the browser's `DecompressionStream` and runs it.
 */
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/** The loader that unpacks the gzipped script in `packed` and runs it as a module. */
export function loaderOf(packed: string): string {
  return `const script=document.createElement("script");script.type="module";script.textContent=await new Response((await fetch("data:application/gzip;base64,${packed}")).body.pipeThrough(new DecompressionStream("gzip"))).text();document.head.append(script);`;
}

/** The build plugin that replaces the entry script with its loader, before it is inlined. */
export function packedScript(): Plugin {
  return {
    name: "yapparatus:packed-script",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const chunk of Object.values(bundle))
          if (chunk.type === "chunk" && chunk.isEntry)
            chunk.code = loaderOf(gzipSync(chunk.code, { level: 9 }).toString("base64"));
      },
    },
  };
}
