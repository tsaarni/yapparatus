/**
 * The dev server's API under /-/api. Each concern is its own module; this file only wires
 * them together, connects them to Vite's file watcher, and tells agents where the server is.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { ViteDevServer } from "vite";
import { createLogger } from "../logger.ts";
import { apiPrefix, type ChatState } from "../protocol.ts";
import type { SourceFiles } from "../source-files.ts";
import { AgentChannel } from "./agent.ts";
import { ChatStore } from "./chat.ts";
import { DiagnosticStore } from "./diagnostics.ts";
import { EventHub } from "./events.ts";
import { FileServer } from "./files.ts";
import { Router } from "./http.ts";
import { Sequence } from "./sequence.ts";

const log = createLogger("server");

export function installApi(server: ViteDevServer, content: string, files: SourceFiles) {
  const root = server.config.root;
  const events = new EventHub();
  // Each document keeps its chat state under its own path; one server runs at a time.
  const state = `.yapparatus/${content}`;
  const sequence = new Sequence(path.join(root, state, "sequence"));
  // Each module reports that it changed; this file decides who hears about it.
  const chatState = (): ChatState => ({
    messages: [...chat.messages],
    repliedTo: chat.repliedTo(),
    agent: agent.status,
    start: agent.start,
  });
  const publishChat = () => events.publish({ type: "chat", chat: chatState() });
  const diagnostics: DiagnosticStore = new DiagnosticStore({
    root,
    content,
    server,
    files,
    changed: () => {
      events.publish({ type: "diagnostics", diagnostics: diagnostics.list() });
      agent.diagnosticsChanged();
    },
  });
  const chat: ChatStore = new ChatStore({
    root,
    state,
    content,
    server,
    files,
    sequence,
    outlines: () => diagnostics.outlines(),
    changed: () => {
      publishChat();
      agent.chatChanged();
    },
  });
  const agent: AgentChannel = new AgentChannel({
    root,
    folders: () => files.folders(),
    content,
    chat,
    sequence,
    diagnostics: {
      list: () => diagnostics.list(),
      unchecked: () => diagnostics.unchecked(),
      settled: () => diagnostics.settled(),
    },
    changed: publishChat,
  });

  const router = new Router();
  router.on("GET", "/chat", () => ({ status: 200, body: chatState() }));
  chat.mount(router);
  agent.mount(router);
  diagnostics.mount(router);
  const fileServer = new FileServer({ files, server });
  fileServer.mount(router);
  events.mount(router, () => [
    { type: "chat", chat: chatState() },
    { type: "diagnostics", diagnostics: diagnostics.list() },
  ]);
  server.middlewares.use(apiPrefix, router.middleware());

  const onFile = (file: string) => {
    if (file.startsWith(path.join(root, ".yapparatus") + path.sep)) return;
    diagnostics.fileChanged();
    const address = fileServer.addressOf(file);
    // Keyed by address: two files saved together are two events.
    if (address) events.publish({ type: "file", address }, `file:${address}`);
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
    agent.close();
    events.close();
    const current = existsSync(serverFile) ? readFileSync(serverFile, "utf8") : "";
    if (written && current === written) rmSync(serverFile, { force: true });
    log.info("closed");
  });
}
