# Trees

Org charts, class hierarchies, mind maps, and file trees. Read [diagrams.md](diagrams.md) first; this page adds `d.tree`.

Copy the example closest to your figure, then change the labels.

## Down: an org chart

```js
const cto = d.box("CTO", { sub: "Ada" })
d.tree(cto, [
  [d.box("Platform"), [d.box("Build"), d.box("Runtime")]],
  [d.box("Product"), [d.box("Web"), d.box("Mobile"), d.box("Growth")]],
  d.box("Security"),
])
```

- A child is a shape, or `[shape, children]`.
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

## Indent: a file tree

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

- The `indent` layout uses `gap` between levels too, so a `levelGap` there is `INVALID_ARGUMENT`.
- The lines have no arrowheads unless `edge` gives `head` or `tail`. A line goes from the parent to the child, so `tail` puts the arrowhead at the parent. The lines from one parent share one trunk, and the overlap check accepts a shared trunk.
- Each subtree with children is a row or column whose id is its root's final id followed by `-tree`, such as `platform-tree`, or `platform-2-tree` when the root is `platform-2`. A step that focuses it focuses the branch: its shapes and its lines. `d.tree` returns the outermost one, so you can place it like any other element.
- Inside a subtree, the row, column, or grid of the root's children is the root's id followed by `-children`. In the `both` layout, the two sides of the tree's root are `-left` and `-right` instead.
- A line's id joins the ids of its ends, such as `platform->build`.
- The tree owns the positions of its shapes. A shape that is already in a row, a column, or `place` is `CONFLICTING_PLACEMENT`.
