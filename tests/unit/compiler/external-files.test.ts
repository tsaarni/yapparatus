/** Reading source files: only files inside a named external directory. */

import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { withProject } from "../project.ts";

test("only files inside a named external directory are read", () =>
  withProject((root, files) => {
    const read = files.read({ folder: "app", path: "src/main.ts" });
    assert.ok(!("error" in read));
    assert.equal(read.source, "app/src/main.ts");
    assert.equal(read.lines.length, 4);
    symlinkSync(path.join(root, "secret.txt"), path.join(root, "app/escape.txt"));
    const refused = (file: string, folder = "app") => {
      const result = files.read({ folder, path: file });
      return "error" in result ? result.error : "read";
    };
    assert.match(refused("escape.txt"), /outside the external directory/);
    assert.match(refused(".git/config"), /\.git/);
    assert.match(refused("missing.ts"), /no file/);
    assert.match(refused("src"), /not a file/);
    assert.match(refused("x.ts", "other"), /no external directory "other"/);
  }));
