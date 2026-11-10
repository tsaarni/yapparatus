# Sequences

Messages between participants over time. Read [diagrams.md](diagrams.md) first; this page adds `d.sequence`.

Copy the example closest to your figure, then change the labels.

## A request with a branch

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

- A call opens an activation bar on the receiver; its `reply` closes it.
- `alt` with `else` shows exclusive branches; each takes a `title`.
- A note sits `over` one participant, or spans two: `over: [api, db]`.

## A queue and a loop

```js
const app = d.box("App")
const queue = d.cylinder("Queue")
const worker = d.box("Worker")
d.sequence([app, queue, worker], [
  { from: app, to: queue, label: "enqueue", async: true },
  { fragment: "loop", title: "until empty", id: "drain", steps: [
    { from: worker, to: queue, label: "poll" },
    { from: queue, to: worker, label: "job", reply: true },
    { from: worker, to: worker, label: "run" },
  ] },
], { numbered: true, gap: 64 })
```

- `async: true` sends without waiting: an open arrowhead and no bar.
- A message to the sender itself draws a loop.
- `numbered` numbers the messages. `id` on a fragment lets one step focus all its messages: `<Step focus="drain">`.

## Reference

| Step | Meaning |
|---|---|
| `{ from, to, label, reply?, async?, id?, role?, category? }` | A message. Its id comes from the label: `get-item`, then `get-item-2` |
| `{ note, over, id? }` | A note over one participant or between two |
| `{ fragment, title?, steps, else?, id? }` | `alt`, `opt`, `loop`, `par`, or another operator, around steps |

| Option | Meaning |
|---|---|
| `gap` | Space between participants. Default: 40 |
| `step` | Vertical space per message. Default: 44 |
| `numbered` | Number the messages |
| `id` | The sequence element's id |

- The participants are ordinary shapes, laid out in a row by the sequence; time runs downward.
- `d.sequence` returns one element, so you can place it like any other.
- Keep each message label shorter than the space between its two lifelines, or widen `gap`.
