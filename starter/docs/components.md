# Components

Alerts, code marks, math, `Tabs`, `Columns`, `Panel`, `FileTree`, `Figure`, and `Icon` work in pages and chat replies without imports, as do custom components in pages. Tables, listings, excerpts, and `Ref` are in the guide.

Contents: Figure · Code marks · Alerts · Math · Tabs and Columns · FileTree · Icons · Custom components

## Figure

```mdx
<Figure id="stores" caption="The two stores." description="A database icon and a Redis logo">
  <Icon name="lucide:database" size={48} label="Database" />
  <Icon name="selfhst:redis" size={48} label="Redis" />
</Figure>
```

A framed figure, at least as wide as the text column, growing to the right to fit its content. With `id` and `caption` it is numbered. `description` is the accessible description. The caption goes below the content. When the content is Markdown, such as a `FileTree`, leave a blank line after the opening tag and before the closing tag.

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

A comment at the end of a line marks it: `[!code ++]` added, `[!code --]` removed, `[!code highlight]` important. `[!code highlight:3]` marks three lines from there, and the same comment alone on its line marks the lines after it. Write the comment in the language's own syntax (`//`, `#`, `--`, `/* */`, or `<!-- -->`); the marks work in JSON too. The comments are removed from the page, and Copy leaves out removed lines. Mark only the lines the text talks about.

## Alerts

```mdx
> [!WARNING]
> Back up the database before you migrate.
```

A blockquote whose first line is `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` is an alert of that kind. Any other `[!…]` marker is an error. A blockquote without a marker is a quotation. Use one only for what the reader must not miss.

## Math

```mdx
Each retry waits $$2^n$$ seconds, so $$r$$ retries wait

$$
\sum_{n=0}^{r-1} 2^n = 2^r - 1
$$
```

TeX between `$$` marks is math. Inside a sentence it is inline; on lines of its own it is a centered block. A single `$` is text, so prices such as $5 need no escaping. Equations are not numbered and cannot be referenced.

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
- A small change to code reads better as code marks, and a comparison of several aspects as a `Table`.

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

Use a `FileTree` for a directory listing. Draw a tree with `d.tree` only when it is part of a diagram, with edges to other shapes.

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

## Icons

```mdx
<Icon name="lucide:database" label="Database" />
<Icon name="selfhst:redis" size={28} label="Redis" />
<Icon name="assets:gateway" size={24} label="Gateway" />
```

- `name` is a literal `prefix:icon`: an installed icon set, or `assets:` for an SVG of the project. An unknown name fails compilation.
- `size` is pixels; default 20. `color` overrides the text color of a monochrome icon.
- Give `label` when the icon carries meaning; leave it out when the text beside it says the same.
- Diagrams draw Lucide icons only, named without the prefix: `d.box("Database", { icon: "database" })` and `d.icon("user", "Customer")`.

### Icon sets

| Prefix | Use for |
|---|---|
| `lucide` | General technical symbols and actions. The default family |
| `selfhst` | Logos of real software and services, often with `-light` and `-dark` variants |
| `energy-icons` | Energy and engineering symbols |

Use one family for ordinary symbols, and logos only for the actual product. When a document with `selfhst` logos is shared, credit selfh.st (CC BY 4.0).

### Find names

Search every installed icon set from the project directory; replace `redis` with a word:

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";
const { dependencies } = JSON.parse(readFileSync("package.json", "utf8"));
for (const pkg of Object.keys(dependencies).filter((name) => name.startsWith("@iconify-json/"))) {
  const { default: set } = await import(`${pkg}/icons.json`, { with: { type: "json" } });
  const names = Object.keys({ ...set.icons, ...set.aliases }).filter((name) => name.includes(process.argv[1]));
  if (names.length) console.log(`${set.prefix}: ${names.slice(0, 40).join(" ")}`);
}' redis
```

```text
selfhst: redis redis-dark redis-light
```

With web access, browse an icon set at `https://icon-sets.iconify.design/<prefix>/`, such as [lucide](https://icon-sets.iconify.design/lucide/). Only installed icon sets compile; ask the user before adding one with `pnpm add @iconify-json/<prefix>`.

### Project assets

`assets:gateway` is `assets/gateway.svg` in the project directory, shared by all its documents. Put the file there with a `viewBox`. Use `currentColor` for a monochrome icon so it follows the theme.

### In custom components

```tsx
import Database from "~icons/lucide/database";
import { Icon } from "yapparatus";

export function DatabaseLabel() {
  return <span><Icon icon={Database} size={20} /> Database</span>;
}
```

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
- To compute with a theme's colors, such as a contrast ratio, read the hex values from `palettes`: `palettes.dark.surface`. Styles use `theme`, which follows the reader's theme.
- Use longhand properties (`borderWidth`, `backgroundColor`). StyleX silently drops shorthands that contain theme variables.
- Do not import application internals; use `yapparatus` and `yapparatus/theme.stylex`.
- Do not put a `<Diagram>` in a component: only diagrams written in pages and replies are compiled.
