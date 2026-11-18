import assert from "node:assert/strict";
import { test } from "node:test";
import { languageOf } from "../../../src/compiler/stages/highlight.ts";
import { quoteOf, resolveLink } from "../../../src/document/address.ts";
import {
  checkFiles,
  fileAddress,
  fileSource,
  parseFileAddress,
  parseLines,
} from "../../../src/document/file-address.ts";

test("file addresses name a folder, a path inside it, and maybe lines", () => {
  assert.deepEqual(parseFileAddress("/-/files/app/src/main.ts#L2-L3"), {
    folder: "app",
    path: "src/main.ts",
    lines: { start: 2, end: 3 },
  });
  assert.deepEqual(parseFileAddress("/-/files/app/src/main.ts#L2"), {
    folder: "app",
    path: "src/main.ts",
    lines: { start: 2, end: 2 },
  });
  assert.deepEqual(parseFileAddress("/-/files/app/README.md"), {
    folder: "app",
    path: "README.md",
  });
  for (const wrong of [
    "/-/files/app",
    "/-/files/app/../secret.txt",
    "/-/files/App/x.ts",
    "/-/files/app/x.ts#L3-L2",
    "/-/files/app/x.ts#intro",
    "/files/app/x.ts",
  ])
    assert.equal(parseFileAddress(wrong), undefined, wrong);
  assert.deepEqual(parseFileAddress("/-/files/app/x.ts#L2:~:text=retry"), {
    folder: "app",
    path: "x.ts",
    lines: { start: 2, end: 2 },
  });
  assert.equal(quoteOf("/-/files/app/x.ts#L2:~:text=retry"), "retry");
  assert.equal(parseLines("L0"), undefined);
  assert.equal(
    fileAddress({ folder: "app", path: "x.ts", lines: { start: 4, end: 4 } }),
    "/-/files/app/x.ts#L4",
  );
  assert.deepEqual(resolveLink("/-/files/app/x.ts#L4", "intro", ["intro"]), {
    file: { folder: "app", path: "x.ts", lines: { start: 4, end: 4 } },
  });
  assert.equal(resolveLink("/-/elsewhere", "intro", ["intro"]), undefined);
});

test("a file's place is relative to the project folder, even outside it", () => {
  const file = { folder: "app", path: "src/x.go" };
  assert.equal(fileSource("guide", { app: "../../app" }, file), "../app/src/x.go");
  assert.equal(fileSource("docs/design", { app: "../.." }, file), "src/x.go");
  assert.equal(fileSource("docs", { other: ".." }, file), undefined);
  assert.deepEqual(checkFiles({ app: "../app" }), []);
  assert.deepEqual(checkFiles(["../app"]), [
    '"files" in document.json names external directories by name: { "files": { "app": "../app" } }.',
  ]);
  assert.deepEqual(checkFiles({ App: "", ok: "." }), [
    '"files" in document.json names "App": use lowercase letters, digits, and hyphens.',
    '"files" in document.json gives "App" no directory path.',
  ]);
  assert.equal(languageOf("src/main.go"), "go");
  assert.equal(languageOf("Dockerfile"), "docker");
  assert.equal(languageOf("source/common/common/regex.cc"), "cpp");
  assert.equal(languageOf("include/regex.h"), "cpp");
  assert.equal(languageOf("api/route.proto"), "proto");
  assert.equal(languageOf("source/common/BUILD"), "python");
  assert.equal(languageOf("makefile"), "make");
  assert.equal(languageOf("ci/Dockerfile.dev"), "docker");
  assert.equal(languageOf("rtl/core.v"), "verilog");
  assert.equal(languageOf("a.constructor"), "text");
  assert.equal(languageOf("notes.unknown"), "text");
});
