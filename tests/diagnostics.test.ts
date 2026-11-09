import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { diagnosticCodes, isDiagnosticCode } from "../src/protocol.ts";

const repo = path.join(import.meta.dirname, "..");

function files(dir: string, extensions: string[]): string[] {
  return (readdirSync(path.join(repo, dir), { recursive: true }) as string[])
    .filter((file) => extensions.some((ext) => file.endsWith(ext)))
    .map((file) => path.join(dir, file));
}

/** Capitalized words that are not diagnostic codes. */
const notCodes = new Set([
  "DELETE",
  "ECONNREFUSED",
  "HTML",
  "HTTP",
  "JSON",
  "POST",
  "YAML",
  "YAPPARATUS_CONTENT",
  "YAPPARATUS_LOG",
]);

/** Every capitalized word of four letters or more, outside `notCodes`, with where it is. */
function codesIn(sources: string[], pattern: RegExp): Array<{ code: string; at: string }> {
  return sources.flatMap((file) =>
    readFileSync(path.join(repo, file), "utf8")
      .split("\n")
      .flatMap((line, i) =>
        [...line.matchAll(pattern)]
          .map((match) => match[1] ?? "")
          .filter((code) => !notCodes.has(code))
          .map((code) => ({ code, at: `${file}:${i + 1}` })),
      ),
  );
}

test("every code the source writes is in the registry", () => {
  const found = codesIn(files("src", [".ts", ".tsx"]), /"([A-Z][A-Z0-9_]{3,})"/g);
  assert.ok(found.length > 40, "the scan finds the codes");
  assert.deepEqual(
    found.filter(({ code }) => !isDiagnosticCode(code)),
    [],
  );
});

test("every code the documents name exists", () => {
  const docs = [
    ...files("docs/design", [".mdx", ".md"]),
    ...files("starter/docs", [".md"]),
    "README.md",
  ];
  const found = codesIn(docs, /`([A-Z][A-Z0-9_]{3,})`/g);
  assert.deepEqual(
    found.filter(({ code }) => !isDiagnosticCode(code)),
    [],
  );
});

test("every code has a severity and says what it means", () => {
  for (const [code, { severity, meaning }] of Object.entries(diagnosticCodes)) {
    assert.match(code, /^[A-Z]+(_[A-Z]+)*$/, code);
    assert.ok(!code.endsWith("_ERROR"), `${code}: severity says it is an error`);
    assert.ok(severity === "error" || severity === "warning", code);
    assert.match(meaning, /^[^\n]+\.$/, `${code}: one sentence`);
  }
});
