# Writing Yapparatus documents

A Yapparatus document is a directory of MDX pages that a reader reads in the browser and comments on in a chat with you. You write content; the components handle layout, numbering, and drawing.

## Start a document

A document lives in a project made from the starter, which carries this guide in `docs/`. A project can hold several documents, each in its own document directory with a `document.json`. One document directory cannot be inside another. The user asks you for a document; Yapparatus is not running yet.

1. If the current directory has no `docs/guide.md`, create the project next to the repository the document is about, and continue with its copy of this guide:

```sh
npx giget gh:tsaarni/yapparatus/starter my-document && cd my-document && pnpm install
```

2. Write `document.json` and the pages in the document directory: `content/` for the first document, or a new directory such as `tutorial/` when `content/` already holds one. Name the documented repository under `"files"`.
3. End your turn: tell the user to run `pnpm dev <directory>`, such as `pnpm dev content`, in the project directory, open the address it prints, and paste the prompt the document's chat shows back to you.
4. The prompt connects you to the chat. It lists diagnostics, including diagrams and charts, which are checked when a page compiles, and chart drawings, which are checked only once the browser shows them. Fix them, then reply to the reader's messages there.

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

## Pages

- A page's file name is its address: `key-ideas.mdx` → `/key-ideas`. Use lowercase letters, digits, and hyphens. A page in a subdirectory is listed as `"guide/setup.mdx"`.
- Name a page for what it covers, so a first-time reader understands the contents entry: `architecture` and "Architecture", rather than `pieces` and "Pieces". Keep the file name and the title close.
- `document.json` lists every page file once, in reading order: `"pages": ["overview.mdx", "guide/setup.mdx"]`. The address drops the extension: `/guide/setup`. A page missing from the list, or listed without a file, is an error. Required: `"pages"`. Optional:

| Field | Value | Default |
|---|---|---|
| `title` | Header and tab title | Directory name |
| `subtitle` | Small line above the title, such as the project or team | None |
| `logo` | Icon beside the title, as an [icon name](icons.md): `"local:myapp"` for `icons/myapp.svg` | None |
| `favicon` | Icon in the browser tab, as an icon name; a monochrome icon takes the accent color | Browser default |
| `contentsLabel` | Heading over the page list | `"Contents"` |
| `numbering` | `false`, or `{ "sections": false }`; kinds: `sections`, `figures`, `tables`, `listings` | All on |
| `theme` | `"dark"`, `"light"`, or `"auto"` (follows the system; the reader can switch) | `"dark"` |
| `files` | External directories by name, relative to `document.json`; see [external files](#external-files) | None |

- A page has exactly one `#` heading, at the top. Its text is the page title in navigation. Sections use `##` and `###` only; deeper headings are an error.
- Markdown and GitHub-flavored Markdown work, including alerts such as `> [!NOTE]`. `Figure`, `Chart`, `Diagram`, `Step`, `Table`, `Listing`, `Excerpt`, `Ref`, `Icon`, `FileTree`, `Tabs`, `Columns`, and `Panel` need no imports. See [components](components.md).
- Not available: local images, math, Mermaid, hand-written SVG, charts drawn as images, frontmatter, and headings deeper than `###`.

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
- Write math as TeX between `$$` marks: `$$x^2$$` in a sentence, or on lines of their own for a block. See [math](components.md#math).
- Mark changed or important lines with `// [!code ++]`, `// [!code --]`, and `// [!code highlight]`. See [code marks](components.md#code-marks).
- Put alternatives the reader picks one of, such as package managers, in `<Tabs>`, and things the reader compares, such as an old and a new design, in `<Columns>`, each made of labelled `<Panel>`s. Wrap code columns in a `Listing` and drawing columns in a `Figure` to number them. See [tabs and columns](components.md#tabs-and-columns).

## Numbering and references

- Chapters, sections, and titled figures, tables, and code listings are numbered automatically, each kind in its own sequence.
- **Never type numbers** into headings, captions, or references. They change as the document grows.
- Every numbered item has an `id` and a caption, and is referenced in the text before or where it appears: `<Ref to="id" />`, never "the table below".
- Wrap a Markdown table in `<Table id caption>` and a code block in `<Listing id caption>`. `<Diagram id caption>`, `<Chart id caption>`, and `<Figure id caption>` are numbered figures.

## Links and ids

- One address form: `/page#id`. Ids are headings' slugs, numbered blocks' `id`s, and diagram elements as `figure--element`.
- A heading's id is its text, lowercased with hyphens: `## Install the CLI` → `install-the-cli`. A repeated heading gets `-1`, `-2`. Headings take no custom id; keep heading text stable or update links.
- Link pages by address or file name: `[setup](setup)`, `[setup](setup.mdx#install)`. External links are ordinary Markdown and are not checked.
- Write a GitHub issue or pull request as a link, keeping the reference as its text: `[#1234](https://github.com/owner/repo/issues/1234)`, `[owner/other#56](https://github.com/owner/other/issues/56)`. Neither form becomes a link by itself.
- `<Ref to="…" />` takes a figure, table, or listing id, a heading id on this page, or an address: `/setup` for a page, `/setup#install` for anything on it. Add `--element` for a diagram element or step: `request-flow--lookup`.
- Give an explicit `id` to every figure, table, and listing. Ids are addresses: renaming one breaks links.
- Diagram elements get ids from their labels. Set `id` on an element when prose, a link, or a `Ref` points at it, or when the derived id is long or unclear; see [the diagram reference](diagrams.md#ids).
- A heading id is unique on its page, and a figure, table, or listing id in the whole document; do not use `--` in your own ids.
- Renaming a page file, a heading, or an id changes its address. Update `document.json` and every link in the same edit; the diagnostics list the links you missed.

## External files

- External directories are the way to include files from outside the project, such as the repository the document is about. `document.json` names each one, relative to `document.json`: `"files": { "app": "../app" }`. Their names use lowercase letters, digits, and hyphens. Pages can show any text file from them, not only code.
- Files under `.git`, binary files, files over 1 MB, and symlinks leading out of the directory are not shown.
- A file's address is `/-/files/<directory>/<path>`, and lines are `#L40` or `#L40-L72`. Link to code with an ordinary link: `[the handler](/-/files/app/src/server.ts#L40-L72)`. The address opens the file view, which shows the whole file.
- When the text is about some lines of a file, such as a function, type, or block, link to its lines: `[handle](/-/files/app/src/server.ts#L40-L72)`, not the bare file. Read the file to find the lines. Link a whole file only when the text is about the whole file.
- Show code from the project with `<Excerpt from="/-/files/app/src/server.ts" start="export function handle(" />`, never by copying it into a fenced block. `start` quotes the first line, and the excerpt runs to the end of the block that line opens, or to the line with `end="…"`. Highlight lines with `mark="text"` or `mark={["text", "text"]}`. Long lines scroll; add `wrap` when their words matter, as in Markdown. Excerpts find their lines by text, so they follow the code when lines are added above it. See [Excerpt](components.md#excerpt).
- Keep excerpts short, about 5 to 30 lines, and explain them in the text. Link to the file for the rest.
- A reader can comment on lines of a file. The prompt names the file relative to the project directory, so you can open it.

## Diagrams

- Draw a figure whenever structure, flow, or change over time is easier to see than to read: components and how they connect, a request path, messages between participants, a data layout, or numbers to compare. Write the prose around it, and refer to it with `Ref`.
- Draw with `<Diagram>`, never with hand-written SVG. Read [the diagram reference](diagrams.md) before drawing, and the page for the form you draw: [structures](diagram-structures.md) for tables, headers, and marked text, [sequences](diagram-sequences.md) for messages over time, [trees](diagram-trees.md) for hierarchies. Start from the closest example.
- Use `d.sequence` for interactions over time.
- Add `<Step>` children when the figure is best explained in order. Each step is one or two sentences. Focus containers instead of listing their elements, name an edge only when the step focuses just one of its ends, and use `stepOnly` notes for words that belong on the drawing. See [steps](diagrams.md#steps).
- The page compiler runs `draw` and checks the figure, so three rules hold. `draw` uses only `d` and the values it defines itself, not the page's imports or constants. Write `<Diagram>` in a page or a reply, not inside a `.tsx` component. Write a step's `id` and `focus` as plain text, such as `focus="client api"`, not `focus={…}`.
- Keep text-heavy drawings under about 960 units wide. Stack rows into columns rather than letting a figure scroll.

## Charts

- Draw numbers with `<Chart>`, from a `<Table id>` on the page named with `from="#id"`, a block of CSV inside it, or a CSV or TSV file named with `from`. Read [the chart reference](charts.md) before drawing.
- Name a file that a tool produced instead of copying its numbers into the page. Use a file for more than a few dozen rows: the page then holds none of them, and they load when the reader scrolls to the chart.
- A block's data is not shown. When the reader needs the exact numbers, write them in a `Table` and chart it with `from="#id"`, rather than writing them twice.
- Write each column's unit in its header, such as `p99 (ms)`, and plain numbers or ISO dates in its cells.
- Color by a column of categories, never by a literal color. Four categories at most.

## Replies

A reply to a reader is MDX shown in the chat. Every built-in component works in it without imports, at the same width as the page.

- A reply is outside the document: nothing in it is numbered, and it has no Link or Comment buttons. Point at document content with links and addresses: `<Ref to="/setup#install" />`.
- Custom components do not work in replies, because a reply has no imports.
- The server checks a reply like a page, and refuses it with file and line until it compiles, its links resolve, and its diagrams have no errors.
- Reply after every change to the pages, and say what changed, so the reader knows where to look.

## Icons

Use `<Icon name="collection:name" label="…" />` with a literal name, in prose, tables, and figures. Diagram shapes take no icons. Find names with the search in [icons](icons.md#find-names).

## Custom components

Put a `.tsx` file next to the pages and import it: `import { Swatch } from "./swatch.tsx";`, as in `node_modules/yapparatus/docs/design/styling.mdx`. See [custom components](components.md#custom-components).

## Checking your work

Fix every diagnostic. Broken links, `Ref`s, and anchors, duplicate ids, compile errors, and every diagram and chart diagnostic are reported one per line, with the file and lines, the page address, and for a diagram the elements involved: `- error BROKEN_LINK content/intro.mdx:12, /intro: …` or `- warning LABEL_OVERLAP content/cache.mdx:40-62, /cache#flow, elements api, db: …`. Each code is an `error`, which you must fix, or a `warning`, which reads badly but renders.

- After editing, read them from the running dev server, from the project directory. It waits until your edits are checked; `Diagnostics: none` means none:

```sh
node --input-type=module-typescript -e 'import { checkDocument } from "yapparatus/agent"; console.log((await checkDocument()).prompt);'
```

- In the chat, read them after editing and fix them before you reply. Errors found later, when a browser opens a changed page, end your wait for messages.
- Diagrams and what a chart's `plot` names are checked when their page compiles, so their diagnostics are listed at once. Chart drawings, render errors, and runtime errors are checked only when a browser shows the page. The diagnostics list the pages no browser has shown since they changed, with what was found before the change. In your reply, say in a sentence what changed on each page and link to the change, such as `[the new section on misses](/cache#misses)`: the reader's browser checks a page when the reader opens it.
- Diagnostics do not tell you that a diagram is hard to read. After you write or change a diagram and its diagnostics are clean, look at it once. This saves its picture as the reader sees it in the PNG file that you name. Open the file as an image, and delete it afterwards. `savePicture("/cache#flow", "/tmp/flow.png", { ids: true })` labels each element with its id.

```sh
node --input-type=module-typescript -e 'import { savePicture } from "yapparatus/agent"; await savePicture("/page#figure", "/tmp/figure.png");'
```
