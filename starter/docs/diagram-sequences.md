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
  { fragment: "alt", title: "found", messages: [
    { from: api, to: you, label: "200 OK", reply: true },
  ], else: [{ title: "missing", messages: [
    { from: api, to: you, label: "404", reply: true },
  ] }] },
  { note: "Logged for audit", over: api },
])
```

- A call opens an activation bar on the receiver; its `reply` closes it. A call with no reply gets a short bar.
- Only a receiver gets a bar. The Reader only sends, so its lifeline stays plain.
- `alt` with `else` shows exclusive branches; each takes a `title`. Each branch may reply to the same call.
- A note sits `over` one participant, or spans two: `over: [api, db]`.

## A queue and a loop

```js
const app = d.box("App")
const queue = d.cylinder("Queue")
const worker = d.box("Worker")
d.sequence([app, queue, worker], [
  { from: app, to: queue, label: "enqueue", async: true },
  { fragment: "loop", title: "until empty", id: "drain", messages: [
    { from: worker, to: queue, label: "poll" },
    { from: queue, to: worker, label: "job", reply: true },
    { from: worker, to: worker, label: "run" },
  ] },
], { numbered: true, gap: 64 })
```

- `async: true` sends without waiting: an open arrowhead and no bar.
- A message to the sender itself draws a loop and a short bar of its own. A fragment grows to cover what it holds, such as the label of a self-message.
- `numbered` numbers the messages. A step that focuses a fragment focuses all its messages: `<Step focus="drain">`. Without `id`, the fragment's id is its operator and title as a slug, here `loop-until-empty`.

## Reference

| Entry | Meaning |
|---|---|
| `{ from, to, label, reply?, async?, dashed?, id?, role?, category?, stepOnly? }` | A message. Its id comes from the label: `get-item`, then `get-item-2` |
| `{ note, over, id?, role?, category?, stepOnly? }` | A note over one participant or between two |
| `{ fragment, title?, messages, else?, id?, role?, category?, stepOnly? }` | `alt`, `opt`, `loop`, `par`, or another operator, around messages |
| `{ title?, messages }` | A branch in a fragment's `else` list |

- A message takes at most one of `reply` and `async`. A reply has a dashed line and an open arrowhead, and an async message an open arrowhead. `dashed: true` or `dashed: false` sets the line of any message.
- A reply returns to the participant that called. Its `from` is the callee and its `to` the caller, and the caller's call must still be open. Otherwise it is `REPLY_WITHOUT_CALL`: swap `from` and `to`, or remove `reply`.
- `id`, `role`, `category`, and `stepOnly` work as on shapes. A `stepOnly` message shows only in the steps that focus it, together with the activation bar it opens. A `stepOnly` note shows only in its steps. A `stepOnly` fragment shows its frame only in its steps; its messages are step-only only when they have `stepOnly` too.

| Option | Meaning |
|---|---|
| `gap` | Space between participants. Default: 40 |
| `rowHeight` | Vertical space per message. Default: 44 |
| `numbered` | Number the messages |
| `id` | The sequence's id. Default: `sequence-1`, `sequence-2`, and so on |

- The participants are ordinary shapes, laid out in a row by the sequence; time runs downward.
- `d.sequence` returns the column that holds the sequence, so you can place it like any other grid. The row of participants in it is the sequence's id followed by `-participants`, such as `sequence-1-participants`.
- Each participant's lifeline is its id followed by `-lifeline`, and its activation bars are `-active-1`, `-active-2`, and so on: `api-lifeline`, `api-active-1`. Steps leave lifelines and bars out.
- Keep each message label shorter than the space between its two lifelines, or widen `gap`.
