/**
 * Client for the dev server API: the chat, diagnostic reports, and source files, with changes
 * on Vite's hot-update connection. Outside live mode it does nothing, so built pages never call it.
 */

import { useSyncExternalStore } from "react";
import { createLogger } from "../../protocol/log.ts";
import {
  apiPrefix,
  type Chat,
  type DiagnosticReport,
  type NewMessage,
  type ReportedDiagnostic,
  type SourceFileView,
  type UpdateEvents,
} from "../../protocol/rest-api.ts";

const log = createLogger("api");
const live = import.meta.env.DEV;
const prefix = `${import.meta.env.BASE_URL.replace(/\/$/, "")}${apiPrefix}`;

/** Send a request to the dev server API, and throw its error message when it fails. */
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

const id = (value: string) => encodeURIComponent(value);

/** What the reader does to the chat: send a message, and clear the chat. */
export const commands = {
  send: (input: Omit<Extract<NewMessage, { author: "reader" }>, "author">) =>
    call<{ seq: number }>("POST", "/chat", { author: "reader", ...input }),
  clear: () => call<void>("DELETE", "/chat"),
};

const sent = new Set<string>();
const queued = new Map<string, DiagnosticReport>();
let flushTimer: number | undefined;

/**
 * Report what this browser found in one revision of a page, or in a reply. A report already
 * sent is not sent again, and reports within a short window are sent together.
 */
export function reportDiagnostics(report: DiagnosticReport) {
  if (!live) return;
  const key = JSON.stringify(report);
  if (sent.has(key)) return;
  queued.set(key, report);
  if (flushTimer === undefined) flushTimer = window.setTimeout(flushReports, 150);
}

/** Send the queued reports, and forget one that fails so it can be sent again. */
function flushReports() {
  flushTimer = undefined;
  for (const [key, report] of queued) {
    sent.add(key);
    void call("POST", "/diagnostics", report).catch(() => sent.delete(key));
  }
  queued.clear();
}

/** What the dev server keeps the browser current on: the chat and the diagnostics. */
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

/** Merge a change into the live state and tell every listener. */
function update(next: Partial<LiveState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

const fileListeners = new Set<(address: string) => void>();

/** Handle one kind of update event from the server's hot-update connection. */
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

/** Connect on first use, and call `listener` on every change, for `useSyncExternalStore`. */
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
