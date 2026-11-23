# Trees

Org charts, class hierarchies, mind maps, decision trees, and file trees. This page adds `d.tree`.

## Down: an org chart

```js
const cto = d.box("CTO", { sub: "Ada" })
d.tree(cto, [
  [d.box("Platform"), [d.box("Build"), d.box("Runtime")]],
  [d.box("Product"), [d.box("Web"), d.box("Mobile"), d.box("Growth")]],
  d.box("Security"),
])
```

- A child is a shape, or `[shape, children]`. A child whose line needs a label is an object; see [labelled lines](#labelled-lines-a-decision-tree).
- Each parent is centered over all of its subtrees, so a wide branch moves its parent, not its siblings.

## Right: a class hierarchy

```js
const error = d.box("Error", { mono: true })
d.tree(error, [
  [d.box("IOError", { mono: true }), [d.box("FileNotFound", { mono: true }), d.box("Timeout", { mono: true })]],
  d.box("ParseError", { mono: true }),
  d.box("AuthError", { mono: true, role: "accent" }),
], { layout: "right", edge: { tail: "filled" } })
```

- `edge` gives options for every line: here an arrowhead at the parent, as UML draws inheritance.
- Siblings line up on their left sides; the parent sits in the middle of its subtrees.

## Both: a mind map

```js
const topic = d.box("Release 2.0", { role: "accent" })
d.tree(topic, [
  [d.box("Features"), [d.box("Search"), d.box("Export")]],
  [d.box("Risks"), [d.box("Migration"), d.box("Load")]],
  [d.box("Docs"), [d.box("Guide"), d.box("API")]],
  d.box("Dates"),
], { layout: "both" })
```

- The root's children alternate right and left, the first one right. Branches on the left grow to the left.
- Order the children so that the two sides have about the same height.

## Labelled lines: a decision tree

```js
const q = (text) => d.decision(text)
d.tree(q("Status 5xx?"), [
  { node: q("Upstream up?"), edge: "yes", children: [
    { node: d.box("Check proxy"), edge: "yes" },
    { node: d.box("Restart upstream", { role: "warning" }), edge: "no" },
  ] },
  { node: d.box("Check client"), edge: { label: "no", dashed: true } },
])
```

- Write a child as `{ node, edge, children }` when the line into it has a label or a style of its own. `edge` is the label, or options as for `d.arrow` without `id` and `route`, and they apply over the tree's `edge`. `children` is optional.
- Write every other child as a shape or `[shape, children]`. An object without `edge` is reported.
- The label sits on the last piece of the line, next to the child. In `right` and `both`, that piece is half of `levelGap` long, so give labels room with `levelGap: 72` or more. In `indent`, a label does not fit: put the words in the child.

## Indent: a file tree

For a directory listing in the text, use `<FileTree>`. Draw it as a tree only when it is part of a diagram, with edges to other shapes.

```js
const t = (name) => d.text(name, { mono: true })
d.tree(t("src/"), [
  [t("diagram/"), [t("builder.ts"), t("tree.ts")]],
  [t("web/"), [t("index.ts")]],
  t("README.md"),
], { layout: "indent", gap: 10 })
```

- Each level is indented by 32 units, and its lines drop from under the left part of its parent.
- `gap` is the space between rows. Text is short, so a smaller gap keeps the list compact.

## Reference

| Option | Meaning |
|---|---|
| `id` | The id of the outermost subtree. Default: the root's id followed by `-tree` |
| `layout` | `down` (default), `right`, `both`, or `indent` |
| `gap` | Space between siblings. Default: 24 |
| `levelGap` | Space between a parent and its children. Default: 48. `indent` uses `gap` |
| `edge` | `{ head?, tail?, dashed?, role?, category?, stepOnly? }` for every line |

| Child | Meaning |
|---|---|
| A shape | A leaf |
| `[shape, children]` | A shape with its own children |
| `{ node, edge, children? }` | A shape whose line from its parent has its own `edge`: a label, or `{ label?, head?, tail?, dashed?, role?, category?, stepOnly? }` |

- The lines have no arrowheads unless `edge` gives `head` or `tail`. A line goes from the parent to the child, so `tail` puts the arrowhead at the parent. The lines from one parent share one trunk, and the overlap check accepts a shared trunk.
- Each subtree with children is a row or column whose id is its root's final id followed by `-tree`, such as `platform-tree`, or `platform-2-tree` when the root is `platform-2`. A step that focuses it focuses the branch: its shapes and its lines. `d.tree` returns the outermost one, so you can place it like any other element.
- Inside a subtree, the row, column, or grid of the root's children is the root's id followed by `-children`. In the `both` layout, the two sides of the tree's root are `-left` and `-right` instead.
- A line's id joins the ids of its ends, such as `platform->build`.
- The tree owns the positions of its shapes. Do not also put its shapes in a row, a column, or `place`.
