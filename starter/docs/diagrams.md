# Diagrams

`<Diagram>` draws an SVG figure from a short program. You decide the composition: what shares a row, what sits below what, where an edge goes. The compiler measures text, sizes shapes, places them, attaches edges, and reports problems. It never moves a node or reroutes an edge by itself.

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

`id` and `caption` make a numbered figure. `description` is the accessible description. `debug` shows bounds, ids, and route points.

The page compiler runs `draw` when it compiles the page, and the browser only draws the result. Four rules follow:

- `draw` uses only `d` and the values it defines itself. A page's imports and constants do not exist where it runs, and a name from outside is a `DRAW_FAILED` error that names it.
- `draw` finishes within 1 second and creates at most 2000 elements. Past either limit it stops with a `DRAW_FAILED` error.
- Write `<Diagram>` in a page or a reply. One inside a `.tsx` component is not compiled.
- Write a `<Step>`'s `id` and `focus` as plain text, such as `focus="client api"`. A computed value, `focus={…}`, is a `STEP_NOT_TEXT` error.

## Pick a form

Draw a figure when it shows structure, a path, or an order faster than text; a rule stays a sentence. Find what the reader needs to see, and copy its example.

| To show | Example |
|---|---|
| Components and who talks to whom | [Components](#components) |
| A flow with a question | [A flow](#a-flow) |
| Data through a pipeline: inputs, queues, reports | [A pipeline](#a-pipeline) |
| States and transitions | [A state machine](#a-state-machine) |
| Messages over time | [Sequences](diagram-sequences.md) |
| Hierarchies: org charts, class trees, mind maps, file trees | [Trees](diagram-trees.md) |
| Tables, types, protocol headers, registers, arrays | [Structures](diagram-structures.md) |
| Which span of a text or code matters | [Marked text](diagram-structures.md#marked-text) |
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

- Peers in a row share a size with `equalSize`.
- `enclose` names a process, a machine, or a network around shapes placed elsewhere.

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

- The main path runs down a `column`; a side branch is placed `rightOf` its decision.
- Ask in two or three words in a decision, and explain it in the prose.

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

- A queue, a topic, or a stream is `d.queue`; a cylinder is storage that is read again.
- `d.io` marks where data enters or leaves the flow, and `d.doc` what it produces.

### A state machine

```js
const idle = d.box("Idle")
const busy = d.box("Busy", { role: "accent" })
d.row([idle, busy], { gap: 160 })
const start = d.start()
d.place(start, { leftOf: idle, gap: 56 })
d.arrow(start, idle)
d.arrow(idle, busy, { label: "request", bend: 32 })
d.arrow(busy, idle, { label: "done", bend: 32 })
d.arrow(busy, busy, { label: "retry", loop: "top" })
```

- Opposite transitions take the same `bend`, and curve apart.
- `d.arrow(a, a)` loops; `loop` picks the side.

## Shapes

| Call | Draws |
|---|---|
| `d.box(label, options?)` | A component, service, or step; with `replicas`, a stack of boxes; with `icon`, an icon left of the label |
| `d.cylinder(label, options?)` | Storage: a database or a cache |
| `d.queue(label, options?)` | A cylinder on its side: a queue, a topic, or a stream |
| `d.doc(label, options?)` | A page with a wavy bottom: a document, a report, or a file; with `replicas`, a stack of pages |
| `d.io(label, options?)` | A parallelogram: the input or output of a flow |
| `d.actor(label, options?)` | A person or outside system |
| `d.icon(name, label, options?)` | A thing drawn as a picture, such as a user, a cloud, or a server: an icon above its label |
| `d.note(label, options?)` | A remark with a folded corner |
| `d.decision(label, options?)` | A diamond around a short question |
| `d.record(cells, options?)` | Cells on a grid: a table, type, header, register, or array. See [Structures](diagram-structures.md) |
| `d.start(label?, options?)`, `d.end(label?, options?)` | The start and end of a flow or state machine |
| `d.text(label, options?)` | Text without an outline; with `marks`, see [Marked text](diagram-structures.md#marked-text) |

- **Decisions:** a diamond grows about twice as fast as a box around the same text. Ask in two or three words, such as `"One match?"`, explain the question in the prose, and leave diamonds out of `equalSize`.
- **Start and end:** a label names what starts or ends the flow, such as `d.start("Request received")`. It sits beside the dot, on the `side` given (`right` by default, or `left`, `above`, `below`), and does not move it: rows, columns, and gaps use the dot alone. The overlap checks include the label, so put it on a side no edge leaves from. Without a label, the id is `start-1`, `end-2`, and so on. `start` and `end` take `id`, `sub`, `role`, `category`, `stepOnly`, and `side`.
- **Text:** `d.text` is for a remark that belongs to no element, such as a heading over a group. A label for an element belongs to the element. Text has no fill, so an edge through it is reported like an edge through a shape.
- **Replicas:** `replicas` on `d.box` or `d.doc` draws a stack of 2 to 4 boxes or pages, for pods, shards, workers, or several documents. The stack has exactly that many, so two pods are `replicas: 2`. For a larger or unknown number, put the number in the label of a stack of 4. Each shape behind adds 5 units to the width and the height, and the text sits on the front shape. A fixed `width` or `height` is the front shape's.

```js
const api = d.box("API")
const workers = d.box("Billing workers", { replicas: 3 })
const shards = d.box("16 shards", { replicas: 4 })
const exports = d.doc("Exports", { replicas: 2 })
d.row([api, workers, exports])
d.place(shards, { below: workers })
d.arrow(api, workers)
d.arrow(workers, exports)
d.arrow(workers, shards)
```

- **Icons:** `icon: "database"` on `d.box` draws a Lucide icon left of the label. `d.icon(name, label)` draws a larger one above its label, laid out as an actor is. The name is the Lucide name without the `lucide:` prefix; other collections do not work in diagrams. Find names as [Icons](icons.md#find-names) shows. A box's icon is drawn in the color of its label; the box's outline shows its role and category. A `d.icon` has no outline, so its icon is drawn in the element's line color, as an actor's figure is, and shows the role and category; its label keeps the label color. An unknown name is `UNKNOWN_ICON`, with the nearest names.

```js
const user = d.icon("user", "Customer")
const api = d.box("Orders API", { icon: "server", role: "accent" })
const db = d.box("Orders", { icon: "database", sub: "PostgreSQL" })
const cloud = d.icon("cloud", "Payment provider", { role: "external" })
d.row([user, api, db])
d.place(cloud, { below: api })
d.arrow(user, api, "orders")
d.arrow(api, db, "SQL")
d.arrow(api, cloud, "charge")
```

Options:

- `id`: see [Ids](#ids).
- `sub`: a second, smaller line.
- `role`: what the element is for. `accent` is the one element that matters most (one per figure, drawn heavier), `warning` is a failure or a risk (it gets a badge), `muted` steps an element back, and `external` is outside the system (dashed).
- `category`: what sets the element apart, in a few words, such as `"New"` or `"To be removed"`. See [Categories](#categories).

`role` and `category` also work on arrows, enclosures, and sequence messages. There is no option for a color: colors come from the theme.
- `width`: a fixed width; the text wraps at the width less the padding, and less a box's icon and the gap after it.
- `height`: a fixed height; overflow is reported.
- `minWidth`, `minHeight`, `mono`.

`\n` starts a new line in a shape's label or `sub` and in an edge or message label. Sequence fragment titles and divider labels are one line.

Long text wraps at spaces into lines of similar length: at 220 units in boxes, cylinders, queues, documents, inputs and outputs, decisions, actors, and icons, and at 320 in notes, text, and the labels of start and end. The shape grows to its widest line. Text in `mono`, record titles and cells, and edge labels do not wrap unless `width` is fixed; break their lines with `\n`.

## Ids

Every element has an id. Steps, links, and the reader's comments use it.

- A shape's id comes from its label: `"Auth service"` → `auth-service`. A labelled start or end too: `d.start("Request received")` → `request-received`.
- An edge's id joins the ids of its ends: `client->api`. With a box labelled "Get an answer", the edge from `ask` is `ask->get-an-answer`.
- A category's id comes from its name: `"To be removed"` → `to-be-removed`.
- A record cell or text mark has its parent's id, a dot, and its own: `users.team-id`. See [Members](diagram-structures.md#members).
- Repeated ids get a number: `box`, `box-2`.

Set `id` when:

- prose, a link, or a `Ref` points at the element, so editing its label does not change its address;
- the derived id is long or unclear;
- two edges join the same shapes.

A link to an element is `/page#figure--element`, such as `/guide#request-flow--miss`. Steps may use derived ids, because they sit inside the figure and are checked with it.

## Layout

Each shape has exactly one position owner: a grid, a row, a column, or `place`. Statement order does not matter.

| Call | Meaning |
|---|---|
| `d.grid([[a, b], [null, c]], { gap?, align? })` | Rows of cells on shared tracks |
| `d.row([a, b], { gap?, align? })` | Left to right: a grid of one row. Default gap: 88 |
| `d.column([a, b], { gap?, align? })` | Top to bottom: a grid of one column. Default gap: 64 |
| `d.place(b, { below: a, gap?, align? })` | Also `above`, `leftOf`, `rightOf` |
| `d.place(b, { at: point, anchor? })` | Put the anchor of `b` (default `center`) on a point |
| `d.enclose([a, b], { title?, titleAt?, padding?, role?, category? })` | A boundary around shapes. It never moves them |
| `d.equalSize([a, b])`, `equalWidth`, `equalHeight` | Share the largest measured size |

- Gaps are measured between edges, not between centers.
- A shape with a fixed `width` or `height` keeps it in a size group. A fixed size smaller than the group's is reported.
- `align` is `start`, `center` (the default), or `end`. In a row it places the shapes vertically, in a column horizontally.
- Grids, rows, and columns are elements: they nest, and you can place them.
- `titleAt` is the corner that holds the title: `topLeft` (the default), `topRight`, `bottomLeft`, or `bottomRight`.
- The first shape without a position goes at the origin.

### Grids

Use a grid when two or more rows must line up. A row of columns lines up only when every shape has the same size; a grid lines up whatever the sizes.

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

- Each column is as wide as its widest shape, and each row as tall as its tallest. A shape sits in the middle of its cell unless `align` says otherwise.
- `null` leaves a cell empty. Rows may have different lengths. No cell spans two tracks: to hold several shapes in one cell, put a row or column in it.
- `gap` is one number, or `[columnGap, rowGap]`. Default: `[88, 64]`.
- `align` is one value, or `[horizontal, vertical]`.
- `g.gutterX(i)` is the middle of the gap after column `i`, and `g.gutterY(i)` after row `i`, counted from 0. Route edges through them with `viaX` and `viaY`, so they run between the shapes. Rows and columns have gutters too.
- A gutter is a channel that edges share. Edges that leave one shape and fork, or that merge into one shape, may share it. Unrelated edges in one gutter are `EDGE_OVERLAP`: run them at different offsets, such as `g.gutterX(0).offset(8, 0)`.
- Focusing a grid in a step focuses its cells.

## Points

Every element has nine anchors:

- `center`, `top`, `bottom`, `left`, `right`
- `topLeft`, `topRight`, `bottomLeft`, `bottomRight`

There are also these points:

- `port(side, t)`: a point along a side, such as `api.port("right", 0.25)`. `t` defaults to 0.5.
- `g.gutterX(i)`, `g.gutterY(i)`: the middle of the gap after a grid's column or row `i`. See [Grids](#grids).

Derived points:

- `p.offset(dx, dy)`: a shift; y grows downward.
- `d.xy(a, b)`: the x of `a` with the y of `b`.
- `d.lerp(a, b, t)`: between two points.
- `d.point(x, y)` or `[x, y]`: absolute coordinates.

## Edges

```ts
d.arrow(from, to, "label")
d.arrow(from, to, { id, label, route, bend, loop, role, category, dashed, ends, head, stepOnly })
d.line(from, to, ...)   // the same, without arrowheads
```

- **Shape endpoint** (`api`): the edge meets the outline facing the other end.
- **Point endpoint** (`api.bottom`): the edge starts or ends exactly at that point.

| Option | Values |
|---|---|
| `route` | `"straight"` (default), `"hv"`, `"vh"`, `{ viaX: x }`, `{ viaY: y }`, `{ via: [p1, p2] }` |
| `bend` | Curve this many units to the left of the direction of travel |
| `loop` | For `d.arrow(a, a)`: the side of the loop. Default `right` |
| `ends` | `"->"` (default), `"<-"`, `"<->"`, `"--"` |
| `head` | `"filled"` (default) for calls and flows, `"open"` for replies and async messages |
| `dashed` | `true` for returns and optional paths |

Routes:

- `"hv"` goes across, then down; `"vh"` goes down, then across.
- `viaX` and `viaY` go through a channel at a given x or y. The value is a number or a point, such as a grid's gutter.
- `via` goes through the given points.
- A route with corners leaves a shape at a right angle: in line with the first `via` point when the side reaches that far, and from the middle of the side otherwise. The last `via` point sets where it enters the other shape in the same way.

Curves and loops:

- Give an A→B edge and a B→A edge the same `bend`, and they curve apart.
- `bend` cannot be combined with `route`.

A label is a string or `{ text, segment, at, side, gap }`:

- `segment` is the leg of the route, from 0.
- `at` is the position along the leg, from 0 to 1.
- `side` is `above`, `below`, `left`, or `right`.
- Default position: the middle of the longest leg, above a horizontal leg and to the right of a vertical one. On curves and loops, the label goes outside.
- `edge.label(...)` adds another label.

## Patterns

- **Peers share a size.** Give shapes in the same row or column `equalSize`, so the figure reads as a grid. Leave decisions and start or end dots out.
- **Rows that line up are a grid.** Put shapes that share columns across rows in one `d.grid`, not in rows aligned with `place` or `at`.
- **Elbows between columns use a gutter.** When several edges cross from one column to the next, route each through the grid's gutter: `route: { viaX: g.gutterX(0) }`. They then turn at one line instead of crossing each other.
- **Edges that would cross a node go around it.** Route through a channel above or below, such as `route: { viaY: group.bottom.offset(0, 28) }`, and give the label the leg it belongs on with `segment`.
- **Parallel edges between the same shapes** leave from offset points, such as `a.top.offset(40, 0)`, or curve apart with the same `bend`.
- **Enclosures name a boundary,** such as a process, a machine, or a network. Move the title with `titleAt` when an edge would cross it.
- **Gaps carry meaning.** Use the defaults, and widen a gap only to make room for an edge label or to separate groups.

## Frames

`d.frame(topLeft, bottomRight, { tab, title, dividers })` draws a titled region between two points, such as a UML fragment. It does not own or move anything.

## Categories

A category shows which elements belong together, or how they differ. Give elements the same `category` and they share a color; a legend under the figure names each color.

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

- **Colors follow the order of first use.** The first category gets the first color, and so on. Elements without a category stay neutral.
- **At most four categories per figure.** More cannot be told apart reliably, especially with color blindness. A fifth is reported and drawn without a color.
- **Name the difference, not the color.** The legend shows the words, so write what the reader should understand: "Runs in the browser", not "Blue".
- **A category also has an id** for steps, derived like a label: `<Step focus="new">` focuses every element in "New". Pointing at a legend entry highlights its elements too.
- A category changes an element's color only. An `accent` element in a category keeps its heavier outline, and a `warning` element keeps its badge.

## Steps

Steps tell the story of a figure in order. Each `<Step>` names the elements it is about and says one or two sentences. Step text is MDX, so it can link to the section that explains more. Steps never move anything; they only change what is highlighted, faded, or shown.

```mdx
<Diagram id="cached-read" caption="A cached read." build draw={(d) => {
  const client = d.box("Client")
  const api = d.box("API")
  const cache = d.cylinder("Cache")
  const db = d.cylinder("Database")
  d.row([client, api, cache])
  d.place(db, { below: cache })
  d.arrow(client, api)
  d.arrow(api, cache)
  d.arrow(cache, db, { id: "miss", label: "miss" })
  const why = d.note("Most reads stop here", { stepOnly: true })
  d.place(why, { below: api })
}}>
  <Step focus="client api client->api">The client sends a request to the API.</Step>
  <Step id="lookup" focus="cache api->cache most-reads-stop-here">The API first looks in the cache.</Step>
  <Step focus="database miss">On a miss, the cache reads the database.</Step>
  <Step focus="row-1">Together, the three serve every read.</Step>
</Diagram>
```

| Feature | Meaning |
|---|---|
| `focus` | Element ids, separated by spaces. Focused elements are highlighted; the others fade |
| Containers | Focusing an enclosure, grid, row, column, sequence, sequence fragment, or tree branch focuses everything in it |
| Categories | Focusing a category's id focuses every element in it |
| `build` | Each element stays hidden until the first step that focuses it |
| `stepOnly` | A shape or edge option: the element shows only in steps that focus it. Use it for callouts next to an element, or for versions of a label that change from step to step |
| `id` | A step's address: `/page#cached-read--lookup`. Unique among the figure's elements and steps |

To tell a story:

Steps help when the reader must follow an order: a request through components, a pipeline, a protocol, or a state machine. Give a figure steps when the text would otherwise say "first … then … finally" about it. A figure with four elements or fewer, or one that shows a structure without an order, needs none.

- Start with a step that focuses the main elements, so the reader sees the whole cast.
- Revisit an element in a later step when the story comes back to it.
- Put short remarks on the drawing with `stepOnly` notes. The eye then stays on the figure.
- Show a change with two `stepOnly` elements in the same place, focused in different steps.
- Say in each step what the drawing cannot: the reason or the consequence. Do not repeat the caption.
- Link from a step to the section that explains more.
- Steps and a numbered prose list that walk the same path repeat each other. Keep the walk in the steps, and keep rules and details in the prose after the figure.
- With `build`, an element that no step focuses is shown, faded, from the first step. Focus every element that should appear in order.

The reader steps with the buttons under the caption, the arrow keys, and Esc. Clicking an element opens the next step about it. A link to a step or element opens it. `<Ref to="cached-read--lookup">the lookup</Ref>` links to a step from the prose. When the reader comments on the figure, the message includes the open step. Print shows the whole figure, without step-only elements, and lists the steps.

Use steps when the order matters. A simple figure needs none.

## Diagnostics

The page compiler finds diagnostics when it compiles the page, so they are listed without a browser. In development, they also appear under the figure, as dashed outlines on the elements, and in the header's list. New errors are sent to the agent at once. If a compile fails, the last valid drawing stays on screen, dimmed.

| Code | Severity | Fix |
|---|---|---|
| `PLACEMENT_CYCLE` | error | Placements depend on each other. Place one of them independently |
| `CONFLICTING_PLACEMENT` | error | A shape is in a grid, row, or column and also placed, or in two of them. Keep one |
| `DUPLICATE_ID` | error | Two explicit ids are the same, a step id is taken, or an element has the same id as a category, so steps cannot focus the category. Rename one |
| `INVALID_PLACEMENT`, `ENCLOSURE_PLACEMENT` | error | Check the `place()` options |
| `DRAW_FAILED` | error | The `draw` function threw, at the line given, uses a name it does not define, ran longer than 1 second, or created more than 2000 elements |
| `DIAGRAM_FAILED` | error | The diagram compiler threw. The message says where |
| `DEGENERATE_EDGE` | error | An edge starts and ends at the same point. Connect different shapes or points, or use `loop` |
| `LABEL_SEGMENT` | error | A label names a `segment` the route does not have. Count the legs from 0 |
| `MARK_UNMATCHED` | error | A mark's text does not occur, occurs more than once, or is split across wrapped lines; or its lines are out of range. Mark a longer text or whole lines, or break the text's lines with `\n` |
| `CELL_SPAN` | error | A cell spans more columns than remain in its row. Split it into two cells |
| `BEND_WITH_ROUTE` | error | An edge has both `bend` and `route`. Keep one |
| `EDGE_NODE_INTERSECTION` | warning | Route the edge (`viaX`, `viaY`, `via`), bend it, or move the shape. An edge that runs through its own end needs a straight route or another route form |
| `EDGE_OVERLAP` | warning | Two edges run on top of each other and read as one line. Give one a `bend`, attach one at a `port()`, or draw one edge with `ends: "<->"`. Edges that fork from one point or merge into one point may share a stretch. Unrelated edges in one gutter run at different offsets, such as `g.gutterX(0).offset(8, 0)` |
| `HEAD_CROWDED` | warning | An arrowhead has less than 17 units of line to sit on, so it is drawn smaller. Widen the gap |
| `LABEL_OVERLAP`, `LABEL_CROWDED` | warning | Change `side`, `segment`, or `at`, or widen the gap |
| `NODE_OVERLAP`, `ENCLOSURE_INTRUSION` | warning | Adjust the placement or gaps. Step-only elements overlap only if one step shows both |
| `ENCLOSURE_TITLE_CROSSED` | warning | Move the title with `titleAt`, or move the edge |
| `TEXT_OVERFLOW` | warning | A word is wider than a fixed `width`, a record cell is wider than its cell, or the text is taller than a fixed `height`. Increase `width` or `height` |
| `FIXED_SIZE_IN_GROUP` | warning | A shape in `equalSize`, `equalWidth`, or `equalHeight` has a fixed size smaller than the group's. Remove the fixed size or take the shape out of the group |
| `RULER_CROWDED` | warning | Return `""` for the column labels to skip, such as `(i) => (i % 4 ? "" : i)` |
| `UNPLACED` | error | Add the shape to a grid, row, or column, or `place()` it |
| `INVALID_REPLICAS` | error | `replicas` is not a whole number from 2 to 4, so the shape is drawn alone. For more, or an unknown number, put the number in the label of a stack of 4 |
| `UNKNOWN_ICON` | error | The icon name is not a Lucide icon, so nothing is drawn. Use a name from the message, or find one as [Icons](icons.md#find-names) shows, without the `lucide:` prefix |
| `UNKNOWN_GUTTER` | error | `gutterX(i)` or `gutterY(i)` names a gap that does not exist. A grid of n columns has gutters 0 to n - 2 |
| `UNKNOWN_ELEMENT` | error | A step focuses an id that does not exist, or `element()` names a member that does not. The message lists the valid ids |
| `STEP_NOT_TEXT` | error | A step's `id` or `focus` is computed, such as `focus={ids}`. Write it as plain text |
| `BUILD_WITHOUT_STEPS` | warning | `build` needs `<Step>` children |
| `STEP_ONLY_UNUSED` | warning | A `stepOnly` element that no step focuses is never shown |
| `DIAGRAM_SCROLLS` | warning | Wider than 1280 units. Stack it more vertically |
| `FONT_FALLBACK` | warning | The text has characters the web app's fonts lack, such as "→", so its width is estimated. Use characters the fonts have, such as `->` |
| `ACCENT_OVERUSED` | warning | Keep `role: "accent"` on one element; give the others the default role |
| `TOO_MANY_CATEGORIES` | warning | Merge categories, or split the figure. Four is the most |

## Size

- Figures are at least as wide as the text column (560 px). They grow to the right to fit the drawing, up to about 960 units at natural size.
- On small screens, drawings shrink to 75 % of their natural size, then scroll sideways.
- Keep text-heavy diagrams under about 960 units.
- Text is measured with the web app's font files, so the checks match what the browser draws.

## Checklist

Before you finish a figure:

- The document check lists no diagnostics for it.
- The caption says what the figure shows in one or two sentences, and the text refers to it with `<Ref>` before or where it appears.
- A figure that is hard to describe from its labels alone has a `description`.
- At most one element has `role: "accent"`, and it is the element the text is about.
- Labels are short: two or three words, with details in `sub` or in the text.
- Each step's `focus` names elements that exist; `UNKNOWN_ELEMENT` lists the valid ids.
