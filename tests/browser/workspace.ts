/** The browser tests' workspace, made by scripts/test-server.ts, and a way to act as its agent. */
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const root = path.join(realpathSync(os.tmpdir()), "yapparatus-browser");

/** The commands a prompt tells the agent to run, as `-e` code, in order. */
export function commands(prompt: string): string[] {
  return [...prompt.matchAll(/node --input-type=module-typescript -e '([^']*)'/g)].map(
    (match) => match[1] ?? "",
  );
}

/** The command in a prompt that replies and waits. */
export function replyCommand(prompt: string): string {
  return commands(prompt).find((code) => code.includes("await sendReply(")) ?? "";
}

/** Run a command in the workspace as an agent would, with `input` on stdin. */
export function runCommand(code: string, input = "") {
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
