/**
 * Logging for the dev server, the web app, and the agent library, at the level `YAPPARATUS_LOG`
 * sets everywhere. In Node every line goes to stderr, since the agent's stdout carries the prompt.
 */

/** The `YAPPARATUS_LOG` values, from most to least output; `warn` is the default. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/** Writes a line at one level, or drops it when the level is below the configured one. */
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
const browser = "window" in globalThis;

/** A logger whose lines start with `[yapparatus:<scope>]`. */
export function createLogger(scope: string): Logger {
  const prefix = `[yapparatus:${scope}]`;
  const emit =
    (level: Exclude<LogLevel, "silent">) =>
    (...args: unknown[]) => {
      if (levels[level] < threshold) return;
      if (browser) console[level](prefix, ...args);
      else console.error(new Date().toISOString(), level.toUpperCase(), prefix, ...args);
    };
  return { debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error") };
}
