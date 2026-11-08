/**
 * Client for the dev server API: commands, diagnostic reports, and the event stream.
 * Every function here is a no-op outside live mode, so built pages never touch /-/api.
 */
import { useSyncExternalStore } from "react";
import { createLogger } from "../logger.ts";
import {
  apiPrefix,
  type ChatState,
  type Diagnostic,
  type NewReaderMessage,
  type ReportedDiagnostic,
  type ServerEvent,
  type SourceFileView,
} from "../protocol.ts";

const log = createLogger("api");
const live = import.meta.env.DEV;
const prefix = `${import.meta.env.BASE_URL.replace(/\/$/, "")}${apiPrefix}`;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  log.debug(method, path);
  let response: Response;
  try {
    response = await fetch(`${prefix}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    // No response at all: the dev server is stopped or restarting.
    log.warn(method, path, "no answer from the dev server");
    throw new Error("The dev server did not answer. It may be restarting; try again.");
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("Content-Type") ?? "";
  const data: unknown = type.startsWith("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    log.warn(method, path, response.status, data);
    throw new Error(
      (data as { error?: string })?.error ?? `${response.status} ${response.statusText}`,
    );
  }
  return data as T;
}

/* ---------- Commands ---------- */

const id = (value: string) => encodeURIComponent(value);
export const commands = {
  send: (input: NewReaderMessage) => call<{ seq: number }>("POST", "/chat/reader", input),
  clear: () => call<{ seq: number }>("POST", "/chat/clear"),
};

/* ---------- Diagnostic reports ---------- */

const sent = new Map<string, string>();
const queued = new Map<string, { diagnostics: Diagnostic[]; revision?: string }>();
let flushTimer: number | undefined;

/**
 * Report the complete current set of diagnostics for one scope. Repeated identical reports
 * are dropped, and reports within a short window are sent together.
 */
export function reportDiagnostics(scope: string, diagnostics: Diagnostic[], revision?: string) {
  if (!live) return;
  const report = { diagnostics, ...(revision ? { revision } : {}) };
  if (sent.get(scope) === JSON.stringify(report) && !queued.has(scope)) return;
  queued.set(scope, report);
  if (flushTimer === undefined) flushTimer = window.setTimeout(flushReports, 150);
}

function flushReports() {
  flushTimer = undefined;
  for (const [scope, report] of queued) {
    sent.set(scope, JSON.stringify(report));
    void call("PUT", `/diagnostics/${id(scope)}`, report).catch(() => sent.delete(scope));
  }
  queued.clear();
}

/** Remove a scope as the tab closes, such as its runtime errors. */
export function dropDiagnosticsOnClose(scope: string) {
  if (!live) return;
  window.addEventListener("pagehide", () => {
    void fetch(`${prefix}/diagnostics/${id(scope)}`, { method: "DELETE", keepalive: true });
  });
}

/* ---------- Live state from the event stream ---------- */

export interface LiveState {
  chat: ChatState;
  diagnostics: ReportedDiagnostic[];
  connected: boolean;
}

let state: LiveState = {
  chat: { messages: [], repliedTo: 0, agent: "away", start: "" },
  diagnostics: [],
  connected: false,
};
const listeners = new Set<() => void>();
let source: EventSource | undefined;

function update(next: Partial<LiveState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

const fileListeners = new Set<(address: string) => void>();

function apply(event: ServerEvent) {
  log.debug(`${event.type} event`, event);
  if (event.type === "chat") update({ chat: event.chat });
  else if (event.type === "diagnostics") update({ diagnostics: event.diagnostics });
  else for (const listener of fileListeners) listener(event.address);
}

function connect() {
  if (!live || source) return;
  source = new EventSource(`${prefix}/events`);
  for (const type of ["chat", "diagnostics", "file"] as const)
    source.addEventListener(type, (message) =>
      apply(JSON.parse((message as MessageEvent<string>).data) as ServerEvent),
    );
  source.onopen = () => {
    log.info("event stream connected");
    update({ connected: true });
  };
  source.onerror = () => {
    if (state.connected) log.info("event stream lost; reconnecting");
    update({ connected: false });
  };
}

function subscribe(listener: () => void) {
  connect();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The chat and diagnostics, kept current by the server's event stream. */
export function useLive(): LiveState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Call `listener` with a source file's address when it changes on disk; returns an unsubscribe. */
export function onFileChanged(listener: (address: string) => void): () => void {
  if (!live) return () => undefined;
  connect();
  fileListeners.add(listener);
  return () => fileListeners.delete(listener);
}

/** A source file the server shows, highlighted. Live mode only. */
export function readFile(folder: string, path: string): Promise<SourceFileView> {
  return call<SourceFileView>("GET", `/files/${id(folder)}/${path.split("/").map(id).join("/")}`);
}
