# Components

`Figure`, `Chart`, `Diagram`, `Step`, `Table`, `Listing`, `Excerpt`, `Ref`, `Icon`, `FileTree`, `Tabs`, `Columns`, and `Panel` work in MDX pages and chat replies without imports, and so do alerts and code marks. Diagrams and their steps have [their own reference](diagrams.md), and so do [charts](charts.md) and [icons](icons.md).

## Figure

```mdx
<Figure id="stores" caption="The two stores." description="A database icon and a Redis logo">
  <Icon name="lucide:database" size={48} label="Database" />
  <Icon name="selfhst:redis" size={48} label="Redis" />
</Figure>
```

A framed figure, at least as wide as the text column, growing to the right to fit its content. With `id` and `caption` it is numbered. `description` is the accessible description. The caption goes below the content. When the content is Markdown, such as a `FileTree`, leave a blank line after the opening tag and before the closing tag. Use `Diagram` for drawings and `Chart` for data; local images are not supported.

## Table

```mdx
<Table id="routes" caption="The API routes.">

| Route | Meaning |
|---|---|
| `GET /items` | List items |

</Table>
```

Wrap a Markdown table. Leave a blank line after the opening tag and before the closing tag, or the table is read as text. The caption goes above the table. Left-align text, right-align numbers (`|---:|`), and keep cells short.

## Listing

````mdx
<Listing id="config" caption="The Vite configuration.">

```ts
export default defineConfig({ plugins: [yapparatus()] })
```

</Listing>
````

Wrap one fenced code block or one `Excerpt`. The caption goes above the code. Every fenced block names its language. Keep code written for the document within 100 columns; code copied from a source keeps its formatting.

## Excerpt

```mdx
<Listing id="retry-loop" caption="The retry loop.">
<Excerpt from="/-/files/app/src/client.ts" start="export async function fetchWithRetry(" mark="await sleep(" />
</Listing>
```

Lines of an external file, read when the page is compiled, from a directory that `"files"` in `document.json` names. The excerpt finds its lines by their text, so it keeps showing the same code when lines are added or removed above it.

| Attribute | Value |
|---|---|
| `from` | The file's address, `/-/files/<directory>/<path>`, without lines |
| `start` | Text from the first line to show. Exactly one line of the file may contain it. Without `start`, the whole file |
| `end` | Text from the last line to show: the first line from `start` on that contains it. Without `end`, the block that the `start` line opens: the lines indented deeper than it, and its closing `}`, `)`, or `]`. An opening `{` on the next line and `#` lines in column 0, such as `#ifdef`, stay in the block. A multi-line string that starts in column 0 ends the block; use `end` |
| `mark` | Text of lines to highlight, or a list, `mark={["retry", "backoff"]}`: every line of the excerpt that contains one |

Quote enough of a line to name it once, such as `export function handle(` rather than `handle`. The block shows the file's line numbers, and its bar links to the lines. The language comes from the file name. Text that is in no line and `start` text in several lines are reported as `EXCERPT_TEXT`, and a `from` that is not a file address, has line numbers, or comes with invalid attributes as `EXCERPT_INVALID`, both with the page's line, so a change to the file that breaks an excerpt shows up in the diagnostics. A missing file is reported as `BROKEN_LINK`.

Code marks written in the file are shown as text; use `mark` instead.

## Code marks

````mdx
```ts
const config = {
  retries: 3, // [!code --]
  retries: 5, // [!code ++]
  timeout: 30, // [!code highlight]
};
```
````

A comment at the end of a line marks it: `[!code ++]` added, `[!code --]` removed, `[!code highlight]` important. `[!code highlight:3]` marks three lines from there, and the same comment alone on its line marks the lines after it. Write the comment in the language's own syntax (`//`, `#`, `--`, `/* */`, or `<!-- -->`); the marks work in JSON too. The comments are removed from the page, and Copy leaves out removed lines.

Mark only the lines the text talks about.

## Alerts

```mdx
> [!WARNING]
> Back up the database before you migrate.
```

A blockquote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` is an alert of that kind. Any other `[!…]` marker is an error. Keep an alert to one or two sentences, and use one only for what the reader must not miss. A blockquote without a marker is a quotation.

## Tabs and Columns

````mdx
<Tabs>
<Panel label="macOS">

Install Node with `brew install node`.

</Panel>
<Panel label="Linux">

Install Node with your distribution's package manager.

</Panel>
</Tabs>
````

`Tabs` shows one `Panel` at a time, for alternatives the reader picks one of: an operating system, a package manager, a language. `Columns` takes the same panels and shows them side by side, for things the reader compares: an old and a new design, a client and its server. Never put what the reader should compare in tabs.

- A container holds only `Panel`s, at least two, each with its own `label` written as a string. Leave a blank line after each opening `<Panel>` tag and before its closing tag. Containers do not nest.
- Choosing a tab selects the tab with the same label in every set, on every page. Write the same choice with the same label everywhere.
- `Columns` holds two or three panels. Columns alone hold text and are not numbered. Wrap code side by side in a `Listing` and drawings side by side in a `Figure`, as below. A `Diagram` or `Chart` inside a `Figure` takes no `id` or `caption`; the figure has them.
- A small change to code reads better as [code marks](#code-marks), and a comparison of several aspects as a `Table`.

````mdx
<Listing id="retry" caption="The retry delay, before and after backoff.">

<Columns>
<Panel label="Before">

```ts
await sleep(200);
```

</Panel>
<Panel label="After">

```ts
await sleep(100 * 2 ** attempt);
```

</Panel>
</Columns>

</Listing>
````

## FileTree

```mdx
<FileTree>

- src/
  - **migrate.ts** runs the migration
  - …
- package.json

</FileTree>
```

Wrap one Markdown list, with a blank line after the opening tag and before the closing tag. The first word of each item is the name, and the rest is a comment. A name ending in `/`, or an item with a nested list, is a directory. Write the entry the text is about in bold. `…` stands for entries left out. Names are literal: a pattern such as `*.ts` reads as Markdown emphasis.

To number a tree, wrap it in a `Figure`. The tree then draws no frame of its own:

```mdx
<Figure id="layout" caption="The source tree.">

<FileTree>

- src/
  - main.ts

</FileTree>

</Figure>
```

## Ref

```mdx
<Ref to="routes" /> lists the routes.
<Ref to="/setup" /> explains the setup.
<Ref to="/setup#install" />
<Ref to="system-map">the system map</Ref>
```

`to` is a figure, table, or listing id, a heading id on this page, or an address on any page: `/setup` or `/setup#install`. `figure--part` points at a diagram part or step. The default link text is the generated name, such as "Table 2.4", "Section 3.2", or "Chapter 3"; without numbering, the caption, heading, or page title. Refer to every numbered item before or where it appears. In a reply, use addresses for headings.

## Custom components

A custom component is an ordinary React component in a `.tsx` file next to the pages, imported at the top of the page: `import { CacheLabel } from "./cache-label.tsx";`. `swatch.tsx` in `node_modules/yapparatus/docs/design/` is a working example. Style it with StyleX and the tokens from `yapparatus/theme.stylex`:

```tsx
import * as stylex from "@stylexjs/stylex";
import { fontWeight, radius, space, theme } from "yapparatus/theme.stylex";

const styles = stylex.create({
  label: {
    paddingInline: space.xs,
    borderRadius: radius.sm,
    backgroundColor: theme.accentSurface,
    color: theme.accentStrong,
    fontWeight: fontWeight.semibold,
  },
});

export function CacheLabel() {
  return <span {...stylex.props(styles.label)}>Cache</span>;
}
```

- Use tokens for every value: `theme` for colors and fonts; `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `space`, `radius`, `sizes`, `layer`, and `duration` for scales; `when.narrow` for a narrow reading column. Do not use literal colors.
- Use longhand properties (`borderWidth`, `backgroundColor`). StyleX silently drops shorthands that contain theme variables.
- Do not import application internals; use `yapparatus` and `yapparatus/theme.stylex`.

Builds compile and embed these styles like the built-in ones.
