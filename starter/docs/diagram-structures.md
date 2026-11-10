# Structures

Records and marked text: tables, types, protocol headers, registers, arrays, linked data, and highlighted code. Read [diagrams.md](diagrams.md) first; this page adds `d.record`, `marks`, and members.

Copy the example closest to your figure, then change the labels.

## A table with foreign keys

```js
const orders = d.record([
  "id\tuuid\tPK",
  ["user_id\tuuid\tFK", { role: "accent" }],
  "total\tnumeric",
], { title: "orders", header: "column\ttype\tkey", mono: true })
const users = d.record([
  "id\tuuid\tPK",
  "email\ttext",
  ["team_id\tuuid\tFK", { category: "New" }],
], { title: "users", header: "column\ttype\tkey", mono: true })
const teams = d.record(["id\tuuid\tPK", "name\ttext"], { title: "teams", header: "column\ttype\tkey", mono: true, category: "New" })
d.row([orders, users, teams], { gap: 80, align: "start" })
d.arrow(orders.part("user-id"), users.part("id"))
d.arrow(users.part("team-id"), teams.part("id"))
```

- One string per row. Tabs separate the columns, and line up across the record and its `header`.
- A row's id is its first column: `"user_id\tuuid"` → `orders.user-id`.
- Edges between rows leave and enter the rows' sides. Put the tables in a `row` with `align: "start"`.

## A protocol header

```js
const tcp = d.record([
  ["Source port", 16], ["Destination port", 16],
  ["Sequence number", 32],
  ["Acknowledgment number", 32],
  ["Off", 4], ["Rsv", 4], ["Flags", { span: 8, pin: 1, category: "Changed" }], ["Window", 16],
  ["Checksum", 16], ["Urgent pointer", 16],
  ["Options (variable length)", 32],
], { title: "TCP header", columns: 32, ruler: { top: (i) => (i % 8 ? "" : i), left: (row) => row * 4 }, id: "tcp" })
const flags = d.note("1  CWR and ECE signal congestion")
const options = d.note("Up to 40 bytes")
d.place(d.row([flags, options], { gap: 40 }), { below: tcp, gap: 40 })
d.arrow(options, tcp.part("options-variable-length"))
```

- `columns` is the row width in bits; `[label, span]` is a field and its width.
- A field fits the rest of its row, or starts a row and covers whole rows: a 128-bit address in a 32-bit header is `["Source address", 128]`, four rows tall. Split a field that crosses a row.
- `ruler.top` numbers bits; `ruler.left` gives each row's byte offset. Return `""` to skip a label.
- An inner field has no free side for an arrow. Pin it, `pin: 1`, and start the note with the number. Point arrows only at fields on the outline, such as the last row.

## A register

```js
d.record([
  ["Reserved", { span: 4, role: "muted" }], ["Mode", 2], ["IE", 1], ["Busy", 1],
], { title: "STATUS", columns: 8, ruler: { top: (i) => 7 - i } })
```

- Data sheets number bits from the most significant: `(i) => 7 - i`.
- `role: "muted"` steps reserved bits back.

## An array, a list, a hash table

```js
const buckets = d.record(["0", "1", "2", "3", "4", "5", "6", "7"], { title: "buckets", columns: 8, mono: true })
const ant = d.record(["key: \"ant\"", "next"], { title: "entry", mono: true })
const cat = d.record(["key: \"cat\"", "next"], { title: "entry", mono: true, category: "Collision" })
const bee = d.record(["key: \"bee\"", "next"], { title: "entry", mono: true })
d.place(d.row([ant, cat, bee], { gap: 40, align: "start" }), { below: buckets, gap: 56 })
d.arrow(buckets.part("2"), ant)
d.arrow(buckets.part("6"), bee)
d.arrow(ant.part("next"), cat.part("key-cat"))
```

- An array is a record with one row of `columns` cells. A slot points from its bottom.
- Records with the same title get ids `entry`, `entry-2`, `entry-3`; their cells follow: `entry-2.next`.
- Number slots by their labels, as here, or with `ruler: { top: (i) => i }` and empty cells.

## Marked text

```js
const req = d.text("GET /users/42?fields=name HTTP/1.1\nHost: api.example.com\nAuthorization: Bearer eyJhbGciOi…", {
  mono: true,
  id: "req",
  marks: {
    path: { text: "/users/42", role: "accent" },
    host: { text: "api.example.com", category: "Picks the site" },
    auth: { lines: "3", category: "Credential" },
  },
})
const routing = d.note("Routes to a\nvirtual host")
const secret = d.note("Never logged")
d.place(routing, { rightOf: req, gap: 64, align: "start" })
d.place(secret, { below: routing, gap: 24 })
d.arrow(routing, req.part("host"))
d.arrow(secret, req.part("auth"))
```

- A mark is a substring that occurs once, or whole lines: `{ lines: "3" }`, `{ lines: "2-4" }`, counted from 1.
- A string is the substring: `path: "/users/42"`.
- `mono` text keeps its lines' start, like code. Other text is centered, and its marks follow.
- Mark a longer substring, or the lines, when the text repeats.

## Reference

### Cells

| Cell | Meaning |
|---|---|
| `"label"` | One column |
| `["label", span]` | `span` columns |
| `["label", { span, id, role, category, stepOnly, pin }]` | With options; `span` defaults to 1 |

### Record options

| Option | Meaning |
|---|---|
| `title` | A title over the cells. Without one, give the record an `id` |
| `columns` | Grid columns. Cells fill them left to right. Default: 1, one cell per row |
| `header` | Column names over the cells, tab-separated like the cells |
| `ruler` | `{ top: (column) => label, left: (row) => label }`. An empty label is skipped |
| `mono`, `role`, `category`, `width`, `id` | As on other shapes |

A header names the columns of a table; a ruler numbers positions. Neither is a cell.

### Members

A record's cells and a text's marks are members. A member is a part like any other: edges attach to it, steps focus it, and it takes `role` and `category`.

- `shape.part(id)` returns a member by its own id. A wrong id is reported with the valid ones, and the shape stands in.
- A member's id is its parent's, a dot, and its own: `users.team-id`, `req.path`. Its own id comes from its label (a cell's first tab column), from a mark's name, or from `id`.
- An edge leaves a cell from the middle of a side on the record's outline: the side that a line from the cell's center toward the other end crosses first. A wide field takes its bottom for a note below it, even one off to the side.
- `<Step focus="users">` focuses the record and its cells; `<Step focus="users.team-id">` focuses one cell and fades the rest.

### Diagnostics

`CELL_SPAN`, `MARK_UNMATCHED`, `RULER_CROWDED`, and `UNKNOWN_PART`; see [the table](diagrams.md#diagnostics).
