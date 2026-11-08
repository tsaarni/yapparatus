/** The browser tests' workspace, made by scripts/test-server.ts, and a way to act as its agent. */
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const root = path.join(realpathSync(os.tmpdir()), "yapparatus-browser");

/** The snippets a prompt tells the agent to run, as `-e` code, in order. */
export function snippets(prompt: string): string[] {
  return [...prompt.matchAll(/node --input-type=module-typescript -e '([^']*)'/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Run a snippet in the workspace as an agent would, with `input` on stdin. */
export function runSnippet(code: string, input = "") {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = execFile(
      process.execPath,
      ["--input-type=module-typescript", "-e", code],
      { cwd: root },
      (error, stdout, stderr) =>
        resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr }),
    );
    child.stdin?.end(input);
  });
}
