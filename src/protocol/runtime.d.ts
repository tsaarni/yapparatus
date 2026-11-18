/**
 * What `log.ts` reads from the runtime it runs in. The pure directories have neither the DOM
 * library nor Node's types, so this declares only what both runtimes provide, in the shape both
 * agree on.
 */

/** The console methods the logger calls; the DOM library and Node's types declare the same. */
interface Console {
  debug(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
}
declare var console: Console;

/** The `YAPPARATUS_LOG` level the browser bundle was served or built with; undeclared in Node. */
declare const __YAPPARATUS_LOG__: string | undefined;
