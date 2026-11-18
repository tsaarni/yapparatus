/** The math stage: TeX between dollar marks becomes MathML, and invalid TeX is reported. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, run } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import remarkMath from "remark-math";
import { contentIssues, markdownConventions } from "../../../../src/compiler/stages/conventions.ts";
import { math } from "../../../../src/compiler/stages/math.ts";

/** Compile MDX with the math and conventions stages; returns the HTML and the issues found. */
async function build(source: string) {
  const file = `/virtual/${Math.random()}.mdx`;
  const js = String(
    await compile(
      { value: source, path: file },
      {
        outputFormat: "function-body",
        remarkPlugins: [[remarkMath, { singleDollarTextMath: false }]],
        rehypePlugins: [math, markdownConventions],
      },
    ),
  );
  const { default: Page } = await run(js, { ...runtime, baseUrl: import.meta.url });
  return { html: renderToStaticMarkup(Page({})), issues: contentIssues.get(file) ?? [] };
}

test("block and inline math become MathML, and braces stay TeX", async () => {
  const { html, issues } = await build(
    "The mean is $$\\bar{x}$$ here.\n\n$$\n\\frac{a}{b} + x^2\n$$\n",
  );
  assert.deepEqual(issues, []);
  assert.match(html, /<p>The mean is <math><mover><mi>x<\/mi>/);
  assert.match(html, /<math display="block"[^>]*><mrow><mfrac><mi>a<\/mi><mi>b<\/mi><\/mfrac>/);
  assert.doesNotMatch(html, /<code/);
});

test("a single dollar is text, so prices stay as written", async () => {
  const { html, issues } = await build("It costs $5 or $10.\n");
  assert.deepEqual(issues, []);
  assert.match(html, /It costs \$5 or \$10\./);
});

test("invalid TeX is MATH_INVALID at its line and shows as its source", async () => {
  const { html, issues } = await build("Text.\n\n$$\n\\frac{a\n$$\n\nAnd $$\\nosuch x$$.\n");
  assert.deepEqual(
    issues.map((i) => [i.code, i.line, i.subject]),
    [
      ["MATH_INVALID", 3, "\\frac{a"],
      ["MATH_INVALID", 7, "\\nosuch x"],
    ],
  );
  assert.match(issues[1]?.message ?? "", /Unsupported function name: \\nosuch/);
  assert.match(html, /<pre><code class="language-text">\\frac\{a<\/code><\/pre>/);
  assert.match(html, /<code class="language-text">\\nosuch x<\/code>/);
});
