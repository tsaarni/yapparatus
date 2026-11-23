# Writing Yapparatus documents

A Yapparatus document is a directory of MDX pages that a reader reads in the browser and comments on in a chat with you. You write content; the components handle layout, numbering, and drawing.

Contents: Start a document · Reference files · Pages · Writing · Code and layout · Figures · Numbering and references · Links and ids · External files · Tables, listings, excerpts, and refs · Replies · Checking your work

## Start a document

A document lives in a project made from the starter, which carries this guide in `docs/`. A project can hold several documents, each in its own document directory with a `document.json`. One document directory cannot be inside another. The user asks you for a document; Yapparatus is not running yet.

1. Write `document.json` and the pages in the document directory: `content/` for the first document, or a new directory such as `tutorial/` when `content/` already holds one. Name the documented repository under `"files"`.
2. End your turn: tell the user to run `pnpm dev <directory>`, such as `pnpm dev content`, in the project directory, open the address it prints, and paste the prompt the document's chat shows back to you.
3. The prompt connects you to the chat. Follow it: fix the diagnostics it lists, as Checking your work says, then reply to the reader's messages there.

A minimal document for a repository `myapp` next to the project `my-document`:

```json
{
  "title": "MyApp internals",
  "pages": ["overview.mdx"],
  "theme": "auto",
  "files": { "myapp": "../../myapp" }
}
```

```mdx
# Overview

MyApp serves orders over HTTP. The entry point is [main.ts](/-/files/myapp/src/main.ts).
```

A full document to learn from: `node_modules/yapparatus/docs/design/`, the design of Yapparatus.

## Reference files

The components, diagrams, and charts are specific to Yapparatus and not in your training data. Read the file for each feature before you write it.

| When the document has | Read |
|---|---|
| A diagram of any kind, or its steps | `docs/diagrams.md` |
| Database tables, types, protocol headers, registers, arrays, or marked text | `docs/diagrams.md`, then `docs/diagram-structures.md` |
| Messages between participants over time | `docs/diagrams.md`, then `docs/diagram-sequences.md` |
| A hierarchy: an org chart, a class tree, a mind map, a decision tree | `docs/diagrams.md`, then `docs/diagram-trees.md` |
| Data files, or numbers to compare, trend, or spread | `docs/charts.md` |
| Alerts, code marks, math, tabs, columns, a file tree, a framed figure, an icon, or a custom component | `docs/components.md` |

## Pages

- A page's file name is its address: `key-ideas.mdx` → `/key-ideas`. Use lowercase letters, digits, and hyphens. A page in a subdirectory is listed as `"guide/setup.mdx"`.
- Name a page for what it covers, so a first-time reader understands the contents entry: `architecture` and "Architecture", rather than `pieces` and "Pieces". Keep the file name and the title close.
- `document.json` lists every page file once, in reading order: `"pages": ["overview.mdx", "guide/setup.mdx"]`. The address drops the extension: `/guide/setup`. A page missing from the list, or listed without a file, is an error. Required: `"pages"`. Optional:

| Field | Value | Default |
|---|---|---|
| `title` | Header and tab title | Directory name |
| `subtitle` | Small line above the title, such as the project or team | None |
| `logo` | Icon beside the title, as an icon name: `"assets:myapp"` for `assets/myapp.svg` | None |
| `favicon` | Icon in the browser tab, as an icon name; a monochrome icon takes the accent color | Browser default |
| `contentsLabel` | Heading over the page list | `"Contents"` |
| `numbering` | `false`, or `{ "sections": false }`; kinds: `sections`, `figures`, `tables`, `listings` | All on |
| `theme` | `"dark"`, `"light"`, or `"auto"` (follows the system; the reader can switch) | `"dark"` |
| `files` | External directories by name, relative to `document.json`; see External files | None |

- A page has exactly one `#` heading, at the top. Its text is the page title in navigation. Sections use `##` and `###` only; deeper headings are an error.
- Markdown and GitHub-flavored Markdown work. The built-in components need no imports.
- Not available: local images, Mermaid, hand-written SVG, charts drawn as images, and frontmatter.

## Writing

- Write plain, neutral prose in complete sentences that say who does what, such as "The server checks every link." One idea per sentence, one topic per paragraph.
- Write without personification: only people and programs act, as in "the color comes from the theme" rather than "the theme picks the color".
- Avoid hype, metaphor, and filler words, such as "seamless", "under the hood", and "simply".
- Avoid punchy patterns: slogans, kickers in headings or closing lines ("Small change, big impact"), questions answered at once ("The catch? …"), and announcements ("Let's dive in").
- Do not use em dashes. Use a period, a comma, or a colon instead.
- Do not frame statements as contrasts, such as "it is not X, it is Y" or "X, not Y". State what is true. Mention the alternative only when the reader needs to know about it.
- Use one term for one thing, everywhere. Do not vary words for style.
- Introduce each concept and term before using it; then explain step by step.
- Start a page with one or two sentences that say what it covers.
- Say something once, in the place it belongs, and link to it from elsewhere.
- Alerts and captions are one or two sentences. Use an alert only for what the reader must not miss, such as a step that deletes data. Keep table cells short; explanations belong in prose.

## Code and layout

- Give every fenced code block a language, or `text` for plain text. Keep code you write within 100 columns. Code copied from an existing source, such as a command a tool prints or a file's lines, keeps its own formatting; prefer an `Excerpt` for project files.
- Write math as TeX between `$$` marks: `$$x^2$$` in a sentence, or on lines of their own for a block.
- Mark changed or important lines with `// [!code ++]`, `// [!code --]`, and `// [!code highlight]`.
- Put alternatives the reader picks one of, such as package managers, in `<Tabs>`, and things the reader compares in `<Columns>`.

## Figures

Draw a figure whenever structure, flow, or change over time is easier to see than to read: components and how they connect, a request path, messages between participants, a data layout, or numbers to compare. Write the prose around it, and refer to it with `Ref`.

- When the repository has data files, such as CSV or TSV files or benchmark results, chart the ones that support a point in the text instead of copying their numbers.
- Explain a path through a figure, such as a request through components, with steps.

## Numbering and references

- Chapters, sections, and titled figures, tables, and code listings are numbered automatically, each kind in its own sequence.
- **Never type numbers** into headings, captions, or references. They change as the document grows.
- Every numbered item has an `id` and a caption, and is referenced in the text before or where it appears: `<Ref to="id" />`, never "the table below". Ids are addresses: renaming one breaks links.
- `<Table id caption>`, `<Listing id caption>`, `<Diagram id caption>`, `<Chart id caption>`, and `<Figure id caption>` are numbered.

## Links and ids

- One address form: `/page#id`. Ids are headings' slugs, numbered blocks' `id`s, and diagram elements as `figure--element`.
- A heading's id is its text, lowercased with hyphens: `## Install the CLI` → `install-the-cli`. A repeated heading gets `-1`, `-2`, and so does a heading whose id a figure, table, or listing on its page already has: `## Components` above `<Diagram id="components">` is `components-1`. Headings take no custom id; keep heading text stable or update links.
- Link pages by address or file name: `[setup](setup)`, `[setup](setup.mdx#install)`. External links are ordinary Markdown and are not checked.
- Write a GitHub issue or pull request as a link, keeping the reference as its text: `[#1234](https://github.com/owner/repo/issues/1234)`, `[owner/other#56](https://github.com/owner/other/issues/56)`. Neither form becomes a link by itself.
- A heading id is unique on its page, and a figure, table, or listing id in the whole document. Do not use `--` in your own ids.
- Renaming a page file, a heading, or an id changes its address. Update `document.json` and every link in the same edit; the diagnostics list the links you missed.

## External files

- External directories are the way to include files from outside the project, such as the repository the document is about. `document.json` names each one, relative to `document.json`: `"files": { "app": "../app" }`. Their names use lowercase letters, digits, and hyphens. Pages can show any text file from them, not only code.
- Files under `.git`, binary files, files over 1 MB, and symlinks leading out of the directory are not shown.
- A file's address is `/-/files/<directory>/<path>`, and lines are `#L40` or `#L40-L72`; it opens the file view. When the text is about a function, type, or block, link its lines, found by reading the file: `[handle](/-/files/app/src/server.ts#L40-L72)`. Link a whole file only when the text is about the whole file.
- Show code from the project with an `Excerpt`, never by copying it into a fenced block. Keep excerpts short, about 5 to 30 lines, and explain them in the text. Link to the file for the rest.
- A reader can comment on lines of a file. The prompt names the file relative to the project directory, so you can open it.

## Tables, listings, excerpts, and refs

```mdx
<Table id="routes" caption="The API routes.">

| Route | Meaning |
|---|---|
| `GET /items` | List items |

</Table>
```

`Table` wraps a Markdown table, with a blank line after the opening tag and before the closing tag, or the table is read as text. The caption goes above. Left-align text, right-align numbers (`|---:|`), and keep cells short.

````mdx
<Listing id="config" caption="The Vite configuration.">

```ts
export default defineConfig({ plugins: [yapparatus()] })
```

</Listing>
````

`Listing` wraps one fenced code block or one `Excerpt`, with the caption above.

```mdx
<Listing id="retry-loop" caption="The retry loop.">
<Excerpt from="/-/files/app/src/client.ts" start="export async function fetchWithRetry(" mark="await sleep(" />
</Listing>
```

`Excerpt` shows lines of an external file, found by their text when the page is compiled, so it keeps showing the same code when lines move. The block shows the file's line numbers, and the language comes from the file name.

| Attribute | Value |
|---|---|
| `from` | The file's address, `/-/files/<directory>/<path>`, without lines |
| `start` | Text from the first line to show. Exactly one line of the file may contain it. Without `start`, the whole file |
| `end` | Text from the last line to show: the first line from `start` on that contains it. Without `end`, the block that the `start` line opens: the lines indented deeper than it, and its closing `}`, `)`, or `]`. An opening `{` on the next line and `#` lines in column 0, such as `#ifdef`, stay in the block. A multi-line string that starts in column 0 ends the block; use `end` |
| `mark` | Text of lines to highlight, or a list, `mark={["retry", "backoff"]}`: every line of the excerpt that contains one |
| `wrap` | Written bare. Long lines wrap instead of scrolling, for prose such as Markdown |

Quote enough of a line to name it once, such as `export function handle(` rather than `handle`. Code marks in the file show as text; use `mark` instead.

```mdx
<Ref to="routes" /> lists the routes.
<Ref to="/setup#install" />
<Ref to="system-map">the system map</Ref>
```

`Ref` takes a figure, table, or listing id, a heading id on this page, or an address on any page: `/setup` or `/setup#install`. `figure--element` points at a diagram element or step, such as `request-flow--lookup`. The default link text is the generated name, such as "Table 2.4", "Section 3.2", or "Chapter 3"; without numbering, the caption, heading, or page title.

## Replies

A reply to a reader is MDX shown in the chat. Every built-in component works in it without imports, at the same width as the page.

- A reply is outside the document: nothing in it is numbered. Point at document content with addresses: `<Ref to="/setup#install" />`, also for headings.
- Custom components do not work in replies, because a reply has no imports.
- The server checks a reply like a page, and refuses it with file and line until it compiles, its links resolve, and its diagrams have no errors.
- Reply after every change to the pages, and say what changed, so the reader knows where to look.

## Checking your work

Fix every diagnostic. Broken links, `Ref`s, and anchors, duplicate ids, compile errors, and every diagram and chart diagnostic are reported one per line, with the file and lines, the page address, and for a diagram the elements involved: `- error BROKEN_LINK content/intro.mdx:12, /intro: …` or `- warning LABEL_OVERLAP content/cache.mdx:40-62, /cache#flow, elements api, db: …`. An `error` must be fixed; a `warning` reads badly but renders. The message says how to fix it.

- After editing, read them from the running dev server, from the project directory. It waits until your edits are checked; `Diagnostics: none` means none:

```sh
node --input-type=module-typescript -e 'import { checkDocument } from "yapparatus/agent"; console.log((await checkDocument()).prompt);'
```

- In the chat, read them after editing and fix them before you reply. Errors found later, when a browser opens a changed page, end your wait for messages.
- Pages, diagrams, and chart data are checked when a page compiles. Chart drawings, render errors, and runtime errors are checked only when a browser shows the page; the diagnostics list the pages no browser has shown since they changed. In your reply, link each change, such as `[the new section on misses](/cache#misses)`, so the reader's browser checks it.
- Diagnostics do not tell you that a diagram is hard to read. After a diagram's diagnostics are clean, save its picture, open the PNG as an image, and delete it afterwards. `savePicture("/cache#flow", "/tmp/flow.png", { ids: true })` labels each element with its id.

```sh
node --input-type=module-typescript -e 'import { savePicture } from "yapparatus/agent"; await savePicture("/page#figure", "/tmp/figure.png");'
```
