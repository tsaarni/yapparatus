/** Checks of `document.json`: its page list and its theme setting. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPages, checkTheme } from "../../../src/compiler/document-checks.ts";

test("page files are listed once in document.json and named as their addresses", () => {
  assert.deepEqual(checkPages(["intro", "guide/setup"], ["intro.mdx", "guide/setup.mdx"]), []);
  assert.deepEqual(checkPages(["intro"], undefined), [
    'document.json must list the page files in reading order: { "pages": ["overview.mdx", …] }.',
  ]);
  assert.deepEqual(checkPages(["intro"], ["intro"]), [
    '"pages" in document.json lists "intro"; name the file: "intro.mdx".',
    '"intro.mdx" is missing from "pages" in document.json.',
  ]);
  assert.deepEqual(
    checkPages(["intro", "02-Setup", "api"], ["intro.mdx", "intro.mdx", "gone.mdx"]),
    [
      '"02-Setup.mdx" is not a page name: use lowercase letters, digits, and hyphens.',
      '"02-Setup.mdx" is missing from "pages" in document.json.',
      '"api.mdx" is missing from "pages" in document.json.',
      '"intro.mdx" is listed twice in "pages" in document.json.',
      '"pages" in document.json lists "gone.mdx", which does not exist.',
    ],
  );
});

test("checkTheme accepts the three settings and no setting, and explains anything else", () => {
  for (const theme of [undefined, "dark", "light", "auto"]) assert.deepEqual(checkTheme(theme), []);
  assert.deepEqual(checkTheme("system"), [
    '"theme" in document.json is "system"; use "dark", "light", or "auto".',
  ]);
});
