/**
 * The agent's side of the chat. An agent calls these from short snippets run with Node:
 *
 *   node --input-type=module-typescript -e 'import { waitForMessage } from "yapparatus/agent";
 *     console.log((await waitForMessage()).prompt);'
 *
 * The library only transports. Every prompt and error comes from the server, which also
 * writes the next snippet to run; the library writes only transport errors.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.ts";
import {
  agentHeader,
  apiPrefix,
  type Chat,
  type Diagnostic,
  type DocumentDiagnostics,
  type NewMessage,
  type ReplyRefusal,
} from "./protocol.ts";

export type {
  AgentMessage,
  AgentState,
  Chat,
  ContextItem,
  Diagnostic,
  DocumentDiagnostics,
  Message,
  ReaderMessage,
  ReportedDiagnostic,
  UncheckedPage,
} from "./protocol.ts";

const log = createLogger("agent");

/** The longest single request, in seconds; the server waits no longer than this either. */
const requestWait = 25;

/**
 * An error whose message is meant for the agent: what went wrong and the snippet to run next.
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

// A snippet that does not catch an error ends with the server's text alone, not Node's frames
// around it. Other errors keep their stack. Errors the snippet catches are not affected.
process.on("uncaughtException", (error) => {
  process.stderr.write(
    `${error instanceof YapparatusError ? error.message : (error.stack ?? String(error))}\n`,
  );
  process.exit(1);
});

/** The server's address, from `.yapparatus/server.json` in this folder or the nearest above. */
function serverUrl(): string {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const file = path.join(dir, ".yapparatus", "server.json");
    if (existsSync(file)) {
      const { url } = JSON.parse(readFileSync(file, "utf8")) as { url: string };
      log.debug(`server ${url}, from ${file}`);
      return url;
    }
    if (path.dirname(dir) === dir)
      throw new YapparatusError(
        `No Yapparatus server found: there is no .yapparatus/server.json in ${process.cwd()} or above. Start the dev server in the project directory with \`pnpm dev <directory>\`, then run this again from that directory.`,
      );
  }
}

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
 * Wait until there is something for the agent: reader messages not answered yet, or errors in
 * the document that the agent has not been given. Resolves with them and the prompt to read,
 * which ends with the next snippet. The server remembers what it gave the agent, so calling
 * it again without replying gives the same messages.
 */
export async function waitForMessage(): Promise<Chat> {
  const query = new URLSearchParams({
    author: "reader",
    include: "diagnostics",
    wait: String(requestWait),
  });
  const url = `${serverUrl()}${apiPrefix}/chat?${query}`;
  // One agent for the whole wait: its reads are one long wait, and a newer one takes over.
  const headers = { [agentHeader]: randomUUID() };
  let unreachableSince: number | undefined;
  for (;;) {
    let response: Response;
    try {
      response = await call(url, { headers }, requestWait);
    } catch (error) {
      // A restarting dev server drops waiting requests; a stopped one stays away.
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
 * Send the agent's reply to the reader messages that the last wait returned. Check the
 * document first if you edited pages. The MDX is read from stdin: inline with a quoted
 * heredoc, or from a file with `< reply.mdx`. The server compiles it and checks its
 * components and links first; a refused reply rejects with what to fix.
 */
export async function sendReply(): Promise<void> {
  if (process.stdin.isTTY)
    throw new YapparatusError(
      "sendReply() reads the MDX from stdin, and none was given. Add it with <<'MDX' … MDX or < reply.mdx.",
    );
  const message: NewMessage = { author: "agent", mdx: readFileSync(0, "utf8") };
  const response = await call(
    `${serverUrl()}${apiPrefix}/chat`,
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
 * The document's errors and warnings, once the checks of recent edits are done. Resolves with
 * them, the pages no browser has checked since they changed with what was found before, and
 * the prompt to read. The errors it returns are given to the agent, so a later wait does not
 * return them again. Run it after editing pages, before replying, or without a chat at all.
 */
export async function checkDocument(): Promise<DocumentDiagnostics> {
  const response = await call(`${serverUrl()}${apiPrefix}/diagnostics`, {}, requestWait);
  if (!response.ok) throw await failure(response);
  return (await response.json()) as DocumentDiagnostics;
}
