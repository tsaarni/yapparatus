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

`draw` uses only `d` and values written inside it. The figure is compiled once per source text, so outside variables are not seen when they change.

## Choosing a form

Draw a figure when it shows parts, a path, or an order faster than text; a rule stays a sentence. Pick the form from what the reader needs to see:

| To show | Build it with |
|---|---|
| Components and who talks to whom | Boxes in rows and columns, `enclose` for a process or machine, arrows with short labels |
| A flow with a question | A `column` of boxes, `decision` diamonds, a labelled `start()`, and side branches placed `rightOf` |
| Messages over time | `d.sequence`; see [Sequence diagrams](#sequence-diagrams) |
| States and transitions | Boxes, `start()`, `bend` for each pair of opposite edges, and `loop` for a transition to itself; see [Curves and loops](#edges) |
| Types or tables | `d.record`, with edges from `rec.row(i)` |
| A layout or a size | Boxes with a fixed `width` and `height`, placed with gaps that match the thing drawn |

A state machine needs no special component:

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

## Shapes

| Call | Draws |
|---|---|
| `d.box(label, options?)` | A component, service, or step |
| `d.cylinder(label, options?)` | Storage: a database, cache, or queue |
| `d.actor(label, options?)` | A person or outside system |
| `d.note(label, options?)` | A remark with a folded corner |
| `d.decision(label, options?)` | A diamond around a short question |
| `d.record(title, rows, options?)` | A title over rows, such as a type or table |
| `d.start(label?, options?)`, `d.end(label?, options?)` | The start and end of a flow or state machine |
| `d.text(label, options?)` | Text without an outline |

- **Decisions:** a diamond grows about twice as fast as a box around the same text. Ask in two or three words, such as `"One match?"`, explain the question in the prose, and leave diamonds out of `equalSize`.
- **Start and end:** a label names what starts or ends the flow, such as `d.start("Request received")`. It sits beside the dot, on the `side` given (`right` by default, or `left`, `above`, `below`), and does not move it: rows, columns, and gaps use the dot alone. The label takes part in the overlap checks, so put it on a side no edge leaves from. Without a label, the id is `start-1`, `end-2`, and so on. `start` and `end` take `id`, `sub`, `role`, `category`, `stepOnly`, and `side`.
- **Text:** `d.text` is for a remark that belongs to no part, such as a heading over a group. A label for a part belongs to the part.

Options:

- `id`: see [Ids](#ids).
- `sub`: a second, smaller line.
- `role`: what the part is for. `accent` is the one part that matters most (one per figure, drawn heavier), `warning` is a failure or a risk (it gets a badge), `muted` steps a part back, and `external` is outside the system (dashed).
- `category`: what sets the part apart, in a few words, such as `"New"` or `"To be removed"`. See [Categories](#categories).

`role` and `category` also work on arrows, enclosures, and sequence messages. There is no option for a color: the theme picks it.
- `width`: a fixed width; the text wraps.
- `height`: a fixed height; overflow is reported.
- `minWidth`, `minHeight`, `mono`.

`\n` in a label starts a new line.

## Ids

Every part has an id. Steps, links, and the reader's questions use it.

- A shape's id comes from its label: `"Auth service"` → `auth-service`. A labelled start or end too: `d.start("Request received")` → `request-received`.
- An edge's id joins the ids of its ends: `client->api`. With a box labelled "Get an answer", the edge from `ask` is `ask->get-an-answer`.
- A category's id comes from its name: `"To be removed"` → `to-be-removed`.
- Repeated ids get a number: `box`, `box-2`.

Set `id` when:

- prose, a link, or a `Ref` points at the part, so editing its label does not change its address;
- the derived id is long or unclear;
- two edges join the same shapes.

A link to a part is `/page#figure--part`, such as `/guide#request-flow--miss`. Steps may use derived ids, because they sit inside the figure and are checked with it.

## Layout

Each shape has exactly one position owner: a row, a column, or `place`. Statement order does not matter.

| Call | Meaning |
|---|---|
| `d.row([a, b], { gap?, align? })` | Left to right. Default gap: 88 |
| `d.column([a, b], { gap?, align? })` | Top to bottom. Default gap: 64 |
| `d.place(b, { below: a, gap?, align? })` | Also `above`, `leftOf`, `rightOf` |
| `d.place(b, { at: point, anchor? })` | Put the anchor of `b` (default `center`) on a point |
| `d.enclose([a, b], { title?, titleAt?, padding?, role?, category? })` | A boundary around shapes. It never moves them |
| `d.equalSize([a, b])`, `equalWidth`, `equalHeight` | Share the largest measured size |

- Gaps are measured between edges, not between centers.
- `align` is `start`, `center` (the default), or `end`.
- Rows and columns are elements: they nest, and you can place them.
- `titleAt` is the corner that holds the title: `topLeft` (the default), `topRight`, `bottomLeft`, or `bottomRight`.
- The first shape without a position goes at the origin.

## Points

Every element has nine anchors:

- `center`, `top`, `bottom`, `left`, `right`
- `topLeft`, `topRight`, `bottomLeft`, `bottomRight`

There are also these points:

- `port(side, t)`: a point along a side, such as `api.port("right", 0.25)`. `t` defaults to 0.5.
- `rec.row(i, "left" | "right")`: the edge of record row `i`, on the right by default.

Derived points:

- `p.offset(dx, dy)`: a shift; y grows downward.
- `d.xy(a, b)`: the x of `a` with the y of `b`.
- `d.lerp(a, b, t)`: between two points.
- `d.point(x, y)` or `[x, y]`: absolute coordinates.

## Edges

```js
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
- `viaX` and `viaY` go through a channel at a given x or y. The value is a number or a point.
- `via` goes through the given points.

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
- **Elbows between columns use a channel halfway.** When several edges cross from one column to the next, route each through the same x: `route: { viaX: d.lerp(a.right, b.left, 0.5) }`. They then turn at one line instead of crossing each other.
- **Edges that would cross a node go around it.** Route through a channel above or below, such as `route: { viaY: group.bottom.offset(0, 28) }`, and give the label the leg it belongs on with `segment`.
- **Parallel edges between the same shapes** leave from offset points, such as `a.top.offset(40, 0)`, or curve apart with the same `bend`.
- **Enclosures name a boundary,** such as a process, a machine, or a network. Move the title with `titleAt` when an edge would cross it.
- **Gaps carry meaning.** Use the defaults, and widen a gap only to make room for an edge label or to separate groups.

## Frames

`d.frame(topLeft, bottomRight, { tab, title, dividers })` draws a titled region between two points, such as a UML fragment. It does not own or move anything.

## Sequence diagrams

```js
const you = d.actor("Reader")
const api = d.box("API")
const db = d.cylinder("Database")
d.sequence([you, api, db], [
  { from: you, to: api, label: "GET /item" },
  { from: api, to: db, label: "query" },
  { from: db, to: api, label: "rows", reply: true },
  { fragment: "alt", title: "found", steps: [
    { from: api, to: you, label: "200 OK", reply: true },
  ], else: [{ title: "missing", steps: [
    { from: api, to: you, label: "404", reply: true },
  ] }] },
  { note: "Logged for audit", over: api },
])
```

The participants are ordinary shapes, in a row; time runs downward.

- **Calls and replies:** a call opens an activation bar on the receiver, and its `reply` closes it. A call with no reply gets a short bar. `async` messages do not activate the receiver.
- **Self-messages:** a message to oneself draws a loop.
- **Notes:** a note sits `over` one participant, or spans two: `over: [a, b]`.
- **Fragments:** give a fragment an `id` to focus all its messages in one step.
- **Fragments** (`alt`, `opt`, `loop`, `par`, …): take a `title` and optional `else` branches.
- **Message ids:** derived from the label, such as `get-item`. A repeated label gets a number: `get-item-2`.

Options:

- `gap`: the space between participants. Default: 40.
- `step`: the vertical space per message. Default: 44.
- `numbered`: number the messages.
- `id`: an id for the sequence element.

`d.sequence` returns one element, so you can place it like any other. Keep each message label shorter than the space between its two lifelines, or widen `gap`.

## Categories

A category shows which parts belong together, or how they differ. Give parts the same `category` and they share a color; a legend under the figure names each color.

```js
const orders = d.box("Orders API", { category: "New" })
const payments = d.box("Payments API", { category: "New" })
const batch = d.box("Batch job", { category: "To be removed" })
const db = d.cylinder("Database")
```

- **Colors follow the order of first use.** The first category gets the first color, and so on. Parts without a category stay neutral.
- **At most four categories per figure.** More cannot be told apart reliably, especially with color blindness. A fifth is reported and drawn without a color.
- **Name the difference, not the color.** The legend shows the words, so write what the reader should understand: "Runs in the browser", not "Blue".
- **A category also has an id** for steps, derived like a label: `<Step focus="new">` focuses every part in "New". Pointing at a legend entry highlights its parts too.
- A category changes a part's color only. An `accent` part in a category keeps its heavier outline, and a `warning` part keeps its badge.

## Steps

Steps tell the story of a figure in order. Each `<Step>` names the parts it is about and says one or two sentences. Step text is MDX, so it can link to the section that explains more. Steps never move anything; they only change what is highlighted, faded, or shown.

```mdx
<Diagram id="request-flow" caption="A cached read." build draw={(d) => {
  …
  const why = d.note("Most reads stop here", { stepOnly: true })
  d.place(why, { below: cache })
}}>
  <Step focus="client api client->api">The client sends a request to the API.</Step>
  <Step id="lookup" focus="cache api->cache most-reads-stop-here">The API first looks in the cache.</Step>
  <Step focus="database miss">On a miss, the cache reads the database.</Step>
  <Step focus="row-1">Together, the three parts serve every read.</Step>
</Diagram>
```

| Feature | Meaning |
|---|---|
| `focus` | Part ids, separated by spaces. Focused parts are highlighted; the others fade |
| Containers | Focusing an enclosure, row, column, sequence, or sequence fragment focuses everything in it |
| Categories | Focusing a category's id focuses every part in it |
| `build` | Each part stays hidden until the first step that focuses it |
| `stepOnly` | A shape or edge option: the part shows only in steps that focus it. Use it for callouts next to a part, or for versions of a label that change from step to step |
| `id` | A step's address: `/page#request-flow--lookup`. Unique among the figure's parts and steps |

To tell a story:

Steps help when the reader must follow an order: a request through components, a pipeline, a protocol, or a state machine. Give a figure steps when the text would otherwise say "first … then … finally" about it. A figure with four parts or fewer, or one that shows a structure without an order, needs none.

- Start with a step that focuses the main parts, so the reader sees the whole cast.
- Revisit a part in a later step when the story comes back to it.
- Put short remarks on the drawing with `stepOnly` notes. The eye then stays on the figure.
- Show a change with two `stepOnly` parts in the same place, focused in different steps.
- Say in each step what the drawing cannot: the reason or the consequence. Do not repeat the caption.
- Link from a step to the section that explains more.
- Steps and a numbered prose list that walk the same path repeat each other. Keep the walk in the steps, and keep rules and details in the prose after the figure.
- With `build`, a part that no step focuses is shown, faded, from the first step. Focus every part that should appear in order.

The reader steps with the buttons under the caption, the arrow keys, and Esc. Clicking a part opens the next step about it. A link to a step or part opens it. `<Ref to="request-flow--lookup">the lookup</Ref>` links to a step from the prose. When the reader asks about the figure, the question includes the open step. Print shows the whole figure, without step-only parts, and lists the steps.

Use steps when the order matters. A simple figure needs none.

## Diagnostics

In development, diagnostics appear under the figure, in the console, as dashed outlines on the parts, and in the header's list. New errors are also sent to the agent at once. If a compile fails, the last valid drawing stays on screen, dimmed.

| Code | Severity | Fix |
|---|---|---|
| `PLACEMENT_CYCLE` | error | Placements depend on each other. Place one of them independently |
| `CONFLICTING_PLACEMENT` | error | A shape is in a row and also placed. Keep one |
| `DUPLICATE_ID` | error | Two explicit ids are the same, a step id is taken, or a part has the same id as a category, so steps cannot focus the category. Rename one |
| `INVALID_PLACEMENT`, `ENCLOSURE_PLACEMENT` | error | Check the `place()` options |
| `DRAW_FAILED` | error | The `draw` function threw |
| `DIAGRAM_FAILED` | error | The diagram compiler threw. The message says where |
| `DEGENERATE_EDGE` | error | An edge starts and ends at the same point. Connect different shapes or points, or use `loop` |
| `LABEL_SEGMENT` | error | A label names a `segment` the route does not have. Count the legs from 0 |
| `RECORD_ROW` | error | `rec.row(i)` names a row that does not exist |
| `BEND_WITH_ROUTE` | error | An edge has both `bend` and `route`. Keep one |
| `EDGE_NODE_INTERSECTION` | warning | Route the edge (`viaX`, `viaY`, `via`), bend it, or move the shape |
| `LABEL_OVERLAP`, `LABEL_CROWDED` | warning | Change `side`, `segment`, or `at`, or widen the gap |
| `NODE_OVERLAP`, `ENCLOSURE_INTRUSION` | warning | Adjust the placement or gaps. Step-only parts overlap only if one step shows both |
| `ENCLOSURE_TITLE_CROSSED` | warning | Move the title with `titleAt`, or move the edge |
| `TEXT_OVERFLOW` | warning | Increase `width` or `height` |
| `UNPLACED` | error | Add the shape to a row or column, or `place()` it |
| `UNKNOWN_PART` | error | A step focuses an id that does not exist. The message lists the valid ids |
| `BUILD_WITHOUT_STEPS` | warning | `build` needs `<Step>` children |
| `STEP_ONLY_UNUSED` | warning | A `stepOnly` part that no step focuses is never shown |
| `DIAGRAM_SCROLLS` | warning | Wider than 1280 units. Stack it more vertically |
| `ACCENT_OVERUSED` | warning | Keep `role: "accent"` on one part; give the others the default role |
| `TOO_MANY_CATEGORIES` | warning | Merge categories, or split the figure. Four is the most |

## Size

- Figures are at least as wide as the text column (560 px). They grow to the right to fit the drawing, up to about 960 units at natural size.
- On small screens, drawings shrink to 75 % of their natural size, then scroll sideways.
- Keep text-heavy diagrams under about 960 units.
- Text is measured with the page font, so check the result in the browser.

## Checklist

Before you finish a figure:

- The page shows it with no diagnostics. Text is measured in the browser, so a figure is checked only when a page shows it.
- The caption says what the figure shows in one or two sentences, and the text refers to it with `<Ref>` before or where it appears.
- A figure that is hard to describe from its labels alone has a `description`.
- At most one part has `role: "accent"`, and it is the part the text is about.
- Labels are short: two or three words, with details in `sub` or in the text.
- Each step's `focus` names parts that exist; `UNKNOWN_PART` lists the valid ids.
