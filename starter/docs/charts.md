# Charts

`<Chart>` draws a chart from data with [Observable Plot](https://observablehq.com/plot/). You write the marks; the chart sets its size, fonts, margins, and colors, gives each category a theme color, and reports problems. The data is a table on the page, a block of CSV inside the chart, or a CSV or TSV file in an external directory.

## Example

````mdx
<Chart id="latency" caption="p99 latency per service." plot={(Plot, rows) => ({
  marks: [
    Plot.lineY(rows, { x: "Month", y: "p99 (ms)", stroke: "Service" }),
    Plot.dot(rows, { x: "Month", y: "p99 (ms)", fill: "Service" }),
  ],
})}>

```csv
Month,Service,p99 (ms)
2026-01,Search,90
2026-02,Search,95
2026-01,Checkout,180
2026-02,Checkout,240
```

</Chart>
````

`id` and `caption` make a numbered figure. `description` is the accessible description.

## Choosing a form

Draw a chart when the reader needs to compare numbers, see a trend, or see how values spread out. A single number or a short list stays in the text, and exact values belong in a `Table`.

| To show | Marks |
|---|---|
| A change over time | `Plot.lineY`, with `Plot.dot` on measured points |
| Amounts by category | `Plot.barY`, or `Plot.barX` when the labels are long |
| How two values relate | `Plot.dot` |
| How values spread | `Plot.rectY(rows, Plot.binX({ y: "count" }, { x: "…" }))` |
| A threshold or a target | `Plot.ruleY([200])` |

## Data

Write the data in one of three places:

- **A `Table` on the page**, when the reader should see the numbers too: `from="#requests"` names `<Table id="requests">` on the same page, before or after the chart. The table stays shown, and the chart draws its rows.
- **A block of CSV** inside the chart, fenced as ```` ```csv ````, for numbers you write yourself. Leave a blank line after the opening tag and before the closing tag. A ```` ```tsv ```` block works too.
- **A file**, for numbers a tool produced or more than a few dozen rows: `from="/-/files/bench/results.csv"`. The file is a `.csv` or `.tsv` in an external directory; see [external files](guide.md#external-files). Never copy a tool's numbers into the page. The page holds none of the file's rows, and the chart loads them when the reader scrolls near it, so a large file does not slow the page. An edit to the file redraws the chart. Files over 1 MB are not shown.

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

- Draw with marks from the rows: `Plot.dot(rows, …)`, `Plot.lineY(rows, …)`, `Plot.barY(rows, …)`. Transforms such as `Plot.groupX` and `Plot.binX` work too.
- A field option names a column exactly as its header is written: `y: "p99 (ms)"`. A name that is not a column is an error that lists the columns.
- `plot` may also return `x`, `y`, `fx`, `fy`, and `r`: the options of those scales, such as `{ type: "log" }`, `{ grid: true }`, `{ label: "…" }`, `{ ticks: 5 }`, or `{ tickRotate: -30 }`. Use `fx` or `fy` to split a chart into small multiples.
- The chart sets the width, height, margins, fonts, and colors. `plot` returns nothing else, and does not call `Plot.plot` or `Plot.legend`.
- `plot` uses only `Plot`, `rows`, and values written inside it.

## Color

- **Set `fill` or `stroke` to a column of categories** to color by it: `stroke: "Service"`. Categories take the theme's four category colors in the order the rows first use them, and a legend under the chart names them.
- **Four categories at most.** More are drawn in a muted color and reported. Give `fill` or `stroke` a column with fewer values, or split the chart with `fx`.
- **No literal colors.** `fill: "tomato"` or `stroke: "#f00"` is an error, because the theme picks colors. A mark without `fill` or `stroke` is drawn in the text color.

## Many rows

Draw thousands of rows with a transform, such as `Plot.binX` or `Plot.windowY`, rather than one mark per row: each mark is an element on the page.

A reader asks about a chart as a whole, like any figure.

## Diagnostics

Data problems are found when the page is compiled and reported with their line in the page, or in the file. Problems with the marks are found when a browser shows the page.

| Code | Severity | Meaning |
|---|---|---|
| `CHART_PLOT` | error | The chart has no `plot` function |
| `CHART_DATA` | error | The data is missing, comes from two places, names no table on the page, is not in a known format, has a column problem, or could not load |
| `CHART_FIELD` | error | A mark names a field that is not a column of its data |
| `CHART_COLOR` | error | A mark sets a literal color |
| `CHART_OPTION` | error | `plot` returns options the chart sets itself, or calls `Plot.plot` |
| `CHART_FAILED` | error | Plot could not draw the marks; the message is Plot's |
| `TOO_MANY_CATEGORIES` | warning | More than four categories |
| `CHART_OVERLAP` | warning | Tick labels on one axis overlap; show fewer ticks, rotate them, or swap the axes |

A chart that fails keeps showing its last valid drawing, dimmed, above the errors.
