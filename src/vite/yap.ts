#!/usr/bin/env node
/** The `yap` command: serve, build, or preview a document with Vite. */
import { parseArgs } from "node:util";
import { build, createServer, type InlineConfig, preview } from "vite";
import { yapparatus } from "./plugin.ts";

const usage = `Usage:
  yap dev <directory> [--port <port>] [--open] [--force]
  yap build <directory> [--single | --base <path>]
  yap preview <directory> [--port <port>] [--open]

<directory> is the document's directory, which holds its document.json.

Options:
  --port <port>  Serve on this port.
  --open         Open the document in the browser.
  --force        Rebuild Vite's dependency cache.
  --single       Build the document as one offline HTML file.
  --base <path>  Serve the site from this path, such as /project/docs/. Default: /.`;

/** Print the message and the usage, and exit with an error. */
function fail(message: string): never {
  process.stderr.write(`${message}\n\n${usage}\n`);
  process.exit(1);
}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        port: { type: "string" },
        open: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        single: { type: "boolean", default: false },
        base: { type: "string" },
      },
    });
  } catch (error) {
    fail((error as Error).message);
  }
})();
const [command, document, ...extra] = positionals;
if (!command) fail("Give a command.");
if (!["dev", "build", "preview"].includes(command)) fail(`Unknown command: ${command}.`);
if (!document) fail("Give the document's directory.");
if (extra.length) fail(`Unexpected arguments: ${extra.join(" ")}.`);
const port = values.port === undefined ? undefined : Number(values.port);
if (port !== undefined && !Number.isInteger(port)) fail(`Invalid port: ${values.port}.`);
/** Each option and the commands that take it. */
const accepted: Record<string, string[]> = {
  port: ["dev", "preview"],
  open: ["dev", "preview"],
  force: ["dev"],
  single: ["build"],
  base: ["build"],
};
if (values.single && values.base !== undefined)
  fail("--base is not an option of a single-file build.");
if (values.base !== undefined && !/^\/(.*\/)?$/.test(values.base))
  fail(`Invalid base: ${values.base}. It starts and ends with /.`);
for (const [option, value] of Object.entries(values)) {
  const commands = accepted[option] ?? [];
  if (value !== undefined && value !== false && !commands.includes(command))
    fail(`--${option} is an option of ${commands.join(" and ")}.`);
}

/** The configuration every command shares: the plugin for one document, from the project folder. */
const config: InlineConfig = {
  root: process.cwd(),
  plugins: yapparatus({ document, singleFile: values.single }),
  ...(values.base === undefined ? {} : { base: values.base }),
};
/**
 * Listen only on this machine: the chat server trusts local processes.
 * See the Security section of docs/design/server.mdx.
 */
const listen = { host: "127.0.0.1", open: values.open, ...(port === undefined ? {} : { port }) };
try {
  if (command === "dev") {
    const server = await createServer({
      ...config,
      server: listen,
      optimizeDeps: { force: values.force },
    });
    await server.listen();
    server.printUrls();
    server.bindCLIShortcuts({ print: true });
  } else if (command === "build") {
    await build(config);
  } else {
    const server = await preview({ ...config, preview: listen });
    server.printUrls();
    server.bindCLIShortcuts({ print: true });
  }
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
