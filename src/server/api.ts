/**
 * The dev server's API under /-/api. Each resource is its own module; this file only wires
 * them together, connects them to Vite's file watcher, sends changes to the browser on Vite's
 * hot-update connection, and tells agents where the server is.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { ViteDevServer } from "vite";
import { createLogger } from "../logger.ts";
import { apiPrefix, type UpdateEvents } from "../protocol.ts";
import type { SourceFiles } from "../source-files.ts";
import { ChatStore } from "./chat.ts";
import { ChatResource } from "./chat-resource.ts";
import { DiagnosticStore } from "./diagnostics.ts";
import { FileServer } from "./files.ts";
import { Router } from "./http.ts";

const log = createLogger("server");

export function installApi(server: ViteDevServer, content: string, files: SourceFiles) {
  const root = server.config.root;
  // Each document keeps its chat state under its own path; one server runs at a time.
  const state = `.yapparatus/${content}`;

  // Changes within a short window collapse into the latest of each, so a burst of edits sends
  // the browser one update.
  const pending = new Map<string, () => void>();
  let flushTimer: NodeJS.Timeout | undefined;
  const send = <E extends keyof UpdateEvents>(
    event: E,
    data: () => UpdateEvents[E],
    key: string = event,
  ) => {
    pending.set(key, () => server.ws.send(event as string, data() as unknown));
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      for (const flush of pending.values()) flush();
      log.debug(`sent ${[...pending.keys()].join(", ")}`);
      pending.clear();
    }, 50);
  };

  // Each module reports that it changed; this file decides who hears about it.
  const chatChanged = () => send("yapparatus:chat", () => resource.whole());
  const diagnostics: DiagnosticStore = new DiagnosticStore({
    root,
    content,
    server,
    files,
    replies: () => chat.replyModules(),
    changed: () => {
      send("yapparatus:diagnostics", () => diagnostics.list());
      resource.changed();
    },
  });
  const chat: ChatStore = new ChatStore({
    root,
    state,
    content,
    server,
    files,
    outlines: () => diagnostics.outlines(),
    changed: () => {
      chatChanged();
      resource.changed();
    },
  });
  const resource: ChatResource = new ChatResource({
    root,
    folders: () => files.folders(),
    content,
    chat,
    diagnostics,
    changed: chatChanged,
  });

  const router = new Router();
  resource.mount(router);
  diagnostics.mount(router);
  const fileServer = new FileServer({ files, server });
  fileServer.mount(router);
  server.middlewares.use(apiPrefix, router.middleware());

  const onFile = (file: string) => {
    if (file.startsWith(path.join(root, ".yapparatus") + path.sep)) return;
    diagnostics.fileChanged();
    const address = fileServer.addressOf(file);
    // Keyed by address: two files saved together are two updates.
    if (address) send("yapparatus:file", () => address, `file:${address}`);
  };
  server.watcher.on("add", onFile);
  server.watcher.on("change", onFile);
  server.watcher.on("unlink", onFile);

  // The agent library finds the server through this file in the project folder.
  // The newest server writes it; a server removes it on close only if it is still its own.
  const serverFile = path.join(root, ".yapparatus", "server.json");
  let written = "";
  const announce = () => {
    const address = server.httpServer?.address() as AddressInfo | null;
    if (!address) return;
    const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
    written = `${JSON.stringify({ url: `http://${host}:${address.port}` })}\n`;
    mkdirSync(path.dirname(serverFile), { recursive: true });
    writeFileSync(serverFile, written);
    log.info(`API at ${JSON.parse(written).url}${apiPrefix}, announced in ${serverFile}`);
  };
  // A restart after a config change reuses the listening server.
  const start = () => {
    announce();
    void diagnostics.checkSources();
  };
  if (server.httpServer?.listening) start();
  else server.httpServer?.once("listening", start);
  server.httpServer?.once("close", () => {
    resource.close();
    clearTimeout(flushTimer);
    const current = existsSync(serverFile) ? readFileSync(serverFile, "utf8") : "";
    if (written && current === written) rmSync(serverFile, { force: true });
    log.info("closed");
  });
}
