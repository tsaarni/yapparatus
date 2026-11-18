/**
 * The page compiler compiles each `<Diagram>`: it runs `draw`, checks the figure with its
 * steps, embeds the drawing, and records the problems as the page's compile diagnostics.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "@mdx-js/mdx";
import { diagrams } from "../src/diagram-plugin.ts";
import { contentIssues } from "../src/markdown-plugin.ts";

let pages = 0;

/** Compile a page with the diagram step, and return its module and issues. */
async function compilePage(body: string) {
  const path = `/virtual/page-${++pages}.mdx`;
  const code = String(
    await compile({ value: `# Page\n\n${body}`, path }, { rehypePlugins: [diagrams] }),
  );
  return { code, issues: contentIssues.get(path) ?? [] };
}

test("the drawing replaces draw, and the page module has no draw program", async () => {
  const { code, issues } = await compilePage(`<Diagram id="pair" draw={(d) => {
  const a = d.box("Alpha")
  const b = d.box("Beta")
  d.row([a, b])
  d.arrow(a, b)
}}>
  <Step focus="alpha alpha->beta">The first step.</Step>
</Diagram>
`);
  assert.deepEqual(issues, []);
  assert.doesNotMatch(code, /d\.box/);
  assert.match(code, /drawing: \{/);
  assert.match(code, /"alpha->beta"/);
});

test("a name from outside draw is an error at its line", async () => {
  const { issues } = await compilePage(`export const label = "Alpha"

<Diagram id="outside" draw={(d) => {
  const a = d.box("Ok")
  d.box(label)
}} />
`);
  assert.deepEqual(issues, [
    {
      code: "DRAW_FAILED",
      message:
        "draw uses label, which it does not define. A draw program uses only its parameter and the values it defines itself: define label inside draw.",
      target: "outside",
      line: 7,
    },
  ]);
});

test("Node's globals are not defined in draw, and standard ones are", async () => {
  const { issues } = await compilePage(`<Diagram id="node" draw={(d) => {
  const rows = [1, 2].map((n) => d.box(JSON.stringify({ n }) + Math.max(n, 0)))
  d.row(rows, { gap: 40 })
  d.box(process.version)
}} />
`);
  assert.deepEqual(
    issues.map(({ code, message }) => ({ code, message })),
    [
      {
        code: "DRAW_FAILED",
        message:
          "draw uses process, which it does not define. A draw program uses only its parameter and the values it defines itself: define process inside draw.",
      },
    ],
  );
});

test("a figure without an id is reported at its first line", async () => {
  const { issues } = await compilePage(`<Diagram draw={(d) => {
  d.row([d.box("A", { id: "same" }), d.box("B", { id: "same" })])
}} />
`);
  assert.equal(issues.length, 1, JSON.stringify(issues));
  assert.equal(issues[0]?.code, "DUPLICATE_ID");
  assert.equal(issues[0]?.line, 3);
  assert.equal(issues[0]?.target, undefined);
});

test("steps are checked from the page, and a computed step attribute is an error", async () => {
  const { issues } = await compilePage(`<Diagram id="steps" draw={(d) => {
  d.box("Alpha")
}}>
  <Step focus="alpha nothing">Known and unknown.</Step>
  <Step focus={"alpha"}>Computed.</Step>
</Diagram>
`);
  assert.deepEqual(
    issues.map(({ code, subject, line, target }) => ({ code, subject, line, target })),
    [
      { code: "STEP_NOT_TEXT", subject: "step 2 focus", line: 7, target: "steps" },
      { code: "UNKNOWN_ELEMENT", subject: "nothing", line: undefined, target: "steps" },
    ],
  );
});

test("characters the web app's fonts lack are a warning", async () => {
  const { issues } = await compilePage(`<Diagram id="arrow" draw={(d) => {
  d.box("client → server")
}} />
`);
  assert.deepEqual(
    issues.map(({ code, subject, target }) => ({ code, subject, target })),
    [{ code: "FONT_FALLBACK", subject: "→", target: "arrow" }],
  );
  assert.match(issues[0]?.message ?? "", /"→".*system font/);
});

test("a diagram without draw is an error", async () => {
  const { issues } = await compilePage(`<Diagram id="empty" />\n`);
  assert.equal(issues[0]?.code, "DRAW_FAILED");
  assert.match(issues[0]?.message ?? "", /needs draw/);
});
