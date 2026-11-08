/** A small JSON router for the /-/api resources. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "../logger.ts";

const log = createLogger("http");

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  /** A JSON body. */
  body: Record<string, unknown>;
  /** A plain-text body, such as an MDX reply. */
  text: string;
  req: IncomingMessage;
  res: ServerResponse;
}

export interface Reply {
  status: number;
  headers?: Record<string, string>;
  /** JSON body; a string is sent as plain text. Omit for 204. */
  body?: unknown;
}

/** Returned by handlers that wrote the response themselves, such as event streams. */
export const handled = Symbol("handled");

type Handler = (request: ApiRequest) => Reply | typeof handled | Promise<Reply | typeof handled>;

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readText(req: IncomingMessage): Promise<string> {
  let data = "";
  for await (const chunk of req) {
    data += String(chunk);
    if (data.length > 512_000) throw new HttpError(413, "Request too large.");
  }
  return data;
}

function parseJson(data: string): Record<string, unknown> {
  if (!data) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new HttpError(400, "Body is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new HttpError(400, "Expected a JSON object.");
  return parsed;
}

export class Router {
  private routes: Array<{ method: Method; pattern: RegExp; keys: string[]; handle: Handler }> = [];

  /** Register a route. Path segments like ":id" become params; a trailing ":rest*" takes the rest. */
  on(method: Method, path: string, handle: Handler): this {
    const keys: string[] = [];
    const source = path.replace(/:(\w+)(\*)?/g, (_m, key: string, rest?: string) => {
      keys.push(key);
      return rest ? "(.+)" : "([^/]+)";
    });
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handle });
    return this;
  }

  /** Connect middleware. Only the local reader may call the API. */
  middleware() {
    return (req: IncomingMessage, res: ServerResponse) => {
      const started = Date.now();
      let failure = "";
      res.on("finish", () =>
        log.debug(req.method, req.url, res.statusCode, `${Date.now() - started} ms${failure}`),
      );
      const send = ({ status, headers = {}, body }: Reply) => {
        const text = typeof body === "string";
        res.writeHead(status, {
          "Cache-Control": "no-store",
          ...(body === undefined
            ? {}
            : { "Content-Type": text ? "text/plain; charset=utf-8" : "application/json" }),
          ...headers,
        });
        res.end(body === undefined ? undefined : text ? body : JSON.stringify(body));
      };
      void (async () => {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
          throw new HttpError(403, "Origin rejected.");
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname;
        const matching = this.routes.filter((route) => route.pattern.test(pathname));
        const route = matching.find((candidate) => candidate.method === req.method);
        if (!route) {
          if (!matching.length) throw new HttpError(404, `No API route ${pathname}.`);
          send({
            status: 405,
            headers: { Allow: [...new Set(matching.map((m) => m.method))].join(", ") },
            body: { error: `${req.method} is not supported here.` },
          });
          return;
        }
        const values = pathname.match(route.pattern)?.slice(1) ?? [];
        const params = Object.fromEntries(
          route.keys.map((key, i) => [key, decodeURIComponent(values[i] ?? "")]),
        );
        let body: Record<string, unknown> = {};
        let text = "";
        if (req.method === "POST" || req.method === "PUT") {
          const type = req.headers["content-type"] ?? "";
          const data = await readText(req);
          if (type.startsWith("text/")) text = data;
          else if (data && !type.startsWith("application/json"))
            throw new HttpError(415, "Expected JSON or text.");
          else body = parseJson(data);
        }
        const reply = await route.handle({ params, query: url.searchParams, body, text, req, res });
        if (reply !== handled) send(reply);
      })().catch((error: unknown) => {
        if (error instanceof HttpError) failure = `: ${error.message}`;
        else log.error(req.method, req.url, error);
        if (res.headersSent) return;
        send({
          status: error instanceof HttpError ? error.status : 400,
          body: { error: error instanceof Error ? error.message : String(error) },
        });
      });
    };
  }
}
