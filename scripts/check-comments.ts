/**
 * Checks that comments are short doc comments on files and declarations, never inside code.
 * Each file starts with one, and so does each top-level function, class, and exported type.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";

/** Text lines a comment may have, not counting lines that hold only its delimiters. */
const maxLines = 2;

/** Columns a comment line may use, the same as the formatter's line width. */
const maxWidth = 100;

/** The roots checked; document components under docs/ and starter/ follow the authoring guide. */
const roots = ["src", "scripts", "tests", "."];

/** Comments that configure a tool, allowed anywhere and in any form. */
const directive = /^(\s*(biome-ignore|@vite-ignore)\b|\/\s*<reference )/;

/** Nodes whose bodies hold code, where no comment is allowed. */
const functions = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
]);

/** Declarations a doc comment may describe, when they are not inside a function. */
const declarations = new Set([
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "ClassDeclaration",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "TSEnumMember",
  "TSModuleDeclaration",
  "VariableDeclaration",
  "ClassMethod",
  "ClassPrivateMethod",
  "ClassProperty",
  "ClassPrivateProperty",
  "TSDeclareMethod",
  "TSPropertySignature",
  "TSMethodSignature",
  "ObjectProperty",
  "ObjectMethod",
]);

/** Top-level declarations that must have a doc comment, exported or not. */
const alwaysDocumented = new Set(["FunctionDeclaration", "TSDeclareFunction", "ClassDeclaration"]);

/** Top-level declarations that must have a doc comment when they are exported. */
const documentedWhenExported = new Set([
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "VariableDeclaration",
]);

interface Node {
  type: string;
  start: number;
  [key: string]: unknown;
}

interface Comment {
  type: "CommentBlock" | "CommentLine";
  value: string;
  start: number;
  end: number;
}

/** The TypeScript files under a root, without fixtures, build output, or dependencies. */
function files(dir: string, recurse: boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory())
      return recurse && !["node_modules", "fixtures"].includes(entry.name) ? files(file, true) : [];
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

/** The start of each declaration outside functions, and the top-level ones that need a comment. */
function declarationsOf(program: Node) {
  const starts = new Set<number>();
  const required: Node[] = [];
  const visit = (node: Node, inFunction: boolean) => {
    if (!inFunction && declarations.has(node.type)) starts.add(node.start);
    if (!inFunction && node.type === "TSUnionType")
      for (const member of node.types as Node[]) starts.add(member.start);
    const inside = inFunction || functions.has(node.type);
    for (const [key, value] of Object.entries(node)) {
      if (key.endsWith("Comments")) continue;
      for (const child of Array.isArray(value) ? value : [value])
        if (child && typeof child === "object" && typeof child.type === "string")
          visit(child, inside);
    }
  };
  visit(program, false);
  for (const statement of program.body as Node[]) {
    const exported = statement.type.startsWith("Export");
    const declaration = exported ? (statement.declaration as Node | null) : statement;
    if (!declaration) continue;
    if (
      alwaysDocumented.has(declaration.type) ||
      (exported && documentedWhenExported.has(declaration.type))
    )
      required.push(statement);
  }
  return { starts, required };
}

/** The problems with a comment's form and length. */
function formProblems(comment: Comment, text: string): string[] {
  if (comment.type === "CommentLine" || !comment.value.startsWith("*"))
    return ["write comments as /** */ doc comments"];
  const raw = text.slice(comment.start, comment.end).split("\n");
  const problems: string[] = [];
  const lines = raw.filter((line) => !/^\s*(\/\*\*|\*\/)\s*$/.test(line));
  if (lines.length > maxLines)
    problems.push(`a comment has at most ${maxLines} lines; this has ${lines.length}`);
  const column = text.lastIndexOf("\n", comment.start) + 1;
  const widest = Math.max(
    ...raw.map((line, i) => line.length + (i === 0 ? comment.start - column : 0)),
  );
  if (widest > maxWidth) problems.push(`a comment line has at most ${maxWidth} columns`);
  return problems;
}

/** The problems in one file. */
function check(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const ast = parse(text, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const program = ast.program as unknown as Node;
  const { starts, required } = declarationsOf(program);
  const lineOf = (offset: number) => text.slice(0, offset).split("\n").length;
  const problems: string[] = [];
  const report = (offset: number, message: string) =>
    problems.push(`${file}:${lineOf(offset)}: ${message}.`);
  const described = new Set<number>();
  let fileComment = false;

  for (const comment of (ast.comments ?? []) as Comment[]) {
    if (directive.test(comment.value)) continue;
    let next = comment.end;
    while (next < text.length && /\s/.test(text[next] ?? "")) next++;
    const gap = text.slice(comment.end, next);
    const blankLine = /\n[ \t]*\n/.test(gap);
    if (text[next] === "|") next++;
    while (next < text.length && /\s/.test(text[next] ?? "")) next++;
    const ownLine = /^[ \t]*$/.test(
      text.slice(text.lastIndexOf("\n", comment.start - 1) + 1, comment.start),
    );
    const isFirst = text.slice(0, comment.start).replace(/^#!.*/, "").trim() === "";
    const forms = formProblems(comment, text);

    if (isFirst && (blankLine || !starts.has(next))) {
      fileComment = true;
      for (const message of forms) report(comment.start, message);
    } else if (ownLine && starts.has(next) && !blankLine && !described.has(next)) {
      described.add(next);
      for (const message of forms) report(comment.start, message);
    } else {
      report(
        comment.start,
        "comments go only at the top of the file and directly above a declaration outside a function; " +
          "name the code so it needs no comment, or describe it in the declaration's doc comment",
      );
    }
  }

  if (!fileComment)
    report(
      0,
      "start the file with a doc comment on what it holds, and a blank line before any code it does not describe",
    );
  for (const node of required)
    if (!described.has(node.start))
      report(node.start, "describe this declaration in a doc comment above it");
  return problems;
}

const problems = roots.flatMap((root) => files(root, root !== ".")).flatMap(check);
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`${problems.length} comment problems.`);
  process.exitCode = 1;
}
