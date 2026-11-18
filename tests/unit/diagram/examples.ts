/** The examples in the diagram reference: each `js` block is a draw program, each `mdx` block a `<Diagram>`. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const docs = path.join(import.meta.dirname, "../../../starter/docs");

/** The diagram reference's pages. */
export const examplePages = readdirSync(docs).filter((f) => /^diagram.*\.md$/.test(f));

/** A page's examples: the body of each draw program and the ids its steps focus. */
export function examples(page: string): Array<{ draw: string; focus: string[] }> {
  const text = readFileSync(path.join(docs, page), "utf8");
  return [...text.matchAll(/```(js|mdx)\n([\s\S]*?)```/g)].map(([, lang, code = ""]) => {
    if (lang === "js") return { draw: code, focus: [] };
    const draw = /draw=\{\(d\) => \{\n([\s\S]*?)\n\}\}/.exec(code)?.[1] ?? "";
    const focus = [...code.matchAll(/focus="([^"]*)"/g)].flatMap(([, f = ""]) => f.split(/\s+/));
    return { draw, focus };
  });
}
