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

/** Whether an error is the end of a call that passed the time limit. */
export function timedOut(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  );
}
