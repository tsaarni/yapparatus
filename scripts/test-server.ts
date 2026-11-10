import { cpSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";

// A fixed path, so tests can run agent snippets in it; see tests/browser/workspace.ts.
const root = path.join(realpathSync(os.tmpdir()), "yapparatus-browser");
rmSync(root, { recursive: true, force: true });
mkdirSync(root);
// package.json lets snippets import "yapparatus/agent" by the package's own name.
for (const entry of ["src", "lib", "icons", "package.json"])
  cpSync(entry, path.join(root, entry), { recursive: true });
cpSync("tests/fixtures/content", path.join(root, "content"), { recursive: true });
cpSync("tests/fixtures/source", path.join(root, "source"), { recursive: true });
symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
// The workspace's copy, so the reader it serves is inside the workspace, as in a project.
const { yapparatus } = (await import(
  path.join(root, "src", "vite.ts")
)) as typeof import("../src/vite.ts");
const server = await createServer({
  root,
  configFile: false,
  // Own dependency cache: sharing node_modules/.vite with a running dev server can stall both.
  cacheDir: path.join(root, ".vite"),
  plugins: yapparatus({ document: "content" }),
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: [root, path.resolve("node_modules")] },
  },
});
await server.listen();
const close = async () => {
  await server.close();
  rmSync(root, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGTERM", () => {
  void close();
});
process.on("SIGINT", () => {
  void close();
});
