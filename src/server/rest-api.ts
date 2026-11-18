/**
 * The dev server's API under /-/api: wires the resources together, connects them to Vite's file
 * watcher and hot-update connection, and tells agents where the server is.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { ViteDevServer } from "vite";
import type { ExternalFiles } from "../compiler/external-files.ts";
import { createLogger } from "../protocol/log.ts";
import { apiPrefix, type ServerFile, type UpdateEvents } from "../protocol/rest-api.ts";
import { ChatLog } from "./chat-log.ts";
import { DiagnosticStore } from "./diagnostic-store.ts";
import { ChatResource } from "./resources/chat.ts";
import { DiagnosticsResource } from "./resources/diagnostics.ts";
import { FiguresResource } from "./resources/figures.ts";
import { FilesResource } from "./resources/files.ts";
import { Router } from "./router.ts";

const log = createLogger("server");

/** Mount the /-/api resources on a Vite dev server for the document in `content`. */
export function installRestApi(server: ViteDevServer, content: string, files: ExternalFiles) {
  const root = server.config.root;
  const state = `.yapparatus/${content}`;

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
  const chat: ChatLog = new ChatLog({
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
  new DiagnosticsResource(diagnostics).mount(router);
  const fileResource = new FilesResource({ files, server });
  fileResource.mount(router);
  new FiguresResource({ root, content, server }).mount(router);
  server.middlewares.use(apiPrefix, router.middleware());

  const onFile = (file: string) => {
    if (file.startsWith(path.join(root, ".yapparatus") + path.sep)) return;
    diagnostics.fileChanged();
    const address = fileResource.addressOf(file);
    if (address) send("yapparatus:file", () => address, `file:${address}`);
  };
  server.watcher.on("add", onFile);
  server.watcher.on("change", onFile);
  server.watcher.on("unlink", onFile);

  const serverFile = path.join(root, ".yapparatus", "server.json");
  let written = "";
  const announce = () => {
    const address = server.httpServer?.address() as AddressInfo | null;
    if (!address) return;
    const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
    const announced: ServerFile = { url: `http://${host}:${address.port}` };
    written = `${JSON.stringify(announced)}\n`;
    mkdirSync(path.dirname(serverFile), { recursive: true });
    writeFileSync(serverFile, written);
    log.info(`API at ${JSON.parse(written).url}${apiPrefix}, announced in ${serverFile}`);
  };
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
