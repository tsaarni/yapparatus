import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExternalFiles } from "../../src/compiler/external-files.ts";

const main = [
  "export function greet(name: string) {",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The line is TypeScript source text.
  "  const text = `Hello, ${name}`; // [!code highlight]",
  "  return text;",
  "}",
  "",
].join("\n");

/** A project with a document in content/ that shows the folder app/. */
export function withProject(run: (root: string, files: ExternalFiles) => void | Promise<void>) {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-files-"));
  const done = () => rmSync(root, { recursive: true, force: true });
  mkdirSync(path.join(root, "content"));
  mkdirSync(path.join(root, "app/src"), { recursive: true });
  mkdirSync(path.join(root, "app/.git"));
  writeFileSync(
    path.join(root, "content/document.json"),
    JSON.stringify({ pages: [], files: { app: "../app" } }),
  );
  writeFileSync(path.join(root, "app/src/main.ts"), main);
  writeFileSync(path.join(root, "app/.git/config"), "[core]\n");
  writeFileSync(path.join(root, "secret.txt"), "private\n");
  const result = run(root, new ExternalFiles(() => root, "content"));
  if (result instanceof Promise) return result.finally(done);
  done();
}
