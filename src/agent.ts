/**
 * The agent's side of the chat. An agent calls these from short snippets run with Node:
 *
 *   node --input-type=module-typescript -e 'import { wait } from "yapparatus/agent";
 *     console.log((await wait({ after: 0 })).prompt);'
 *
 * The library only transports. Every prompt and error comes from the server, which also
 * writes the next snippet to run; the library writes only transport errors.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.ts";
import {
  type AgentDiagnostics,
  type AgentPrompt,
  apiPrefix,
  type Diagnostic,
  type ReplyRefusal,
} from "./protocol.ts";

export type {
  AgentDiagnostics,
  AgentPrompt,
  ContextItem,
  Diagnostic,
  ReaderMessage,
  ReportedDiagnostic,
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

/** How long the server may stay unreachable before `wait` gives up, in milliseconds. */
const reconnectFor = 30_000;

/**
 * Wait for reader messages after #`after`, for as long as it takes. Resolves with the messages
 * and the prompt to read, which ends with the next snippet to run. A cleared chat and new errors
 * in the document end the wait too. Calling it again with the same `after` gives the same messages.
 */
export async function wait(options: { after: number }): Promise<AgentPrompt> {
  const listener = randomUUID();
  const base = serverUrl();
  const url = `${base}${apiPrefix}/agent/prompt?after=${options.after}&timeout=${requestWait}&listener=${listener}`;
  let unreachableSince: number | undefined;
  for (;;) {
    let response: Response;
    try {
      response = await call(url, {}, requestWait);
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
    const prompt = (await response.json()) as AgentPrompt;
    // A clear ends the wait too: the agent should drop what it remembers of the chat.
    // New errors in the document end it as well: the agent may have caused them.
    if (prompt.messages.length || prompt.cleared || prompt.newErrors.length) return prompt;
  }
}

/**
 * Send the agent's reply. `to` is the cursor from the prompt: the reply answers every reader
 * message up to it. The MDX is read from stdin: inline with a quoted heredoc, or from a file
 * with `< reply.mdx`. The server compiles it and checks its components and links first; a
 * refused reply rejects with what to fix.
 */
export async function reply(options: { to: number }): Promise<{ seq: number }> {
  if (process.stdin.isTTY)
    throw new YapparatusError(
      "reply() reads the MDX from stdin, and none was given. Add it with <<'MDX' … MDX or < reply.mdx.",
    );
  const mdx = readFileSync(0, "utf8");
  const response = await call(
    `${serverUrl()}${apiPrefix}/agent/reply?to=${options.to}`,
    { method: "POST", headers: { "Content-Type": "text/markdown; charset=utf-8" }, body: mdx },
    requestWait,
  );
  if (!response.ok) throw await failure(response);
  return (await response.json()) as { seq: number };
}

/**
 * The document's errors and warnings, once the checks of recent edits are done. Resolves with
 * them, the pages no browser has checked since they changed, and the prompt to read. It does
 * not touch the chat: run it after editing pages, before replying, or without a chat at all.
 */
export async function check(): Promise<AgentDiagnostics> {
  const response = await call(`${serverUrl()}${apiPrefix}/agent/diagnostics`, {}, requestWait);
  if (!response.ok) throw await failure(response);
  return (await response.json()) as AgentDiagnostics;
}
