# Diagrams

`<Diagram>` draws an SVG figure from a short program. You decide the composition: what shares a row, what sits below what, where an edge goes. The compiler measures text, sizes shapes, places them, attaches edges, and reports problems. It never moves a node or reroutes an edge by itself.

Contents: Example · Pick a form · Shapes · Ids · Layout · Grids · Points · Edges · Patterns · Frames · Categories · Steps · Size · Checklist

## Example

```mdx
<Diagram id="request-flow" caption="The request path and its cache-miss branch." draw={(d) => {
  const client = d.box("Client")
  const api = d.box("API", { role: "accent" })
  const cache = d.cylinder("Cache")
  const db = d.cylinder("Database")
  d.equalSize([client, api, cache, db])
  d.row([client, api, cache])
  d.place(db, { below: cache })

  d.arrow(client, api, "request")
  d.arrow(api, cache, "lookup")
  d.arrow(cache, db, { id: "miss", label: "miss" })
}} />
```

`id` and `caption` make a numbered figure, `description` is the accessible description, and `debug` shows bounds, ids, and route points.

The page compiler runs `draw` when it compiles the page; the browser only draws the result. So:

- `draw` uses only `d` and the values it defines itself. A page's imports and constants do not exist where it runs.
- `draw` finishes within 1 second and creates at most 2000 elements. A mistake in a call is reported with its elements, and the rest of the figure is still checked.
- Write `<Diagram>` in a page or a reply. One inside a `.tsx` component is not compiled.
- Write a `<Step>`'s `id` and `focus` as plain text, such as `focus="client orders-api"`, never `focus={…}`.

## Pick a form

Find what the reader needs to see, and copy its example.

| To show | Example |
|---|---|
| Components and who talks to whom | Components |
| A flow with a question | A flow |
| Data through a pipeline: inputs, queues, reports | A pipeline |
| States and transitions | A state machine |
| Messages over time | `diagram-sequences.md` |
| Hierarchies: org charts, class trees, mind maps, decision trees | `diagram-trees.md` |
| A directory listing | `<FileTree>`, not a diagram |
| Tables, types, protocol headers, registers, arrays | `diagram-structures.md` |
| Which span of a text or code matters | Marked text, `diagram-structures.md` |
| A layout or a size | Boxes with a fixed `width` and `height`, placed with gaps that match the thing drawn |

### Components

```js
const browser = d.actor("Browser", { role: "external" })
const api = d.box("API", { role: "accent" })
const auth = d.box("Auth")
const db = d.cylinder("Database")
d.equalSize([api, auth])
d.row([browser, api, db])
d.place(auth, { below: api })
d.enclose([api, auth], { title: "Backend" })
d.arrow(browser, api, "HTTPS")
d.arrow(api, db, "SQL")
d.arrow(api, auth, "verify")
```

Peers share a size with `equalSize`. `enclose` names a process, a machine, or a network around shapes placed elsewhere.

### A flow

```js
const start = d.start("Request received")
const check = d.box("Check token")
const valid = d.decision("Valid?")
const serve = d.box("Serve", { role: "accent" })
const reject = d.box("Reject", { role: "warning" })
const done = d.end()
d.column([start, check, valid, serve, done], { gap: 40 })
d.place(reject, { rightOf: valid, gap: 72 })
d.arrow(start, check)
d.arrow(check, valid)
d.arrow(valid, serve, "yes")
d.arrow(valid, reject, "no")
d.arrow(serve, done)
```

The main path runs down a `column`; a side branch is placed `rightOf` its decision.

### A pipeline

```js
const upload = d.io("Upload orders")
const events = d.queue("Order events")
const worker = d.box("Billing worker", { role: "accent" })
const db = d.cylinder("Ledger")
const report = d.doc("Daily report")
d.row([upload, events, worker, report])
d.place(db, { below: worker })
d.arrow(upload, events)
d.arrow(events, worker)
d.arrow(worker, db)
d.arrow(worker, report)
```

`d.io` marks where data enters or leaves, `d.queue` what flows between steps, `d.cylinder` storage that is read again, and `d.doc` what the flow produces.

### A state machine

```js
const idle = d.box("Idle")
const busy = d.box("Busy", { role: "accent" })
d.row([idle, busy], { gap: 160 })
const start = d.start()
d.place(start, { leftOf: idle, gap: 56 })
d.arrow(start, idle)
d.arrow(idle, busy, { label: "request", route: { bend: 32 } })
d.arrow(busy, idle, { label: "done", route: { bend: 32 } })
d.arrow(busy, busy, { label: "retry", route: { loop: "top" } })
```

Opposite transitions take the same `bend` and curve apart. `d.arrow(a, a)` loops on the right; `{ loop: side }` picks the side.

## Shapes

Every shape is `d.<shape>(label, options?)`, except `d.icon(name, label, options?)` and `d.record(cells, options?)`; `start` and `end` take an optional label.

| Shape | Draws |
|---|---|
| `box` | A component, service, or step |
| `cylinder` | Storage: a database or a cache |
| `queue` | A cylinder on its side: a queue, a topic, or a stream |
| `doc` | A page with a wavy bottom: a document, a report, or a file |
| `io` | A parallelogram: the input or output of a flow |
| `actor` | A person or outside system |
| `icon` | A Lucide icon above its label, laid out as an actor, such as a user, a cloud, or a server |
| `note` | A remark with a folded corner |
| `decision` | A diamond around a short question. It grows about twice as fast as a box: ask in two or three words, such as `"One match?"`, and explain in the prose |
| `record` | Cells on a grid: a table, type, header, register, or array, as `diagram-structures.md` describes |
| `start`, `end` | The dots that start and end a flow or state machine |
| `text` | Text without an outline, for a remark that belongs to no element, such as a heading over a group. An edge through it counts as through a shape |

| Option | Shapes | Meaning |
|---|---|---|
| `id` | all | See Ids |
| `sub` | all | A second, smaller line |
| `role` | all | `accent`: the one element that matters most, drawn heavier, once per figure; `warning`: a failure or risk, with a badge; `muted`: steps back; `external`: outside the system, dashed; `default` |
| `category` | all | What sets the element apart; see Categories |
| `stepOnly` | all | Shown only in the steps that focus it; see Steps |
| `width`, `height` | all but `start`, `end` | Fixed size. Text wraps at the width less the padding and a box's icon |
| `minWidth`, `minHeight` | all but `start`, `end` | The least size |
| `mono` | all but `start`, `end` | Monospace text |
| `replicas` | `box`, `doc` | A stack of exactly 2 to 4, for pods, shards, workers, or documents; for more or an unknown number, put it in the label of a stack of 4. Each shape behind adds 5 units to width and height; text and a fixed size are the front shape's |
| `icon` | `box` | A Lucide icon left of the label, in the label's color |
| `labelSide` | `start`, `end` | Side of the dot for the label: `right` (default), `left`, `top`, `bottom`. The label names what starts or ends the flow, does not move the dot, and counts for overlaps: put it on a side no edge leaves |
| `marks` | `text` | Marked spans and lines, as `diagram-structures.md` describes |

`record` takes the options in `diagram-structures.md`. `role` and `category` also work on edges, enclosures, frames, and a sequence's messages, notes, and fragments. Colors come only from the theme.

Icon names are Lucide names without `lucide:`; find them as Icons in `components.md` shows. A `d.icon` has no outline, so its icon shows the role and category.

```js
const user = d.icon("user", "Customer")
const api = d.box("Orders API", { icon: "server", role: "accent" })
const workers = d.box("Billing workers", { replicas: 3 })
const exports = d.doc("Exports", { replicas: 2 })
const cloud = d.icon("cloud", "Payment provider", { role: "external" })
d.row([user, api, workers, exports])
d.place(cloud, { below: api })
d.arrow(user, api, "orders")
d.arrow(api, workers)
d.arrow(workers, exports)
d.arrow(api, cloud, "charge")
```

Text:

- `\n` breaks a line in a label, a `sub`, and an edge or message label. Fragment titles and divider labels are one line.
- Long text wraps at spaces into even lines: at 220 units in boxes, cylinders, queues, docs, io, decisions, actors, and icons; at 320 in notes, text, and start and end labels. The shape grows to its widest line.
- `mono` text, record titles and cells, and edge labels wrap only at a fixed `width`; break them with `\n`.

## Ids

Every element has an id: its `id` option, or else one made from its label. The variable that holds the element plays no part. In a figure `request-path` on the page `architecture.mdx`:

```js
const db = d.cylinder("PostgreSQL", { id: "store" }) // store: /architecture#request-path--store
const api = d.box("HTTP API") // http-api: /architecture#request-path--http-api
d.row([api, db])
d.arrow(api, db) // http-api->store: /architecture#request-path--http-api->store
```

Steps, links, and the reader's comments use these ids: `<Step focus="http-api store">`.

- Text becomes an id in lowercase, with letters, digits, and underscores kept and every other run of characters one hyphen: `"Auth service"` → `auth-service`, `"GET /items"` → `get-items`, `"user_id"` → `user_id`. This holds for a shape's label, a labelled start or end, a category's name, an enclosure's title, and a frame's tab and title: `{ tab: "loop", title: "until empty" }` → `loop-until-empty`.
- An edge joins the ids of its ends with `->`: `http-api->store` above.
- A record cell or text mark is its parent's id, a dot, and its own: `users.team_id`.
- An element without text is its call and its count among your calls of that kind: `row-1`, `start-1`, `record-1`, `enclosure-1`, `frame-1`, `sequence-1`.
- What a sequence or a tree makes has its owner's id and a suffix, such as `api-lifeline` or `platform-tree`.
- Repeated ids get a number: `box`, `box-2`.

Set `id` when prose, a link, or a `Ref` points at the element, so a new label keeps its address; when the derived id is long or unclear; and when two edges join the same shapes.

## Layout

Each shape has exactly one position owner: a grid, a row, a column, or `place`. Statement order does not matter.

| Call | Meaning |
|---|---|
| `d.grid([[a, b], [null, c]], { gap?, align? })` | Rows of cells on shared tracks |
| `d.row([a, b], { gap?, align? })` | Left to right: a grid of one row. Default gap: 88 |
| `d.column([a, b], { gap?, align? })` | Top to bottom: a grid of one column. Default gap: 64 |
| `d.place(b, { below: a, gap?, align? })` | Also `above`, `leftOf`, `rightOf` |
| `d.place(b, { at: point, anchor? })` | Put the anchor of `b` (default `center`) on a point |
| `d.enclose([a, b], { id?, title?, titleCorner?, padding?, role?, category?, stepOnly? })` | A boundary around shapes. It never moves them |
| `d.equalSize([a, b])`, `equalWidth`, `equalHeight` | Share the largest measured size; a fixed size stays, and one smaller than the group's is reported |

| Option | Calls | Meaning |
|---|---|---|
| `id` | `grid`, `row`, `column`, `enclose` | See Ids |
| `gap` | `grid`, `row`, `column`, `place` | The space between edges, not centers. Negative overlaps the shapes, which is reported |
| `align` | `grid`, `row`, `column`, `place` | `start`, `center` (default), or `end`: across a row or column |
| `below`, `above`, `leftOf`, `rightOf` | `place` | The element to place the shape next to; with `gap` and `align` |
| `at`, `anchor` | `place` | A point, and the anchor of the shape that goes on it |
| `title`, `titleCorner`, `padding` | `enclose` | The title, its corner (`topLeft` default, `topRight`, `bottomLeft`, `bottomRight`), and the space around the members |
| `role`, `category`, `stepOnly` | `enclose` | As on shapes. Without a `role`, an enclosure is `muted` |

`place` takes exactly one of `below`, `above`, `leftOf`, `rightOf`, and `at`. Grids, rows, and columns are elements: they nest, and you can place them.

### Grids

Use a grid when two or more rows must line up whatever the sizes of their shapes.

```js
const web = d.box("Web app")
const mobile = d.box("Mobile app")
const api = d.box("API", { role: "accent" })
const auth = d.box("Auth")
const db = d.cylinder("Database")
d.equalSize([web, mobile, api, auth])
const g = d.grid([
  [web, api, db],
  [mobile, null, auth],
])
d.arrow(web, api)
d.arrow(mobile, api, { route: { viaX: g.gutterX(0) } })
d.arrow(api, db, "SQL")
d.arrow(api, auth, { route: { viaX: g.gutterX(1) }, label: "verify" })
```

- Each column is as wide as its widest shape, and each row as tall as its tallest.
- `null` leaves a cell empty, and rows may differ in length. A cell holds one element: for several, put a row or column in it.
- `gap` is one number or `[columnGap, rowGap]`, default `[88, 64]`; `align` is one value or `[horizontal, vertical]`.
- `g.gutterX(i)` is the middle of the gap after column `i`, and `g.gutterY(i)` after row `i`, from 0. Rows and columns have them too. Edges routed through one with `viaX` or `viaY` turn at one line between the shapes. Edges that fork or merge may share a gutter; unrelated ones run apart at offsets, such as `g.gutterX(0).offset(8, 0)`.

## Points

- Every element has nine anchors: `center`, `top`, `bottom`, `left`, `right`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`.
- `port(side, t)` is a point along a side, such as `api.port("right", 0.25)`; `t` defaults to 0.5.
- `p.offset(dx, dy)` shifts a point; y grows downward.
- `d.xy(a, b)` is the x of `a` with the y of `b`, and `d.lerp(a, b, t)` a point between two.
- `[x, y]` is absolute.

## Edges

```ts
d.arrow(from, to, "label")
d.arrow(from, to, { id, label, route, role, category, dashed, head, tail, stepOnly })
d.line(from, to, ...)   // the same, with no arrowhead unless head or tail gives one
```

An end at a shape, `api`, meets the outline facing the other end; an end at a point, `api.bottom`, is exactly there.

| Option | Values |
|---|---|
| `id` | See Ids |
| `label` | A string, a label's options, or a list of either, as below |
| `route` | `"straight"` (default), `"hv"`, `"vh"`, `{ viaX: x }`, `{ viaY: y }`, `{ via: [p1, p2] }`, `{ bend: units }`, `{ loop: side }` |
| `head` | The arrowhead at `to`: `"filled"` (default on `d.arrow`), `"open"`, or `"none"` (default on `d.line`) |
| `tail` | The arrowhead at `from`: `"filled"`, `"open"`, or `"none"` (default) |
| `dashed` | `true` for returns and optional paths |
| `role`, `category` | As on shapes |
| `stepOnly` | Shown only in the steps that focus it |

A filled head is for calls and flows, an open head for replies and async messages, and `{ tail: "filled" }` makes a two-way arrow.

Routes:

- `"hv"` goes across, then down; `"vh"` down, then across.
- `viaX` and `viaY` run through a channel at an x or y: a number, a point such as a gutter, a shape for its center, or `[x, y]`. `via` goes through the given points.
- A route with corners leaves a shape at a right angle: in line with the first `via` point when the side reaches it, else from the middle of the side. The last `via` point sets the entry the same way.
- `bend` curves the edge this many units left of its direction. An A→B and a B→A edge with the same `bend` curve apart.
- `loop` is the only route of an edge from a shape to itself, and leaves and returns on its side, `right` by default.

A label is a string or `{ text, segment, along, side, gap }`:

- `segment` is the leg of the route, from 0, and `along` the position on it, from 0 to 1.
- `side` is `top`, `bottom`, `left`, or `right` of the leg.
- By default a label sits at the middle of the longest leg, above a horizontal leg and right of a vertical one, and outside curves and loops.
- Several labels are a list: `label: ["request", { text: "retry", segment: 2 }]`.

## Patterns

- **Peers share a size.** Give shapes in one row or column `equalSize`, but not decisions or start and end dots.
- **Rows that line up are a grid,** not rows aligned with `place` or `at`.
- **Edges that would cross a node go around it** through a channel, such as `route: { viaY: group.bottom.offset(0, 28) }`, with the label on its leg by `segment`.
- **Parallel edges between the same shapes** leave from offset points, such as `a.top.offset(40, 0)`, or take the same `bend`.
- **Gaps carry meaning.** Keep the defaults; widen a gap only to make room for an edge label or to separate groups.

## Frames

`d.frame(topLeft, bottomRight, options?)` draws a titled region between two points, such as a network zone or a UML fragment. It has anchors and `port()`, an edge to it meets its outline, and `place` and `enclose` take it. It owns and moves nothing.

```js
const client = d.actor("Client", { role: "external" })
const api = d.box("API")
const db = d.cylinder("Database")
d.row([api, db])
const zone = d.frame(api.topLeft.offset(-24, -40), db.bottomRight.offset(24, 24), {
  tab: "zone",
  title: "private network",
})
d.place(client, { leftOf: zone, gap: 72 })
d.arrow(client, zone, "VPN")
d.arrow(api, db)
```

| Option | Meaning |
|---|---|
| `id` | See Ids |
| `tab` | The label in the top-left corner, such as `loop` |
| `title` | The text after the tab |
| `dividers` | A list of `{ at, label? }`: a dashed line at the y of the point `at`, with an optional label |
| `role`, `category` | As on shapes. Without a `role`, a frame has a thin line and a tab on a raised fill |
| `stepOnly` | Shown only in the steps that focus it |

The points set a frame's bounds: move it by moving them, never with a grid, row, column, or `place`. Enclosures, cells, and marks are the same: position their members or parent. A step that focuses a frame focuses the frame alone; to group shapes for steps, use `enclose`.

## Categories

Elements with the same `category` share a color, and a legend under the figure names each one.

```js
const orders = d.box("Orders API", { category: "New" })
const payments = d.box("Payments API", { category: "New" })
const batch = d.box("Batch job", { category: "To be removed" })
const db = d.cylinder("Database")
d.row([orders, payments, batch])
d.place(db, { below: payments })
d.arrow(orders, db)
d.arrow(payments, db)
d.arrow(batch, db, { dashed: true })
```

- Colors follow the order of first use; elements without a category stay neutral.
- At most four categories per figure, so readers with color blindness can tell them apart. A fifth is drawn without a color.
- Name the difference, not the color: "Runs in the browser", not "Blue".
- A category has an id from its name: `<Step focus="new">` focuses every element in "New". Pointing at a legend entry highlights them too.
- A category changes only the color: `accent` keeps its heavier outline, and `warning` its badge.

## Steps

Each `<Step>` names the elements it focuses and says one or two sentences of MDX, which may link onward. Focused elements are highlighted and the rest fade; steps never move anything. Give a figure steps when the text would otherwise say "first … then … finally": a request, a pipeline, a protocol, a state machine. A figure of four elements or fewer, or a structure without an order, needs none.

A step's `focus` lists element ids, separated by spaces: an element's `id` option, or else one made from its label, as Ids describes. Variable names inside `draw` are not ids: below, the box in `api` is `orders-api`. To focus an element by a name you choose, give it that `id`, such as `{ id: "api" }`.

```mdx
<Diagram id="cached-read" caption="A cached read." build draw={(d) => {
  const client = d.box("Client")
  const api = d.box("Orders API") // id "orders-api", from the label
  const cache = d.cylinder("Cache")
  const db = d.cylinder("Database") // id "database", from the label
  d.row([client, api, cache]) // id "row-1", the first row
  d.place(db, { below: cache })
  d.arrow(client, api)
  d.arrow(api, cache) // id "orders-api->cache": the ids of its ends, joined by ->
  d.arrow(cache, db, { id: "miss", label: "miss" }) // id "miss", from the id option
  const why = d.note("Most reads stop here", { stepOnly: true }) // id "most-reads-stop-here", from the label
  d.place(why, { below: api })
}}>
  <Step focus="client orders-api">The client sends a request to the API.</Step>
  <Step id="lookup" focus="cache orders-api->cache most-reads-stop-here">The API looks in the cache.</Step>
  <Step focus="database miss">On a miss, the cache reads the database.</Step>
  <Step focus="row-1">Together, the three serve every read.</Step>
</Diagram>
```

- **Edges** come with both their ends. An end at an anchor, port, or offset of a shape counts as the shape, and a cell or mark end as that member. Name the edge when the step focuses one end only, as `orders-api->cache`; when an end is made by `xy`, `lerp`, a gutter, or `[x, y]`; and for a `stepOnly` edge or a sequence message.
- **Containers and categories:** focusing an enclosure, grid, row, column, sequence, fragment, tree branch, or category's id focuses everything in it. Prefer that to listing members.
- **No `focus`:** shows the whole figure without step-only elements, changes no other step, and counts as focusing nothing.
- **`stepOnly`** on shapes, cells, marks, edges, enclosures, frames, and a sequence's messages, notes, and fragments shows the element only in steps that focus it: for callouts, or a label that changes from step to step (two `stepOnly` elements in one place). Step-only elements overlap others only when one step shows both.
- **`build`** hides each element until the first step that focuses it, and an edge while an end is hidden. A step without `focus` reveals nothing. An element no step focuses shows faded from the first step; focus every shape with an edge, and leave only shapes without edges and enclosures as scenery.
- **`id`** gives the step an address, `/page#cached-read--lookup`, unique among the figure's elements and steps. Link to it with `<Ref to="cached-read--lookup">the lookup</Ref>`. A reader's comment names the open step.

To tell the story: start with the whole cast; revisit an element when the story returns to it; put short remarks on the drawing as `stepOnly` notes; say what the drawing cannot, the reason or the consequence, not the caption. Keep the walk in the steps and the rules in the prose after the figure, not both.

## Size

Figures are at least as wide as the text column, 560 units, and grow to the right. Keep a diagram under about 960 units, the most a page shows at natural size, by stacking rows into columns. Past 1280 units the reader must scroll.

## Checklist

Before you finish a figure:

- The document check lists nothing for it.
- The caption says what the figure shows in one or two sentences, and the text refers to it with `<Ref>` before or where it appears.
- A figure that is hard to describe from its labels alone has a `description`.
- At most one element has `role: "accent"`, and it is the element the text is about.
- Labels are short: two or three words, with details in `sub` or in the text.
