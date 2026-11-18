import { run } from "@mdx-js/mdx";
import { createElement, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { HighlightedCode } from "../../../../src/document/page-module.ts";

/** The page component, reduced to its code: these tests look at the compiled lines. */
const Excerpt = ({ children }: { children?: ReactNode }) => children ?? null;

/** The code blocks of a compiled page, as the web app receives them. */
export async function codeBlocks(js: string) {
  const blocks: HighlightedCode[] = [];
  const pre = ({ "data-code": code }: { "data-code": string }) => {
    blocks.push(JSON.parse(code));
    return null;
  };
  const { default: Content } = await run(js, { ...runtime, baseUrl: import.meta.url });
  renderToStaticMarkup(createElement(Content, { components: { Excerpt, pre } }));
  return blocks;
}

/** The text of a highlighted line. */
export const textOf = (line: Array<number | string> | undefined) =>
  (line ?? []).filter((run) => typeof run === "string").join("");
