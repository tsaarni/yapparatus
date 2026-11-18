/**
 * Client for the dev server API: the chat, diagnostic reports, and source files. Changes
 * arrive on Vite's hot-update connection. Every function here is a no-op outside live mode,
 * so built pages never touch /-/api.
 */
import { useSyncExternalStore } from "react";
import { createLogger } from "../protocol/log.ts";
import {
  apiPrefix,
  type Chat,
  type DiagnosticReport,
  type NewMessage,
  type ReportedDiagnostic,
  type SourceFileView,
  type UpdateEvents,
} from "../protocol/rest-api.ts";

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

/* ---------- The chat ---------- */

const id = (value: string) => encodeURIComponent(value);
export const commands = {
  send: (input: Omit<Extract<NewMessage, { author: "reader" }>, "author">) =>
    call<{ seq: number }>("POST", "/chat", { author: "reader", ...input }),
  clear: () => call<void>("DELETE", "/chat"),
};

/* ---------- Diagnostic reports ---------- */

const sent = new Set<string>();
const queued = new Map<string, DiagnosticReport>();
let flushTimer: number | undefined;

/**
 * Report what this browser found in one revision of a page, or in a reply. Findings only add,
 * so a report the server already has is not sent again, and reports within a short window
 * are sent together.
 */
export function reportDiagnostics(report: DiagnosticReport) {
  if (!live) return;
  const key = JSON.stringify(report);
  if (sent.has(key)) return;
  queued.set(key, report);
  if (flushTimer === undefined) flushTimer = window.setTimeout(flushReports, 150);
}

function flushReports() {
  flushTimer = undefined;
  for (const [key, report] of queued) {
    sent.add(key);
    void call("POST", "/diagnostics", report).catch(() => sent.delete(key));
  }
  queued.clear();
}

/* ---------- Live state ---------- */

export interface LiveState {
  chat: Chat;
  diagnostics: ReportedDiagnostic[];
}

let state: LiveState = {
  chat: { messages: [], repliedTo: 0, agent: "away", prompt: "" },
  diagnostics: [],
};
const listeners = new Set<() => void>();
let connected = false;

function update(next: Partial<LiveState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

const fileListeners = new Set<(address: string) => void>();

function on<E extends keyof UpdateEvents>(event: E, handle: (data: UpdateEvents[E]) => void) {
  import.meta.hot?.on(event, (data: UpdateEvents[E]) => {
    log.debug(event, data);
    handle(data);
  });
}

/** Listen for changes, then read the chat and diagnostics once; changes keep them current. */
function connect() {
  if (!live || connected) return;
  connected = true;
  // An update that arrives before the first read answers is newer than the read.
  const updated = new Set<keyof LiveState>();
  on("yapparatus:chat", (chat) => {
    updated.add("chat");
    update({ chat });
  });
  on("yapparatus:diagnostics", (diagnostics) => {
    updated.add("diagnostics");
    update({ diagnostics });
  });
  on("yapparatus:file", (address) => {
    for (const listener of fileListeners) listener(address);
  });
  void call<Chat>("GET", "/chat?include=diagnostics")
    .then(({ diagnostics = [], ...chat }) =>
      update({
        ...(updated.has("chat") ? {} : { chat }),
        ...(updated.has("diagnostics") ? {} : { diagnostics }),
      }),
    )
    .catch((error: unknown) => log.warn("could not read the chat:", error));
}

function subscribe(listener: () => void) {
  connect();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The chat and diagnostics, kept current by the server's updates. */
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
export function readFile(directory: string, path: string): Promise<SourceFileView> {
  return call<SourceFileView>(
    "GET",
    `/files/${id(directory)}/${path.split("/").map(id).join("/")}`,
  );
}
