/**
 * Source files for the reader's file view: GET /-/api/files/{folder}/{path} answers with the
 * file highlighted. The server watches each file it served, so an open view can reload it.
 */
import path from "node:path";
import type { ViteDevServer } from "vite";
import { fileView } from "../code-plugin.ts";
import { fileAddress, filesPrefix, parseFileAddress } from "../files.ts";
import { createLogger } from "../logger.ts";
import type { SourceFiles } from "../source-files.ts";
import { HttpError, type Router } from "./http.ts";

const log = createLogger("files");

export class FileServer {
  /** Files served so far, by absolute path, with their address. */
  private served = new Map<string, string>();
  private readonly files: SourceFiles;
  private readonly server: ViteDevServer;

  constructor(options: { files: SourceFiles; server: ViteDevServer }) {
    this.files = options.files;
    this.server = options.server;
  }

  mount(router: Router) {
    router.on("GET", "/files/:rest*", async ({ params }) => {
      const address = parseFileAddress(`${filesPrefix}/${params.rest}`);
      if (!address || address.lines)
        throw new HttpError(400, "Use /-/api/files/<directory>/<path>, without lines.");
      const file = this.files.read(address);
      if ("error" in file) throw new HttpError(404, file.error);
      if (!this.served.has(file.file)) {
        this.served.set(file.file, fileAddress(address));
        this.server.watcher.add(file.file);
        log.debug(`watching ${file.file}`);
      }
      return { status: 200, body: await fileView(address, file) };
    });
  }

  /** The address of a served file that changed on disk, so open views reload it. */
  addressOf(file: string): string | undefined {
    return this.served.get(path.resolve(file));
  }
}
