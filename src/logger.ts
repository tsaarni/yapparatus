/**
 * Diagnostic logging for the dev server, the browser reader, and the agent library.
 *
 * One setting, the `YAPPARATUS_LOG` environment variable, picks the level everywhere:
 * `debug`, `info`, `warn` (the default), `error`, or `silent`. Node reads it at startup; the
 * browser gets the dev server's or build's value through Vite's `define`.
 *
 * In Node every line goes to stderr: the agent library's stdout carries the prompt.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

const isLevel = (value: unknown): value is LogLevel =>
  typeof value === "string" && Object.hasOwn(levels, value);

/** The level from `YAPPARATUS_LOG`; `warn` when it is unset or not a level. */
export function logLevel(): LogLevel {
  const value =
    typeof __YAPPARATUS_LOG__ === "string"
      ? __YAPPARATUS_LOG__
      : (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
          .YAPPARATUS_LOG;
  return isLevel(value) ? value : "warn";
}

const threshold = levels[logLevel()];
const browser = typeof window !== "undefined";

/** A logger whose lines start with `[yapparatus:<scope>]`. */
export function createLogger(scope: string): Logger {
  const prefix = `[yapparatus:${scope}]`;
  const emit =
    (level: Exclude<LogLevel, "silent">) =>
    (...args: unknown[]) => {
      if (levels[level] < threshold) return;
      // The browser console filters by method; Node's console.debug and info would go to stdout.
      if (browser) console[level](prefix, ...args);
      else console.error(new Date().toISOString(), level.toUpperCase(), prefix, ...args);
    };
  return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error") };
}
