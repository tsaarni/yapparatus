# Charts

`<Chart>` draws a chart from data with [Observable Plot](https://observablehq.com/plot/). You write the marks. Yapparatus sets the size, fonts, margins, and colors, gives each category a theme color, and reports problems. The data is a table on the page, a block of CSV inside the chart, or a CSV or TSV file in an external directory.

## Example

````mdx
<Chart
  id="latency"
  caption="Latency of each request, by cache result."
  from="/-/files/app/logs/requests.csv"
  plot={(Plot, rows) => ({
    marks: [
      Plot.dot(rows, { x: "Time", y: "Latency (ms)", fill: "Cache" }),
      Plot.ruleY([300]),
      Plot.text([300], {
        y: (d) => d, frameAnchor: "right", textAnchor: "end", dy: -8, text: () => "300 ms target",
      }),
      Plot.ruleX([new Date("2026-03-14T10:04:00Z")]),
      Plot.text([new Date("2026-03-14T10:04:00Z")], {
        x: (d) => d, frameAnchor: "top", textAnchor: "end", dx: -6, text: () => "Deploy",
      }),
    ],
    x: { type: "utc" },
    y: { type: "log", grid: true },
  })}
/>
````

Each request is a dot on a time axis and a log scale, colored by a column of categories. A rule and a label show a target and an event. `id` and `caption` make a numbered figure. `description` is the accessible description. `node_modules/yapparatus/docs/design/charts.mdx` draws this chart and examples of the other forms.

Contents: Choosing a form · Data · Marks · Color

## Choosing a form

Draw a chart when the reader needs to compare numbers, see a trend, or see how values spread out. A single number or a short list stays in the text, and exact values belong in a `Table`.

| To show | Marks |
|---|---|
| A change over time | `Plot.lineY`, with `Plot.dot` on measured points |
| A noisy series as its trend | `Plot.lineY(rows, Plot.windowY({ k: 7 }, { x: "…", y: "…" }))` |
| Parts of a total over time | `Plot.areaY(rows, { x: "…", y: "…", fill: "…" })`, which stacks |
| Amounts by category | `Plot.barY`, or `Plot.barX` when the labels are long |
| Amounts per day, week, or month | `Plot.rectY(rows, { x: "…", y: "…", interval: "day" })`, not `Plot.barY` |
| Single events, such as requests | `Plot.dot` with a time `x`, and `y: { type: "log" }` for latencies |
| How two values relate | `Plot.dot` |
| How values spread | `Plot.rectY(rows, Plot.binX({ y: "count" }, { x: "…" }))` |
| How groups differ in spread | `Plot.boxY(rows, { x: "…", y: "…" })` |
| The same chart for each group | Any marks, with `fx: "…"` or `fy: "…"` |
| A threshold or a target | `Plot.ruleY([200])`, with `Plot.text` for its label |
| When something happened | `Plot.ruleX([new Date("…")])`, with `Plot.text` for its label |

## Data

Write the data in one of three places:

- **A `Table` on the page**, when the reader should see the numbers too: `from="#requests"` names `<Table id="requests">` on the same page, before or after the chart. The table stays shown, and the chart draws its rows.
- **A block of CSV** inside the chart, fenced as ```` ```csv ````, for numbers you write yourself. Leave a blank line after the opening tag and before the closing tag. A ```` ```tsv ```` block works too.
- **A file**, for numbers a tool produced or more than a few dozen rows: `from="/-/files/bench/results.csv"`. The file is a `.csv` or `.tsv` in an external directory that `document.json` names. Never copy a tool's numbers into the page. Files over 1 MB are not shown.

A chart has one source: a block or `from`, not both. A block's data is not shown; when the reader needs the exact numbers, put them in a `Table` and name it with `from`.

CSV follows RFC 4180: a cell that holds a comma, a quote, or a line break is quoted, as in `"Smith, J"`, with quotes inside doubled. The first row, or a table's header, names the columns. `plot` uses the names as fields, and the axes use them as labels, so put the unit in the name: `p99 (ms)`. Names must be unique.

Each column gets one type from all of its cells:

| Cells | Type | In `rows` |
|---|---|---|
| Plain numbers: `1200`, `-0.5`, `1e3` | number | number |
| ISO dates: `2026-01`, `2026-01-31`, `2026-01-31T10:00` | date | `Date` |
| Anything else | text | string |

An empty cell is `null`. A column that mixes numbers or dates with other text is an error, such as `12 ms` in a column of numbers, or `1,200`. Write `12` and put `ms` in the column name.

## Marks

`plot` receives the Plot library and the rows, and returns the marks:

```js
plot={(Plot, rows) => ({
  marks: [Plot.barY(rows, { x: "Service", y: "Requests" }), Plot.ruleY([0])],
  y: { grid: true },
})}
```

- Every mark and transform of Plot works: `Plot.dot(rows, …)`, `Plot.boxY(rows, …)`, `Plot.areaY(rows, …)`, and transforms such as `Plot.groupX`, `Plot.binX`, and `Plot.windowY`. A mark can also take its own array, as `Plot.ruleY([300])` does.
- A field option names a column exactly as its header is written: `y: "p99 (ms)"`.
- `plot` may also return `x`, `y`, `fx`, `fy`, and `r`: the options of those scales, such as `{ type: "log" }`, `{ type: "utc" }` for times written with `Z`, `{ grid: true }`, `{ label: "…" }`, `{ ticks: 5 }`, or `{ tickRotate: -30 }`. Use `fx` or `fy` to split a chart into small multiples.
- Tick labels must not overlap, at the page's full width or on a phone: give many or long ones fewer `ticks` or a `tickRotate`, or put long category names on `y`. Overlap is a `CHART_OVERLAP` warning; one that only a phone has names its width.
- Plot's own warnings, such as dates on a band scale, are `CHART_WARNING`: do what the message says. Bars on dates are `Plot.rectY` with `interval: "day"`, because `Plot.barY` makes each date a category.
- Draw thousands of rows with a transform, such as `Plot.binX` or `Plot.windowY`: each mark is an element on the page.
- `plot` returns only marks and scale options, and does not call `Plot.plot` or `Plot.legend`: Yapparatus sets the size, margins, fonts, and colors. It uses only `Plot`, `rows`, and values written inside it, and it and the drawing of its marks finish within 1 second.

## Color

- **Set `fill` or `stroke` to a column of categories** to color by it: `stroke: "Service"`. Categories take the theme's four category colors in the order the rows first use them, and a legend under the chart names them.
- **Four categories at most.** More are drawn in a muted color and reported. Give `fill` or `stroke` a column with fewer values, or split the chart with `fx`.
- **Color shows categories, not amounts.** A column of numbers in `fill` or `stroke` becomes one category for each value. Show amounts by position or size, with `y` or `r`.
- **No literal colors.** `fill: "tomato"` or `stroke: "#f00"` is an error, because colors come from the theme. A mark without `fill` or `stroke` is drawn in the text color.
