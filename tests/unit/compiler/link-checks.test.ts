/** Link checks: page addresses, file names, anchors, and links to source files and lines. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLinks } from "../../../src/compiler/link-checks.ts";
import { resolveLink } from "../../../src/document/address.ts";
import type { PageOutline } from "../../../src/document/page-module.ts";
import { withProject } from "../project.ts";

test("links to files and lines are checked against the file", () =>
  withProject((_root, files) => {
    const outline: PageOutline = {
      revision: "",
      title: "Intro",
      headings: [],
      numbered: [],
      anchors: [],
      refs: [],
      links: [
        { href: "/-/files/app/src/main.ts#L2-L3", line: 3 },
        { href: "/-/files/app/src/main.ts#L4-L9", line: 4 },
        { href: "/-/files/app/src/gone.ts", line: 5 },
        { href: "/-/files/app", line: 6 },
      ],
    };
    const problems = checkLinks([{ id: "intro", outline }], files.lineCount);
    assert.deepEqual(
      problems.map((p) => `${p.code}:${p.line}`),
      ["BROKEN_LINK:4", "BROKEN_LINK:5", "BROKEN_LINK:6"],
    );
    assert.match(problems[0]?.message ?? "", /lines 4–9, but the file has 4 lines/);
    assert.match(problems[2]?.message ?? "", /not a file address/);
  }));

const outline = (overrides: Partial<PageOutline>): PageOutline => ({
  revision: "r",
  title: "Page",
  headings: [],
  numbered: [],
  anchors: [],
  links: [],
  refs: [],
  ...overrides,
});

test("links resolve by address, file name, and anchor; broken ones are reported", () => {
  const ids = ["intro", "setup"];
  assert.deepEqual(resolveLink("setup#install", "intro", ids), {
    page: "setup",
    fragment: "install",
  });
  assert.deepEqual(resolveLink("./setup.mdx", "intro", ids), {
    page: "setup",
    fragment: "",
  });
  assert.equal(resolveLink("https://example.org", "intro", ids), "external");
  assert.equal(resolveLink("nowhere", "intro", ids), undefined);

  const problems = checkLinks(
    [
      {
        id: "intro",
        outline: outline({
          anchors: ["overview", "flow"],
          numbered: [{ kind: "figure", id: "flow", caption: "Flow." }],
          links: [
            { href: "setup#install", line: 3 },
            { href: "setup#missing", line: 4 },
            { href: "nowhere", line: 5 },
            { href: "#flow--api", line: 6 },
            { href: "/setup#routes:~:text=api", line: 15 },
            { href: "/setup#gone:~:text=api", line: 16 },
          ],
          refs: [
            { to: "flow", line: 7 },
            { to: "routes", line: 8 },
            { to: "/setup#install", line: 9 },
            { to: "/setup", line: 10 },
            { to: "/setup#routes--api", line: 11 },
            { to: "/nowhere", line: 12 },
            { to: "/setup#missing", line: 13 },
            { to: "setup#install", line: 14 },
          ],
        }),
      },
      {
        id: "setup",
        outline: outline({
          anchors: ["install", "routes"],
          numbered: [{ kind: "table", id: "routes", caption: "Routes." }],
        }),
      },
    ],
    () => ({ error: "no files" }),
  );
  assert.deepEqual(
    problems.map((p) => `${p.code}:${p.line}`),
    [
      "BROKEN_LINK:4",
      "BROKEN_LINK:5",
      "BROKEN_LINK:16",
      "BROKEN_REF:12",
      "BROKEN_REF:13",
      "BROKEN_REF:14",
    ],
  );
});
