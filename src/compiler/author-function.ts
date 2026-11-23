/**
 * A function from a page, such as a diagram's `draw` or a chart's `plot`, evaluated in its own
 * context and called there with a time limit.
 */
import vm from "node:vm";

/** How long an author's function may run, in milliseconds. */
export const timeLimit = 1000;

/** The global that holds the call while it runs in the function's context. */
const callName = "__yapparatusCall";

/** An author's function: each call runs in its context and throws when it passes the time limit. */
export type AuthorFunction = (...args: unknown[]) => unknown;

/**
 * Evaluate a function expression in a context with JavaScript's globals and none of Node's, or
 * return undefined if its value is not a function. Throws what the evaluation throws.
 */
export function authorFunction(source: string, filename: string): AuthorFunction | undefined {
  const context = vm.createContext();
  const value: unknown = vm.runInContext(`"use strict";(${source})`, context, {
    filename,
    timeout: timeLimit,
  });
  if (typeof value !== "function") return undefined;
  return (...args) => {
    context[callName] = () => value(...args);
    try {
      return vm.runInContext(`${callName}()`, context, { timeout: timeLimit });
    } finally {
      delete context[callName];
    }
  };
}

/** The context that `withTimeLimit` runs the compiler's own functions in. */
let timer: vm.Context | undefined;

/**
 * Run the compiler's work that calls an author's code, such as Plot's accessors, in the time limit.
 * No `finally` runs when the time is up, so the caller restores any state the work changes.
 */
export function withTimeLimit<T>(run: () => T): T {
  timer ??= vm.createContext();
  timer[callName] = run;
  try {
    return vm.runInContext(`${callName}()`, timer, { timeout: timeLimit }) as T;
  } finally {
    delete timer[callName];
  }
}

/** Whether an error is the end of a call that passed the time limit. */
export function timedOut(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  );
}
