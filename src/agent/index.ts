/**
 * The agent's side of the chat, called from short `node -e` commands.
 * It only transports: prompts and errors come from the server, except transport errors.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Diagnostic } from "../document/diagnostic.ts";
import { createLogger } from "../protocol/log.ts";
import {
  agentHeader,
  apiPrefix,
  type Chat,
  type DocumentDiagnostics,
  type NewMessage,
  type ReplyRefusal,
  type ServerFile,
} from "../protocol/rest-api.ts";

export type { Diagnostic } from "../document/diagnostic.ts";
export type { Reference } from "../document/reference.ts";
export type {
  AgentMessage,
  AgentState,
  Chat,
  DocumentDiagnostics,
  Message,
  ReaderMessage,
  ReportedDiagnostic,
  UncheckedPage,
} from "../protocol/rest-api.ts";

const log = createLogger("agent");

/** The longest single request, in seconds; the server waits no longer than this either. */
const requestWait = 25;

/**
 * An error whose message is meant for the agent: what went wrong and the command to run next.
 * A refused reply also carries the diagnostics behind it.
 */
export class YapparatusError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(message: string, diagnostics: Diagnostic[] = []) {
    super(message);
    this.name = "YapparatusError";
    this.diagnostics = diagnostics;
  }
}

process.on("uncaughtException", (error) => {
  process.stderr.write(
    `${error instanceof YapparatusError ? error.message : (error.stack ?? String(error))}\n`,
  );
  process.exit(1);
});

/** The running server's address, from `.yapparatus/server.json` here or in the nearest parent. */
function findServer(): ServerFile {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const file = path.join(dir, ".yapparatus", "server.json");
    if (existsSync(file)) {
      const found = JSON.parse(readFileSync(file, "utf8")) as ServerFile;
      log.debug(`server ${found.url}, from ${file}`);
      return found;
    }
    if (path.dirname(dir) === dir)
      throw new YapparatusError(
        `No Yapparatus server found: there is no .yapparatus/server.json in ${process.cwd()} or above. Start the dev server in the project directory with \`pnpm dev <directory>\`, then run this again from that directory.`,
      );
  }
}

/** Fetch a server resource, turning no answer within `timeout` seconds into a YapparatusError. */
async function call(url: string, init: RequestInit, timeout: number): Promise<Response> {
  log.debug(init.method ?? "GET", url);
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout((timeout + 10) * 1000),
    });
    log.debug(response.status, url);
    return response;
  } catch (error) {
    log.debug("no answer:", error);
    throw new YapparatusError(
      `The Yapparatus server at ${new URL(url).origin} did not answer. Start it with \`pnpm dev <directory>\` in the project directory, then run this again.`,
    );
  }
}

/** The YapparatusError for a failed response, with the server's message and diagnostics. */
async function failure(response: Response): Promise<YapparatusError> {
  const body = (await response.json().catch(() => ({}))) as Partial<ReplyRefusal>;
  return new YapparatusError(
    body.error ?? `${response.status} ${response.statusText}`,
    body.diagnostics ?? [],
  );
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long the server may stay unreachable before `waitForMessage` gives up, in milliseconds. */
const reconnectFor = 30_000;

/**
 * Wait for unanswered reader messages or document errors the agent has not been given.
 * Resolves with them and the prompt to read; calling again without replying gives the same.
 */
export async function waitForMessage(): Promise<Chat> {
  const query = new URLSearchParams({
    author: "reader",
    include: "diagnostics",
    wait: String(requestWait),
  });
  const url = `${findServer().url}${apiPrefix}/chat?${query}`;
  const headers = { [agentHeader]: randomUUID() };
  let unreachableSince: number | undefined;
  for (;;) {
    let response: Response;
    try {
      response = await call(url, { headers }, requestWait);
    } catch (error) {
      unreachableSince ??= Date.now();
      if (Date.now() - unreachableSince >= reconnectFor) throw error;
      log.info("server did not answer; retrying in 1 s");
      await pause(1000);
      continue;
    }
    unreachableSince = undefined;
    if (!response.ok) throw await failure(response);
    const chat = (await response.json()) as Chat;
    if (chat.messages.length || chat.diagnostics?.length) return chat;
  }
}

/**
 * Send the reply MDX from stdin to the reader messages the last wait returned.
 * The server checks it first; a refused reply rejects with what to fix.
 */
export async function sendReply(): Promise<void> {
  if (process.stdin.isTTY)
    throw new YapparatusError(
      "sendReply() reads the MDX from stdin, and none was given. Add it with <<'MDX' … MDX or < reply.mdx.",
    );
  const message: NewMessage = { author: "agent", mdx: readFileSync(0, "utf8") };
  const response = await call(
    `${findServer().url}${apiPrefix}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    },
    requestWait,
  );
  if (!response.ok) throw await failure(response);
}

/**
 * The document's errors and warnings once checks of recent edits finish, with unchecked pages.
 * The errors count as given to the agent, so a later wait does not return them again.
 */
export async function checkDocument(): Promise<DocumentDiagnostics> {
  const response = await call(`${findServer().url}${apiPrefix}/diagnostics`, {}, requestWait);
  if (!response.ok) throw await failure(response);
  return (await response.json()) as DocumentDiagnostics;
}

/**
 * Save the diagram at `/page#figure` as a light-theme PNG at `file`, which the caller removes.
 * `ids` labels each element with its id and outlines the elements that diagnostics name.
 */
export async function savePicture(
  address: string,
  file: string,
  options: { ids?: boolean } = {},
): Promise<void> {
  const [page = "", figure = ""] = address.replace(/^\//, "").split("#");
  const resource = `${apiPrefix}/figures/${page}/${encodeURIComponent(figure)}`;
  const query = options.ids ? "?ids=true" : "";
  const response = await call(`${findServer().url}${resource}${query}`, {}, requestWait);
  if (!response.ok) throw await failure(response);
  writeFileSync(file, new Uint8Array(await response.arrayBuffer()));
}
