/**
 * Source files for the web app's file view: GET /-/api/files/{directory}/{path} answers with the
 * file highlighted. The server watches each file it served, so an open view can reload it.
 */
import path from "node:path";
import type { ViteDevServer } from "vite";
import type { ExternalFiles } from "../../compiler/external-files.ts";
import { fileView } from "../../compiler/stages/highlight.ts";
import { fileAddress, filesPrefix, parseFileAddress } from "../../document/file-address.ts";
import { createLogger } from "../../protocol/log.ts";
import { HttpError, type Router } from "../router.ts";

const log = createLogger("files");

export class FilesResource {
  /** Files served so far, by absolute path, with their address. */
  private served = new Map<string, string>();
  private readonly files: ExternalFiles;
  private readonly server: ViteDevServer;

  constructor(options: { files: ExternalFiles; server: ViteDevServer }) {
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
