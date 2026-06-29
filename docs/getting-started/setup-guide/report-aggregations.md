# Report Aggregations and Totals

Summarize Data Mart data directly in a report — group by dimensions, apply aggregate functions to metrics, bucket dates, and get grand totals — without writing any SQL. OWOX builds the correct `GROUP BY` query for your storage and returns compact, ready-to-read numbers instead of raw rows.

> 💡 Aggregation runs **server-side in your data warehouse**, so the report returns one row per dimension combination (plus a separate totals block) rather than every underlying row. This keeps results small enough for Google Sheets and AI tools, and every number is backed by a query — nothing is recomputed downstream.

## What You Can Do

- Apply aggregate functions (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, percentiles, and more) to a column.
- Apply **more than one** function to the same column — each becomes its own output column.
- **Group by** the remaining columns automatically (every non-aggregated selected column becomes a grouping key).
- **Bucket a date/timestamp** by day, week, month, quarter, or year (with an optional time zone).
- Add a **Unique count** metric (`COUNT(DISTINCT primary key)`).
- Get **Totals** for every numeric field — each by all of its allowed functions — returned as a separate block.
- Govern, at the Data Mart level, which functions each field may use.

Works across all supported storages: **BigQuery, Athena, Snowflake, Redshift, and Databricks**.

## How It Works

An aggregated report follows a simple "group by all" rule:

- Any selected column **with** an aggregate function is a **metric** (it is collapsed by that function).
- Any selected column **without** a function is a **dimension** (it becomes a `GROUP BY` key).

So selecting `date`, `source`, and `sessionId` with `COUNT_DISTINCT` on `sessionId` produces one row per `date` + `source` combination, with the distinct session count per group — the same result you'd write by hand as `SELECT date, source, COUNT(DISTINCT sessionId) ... GROUP BY date, source`.

## Prerequisites

- A Data Mart whose schema is actualized (field types are known).
- A report on that Data Mart (for example, a Google Sheets or Looker Studio report).
- Output controls are available for the Data Mart's storage type (all five supported storages qualify).

## Data Mart Level: Roles and Allowed Aggregations

On the Data Mart's schema, each field carries a **role** and an **allowed-aggregations** set that govern what report builders may do with it:

- **Role (dimension or metric)** is derived from the field type by default — numeric fields default to *metric*, everything else to *dimension*. A field is either a grouping key or an aggregated metric in any given report.
- **Allowed aggregations** is the set of functions a report may apply to the field. The **Allowed aggregations** selector on the field row offers only the functions **supported** for that field type, with a sensible **default** subset pre-selected; you can **narrow the set per field, or turn aggregation off entirely**.

The supported menu and on-by-default subset per type:

| Field type      | Default (on)            | Also available                                  |
| --------------- | ----------------------- | ----------------------------------------------- |
| Numeric         | `SUM`, `AVG`, `MIN`, `MAX` | percentiles (`P25`/`P50`/`P75`/`P95`), `ANY_VALUE` |
| Date / time     | `MIN`, `MAX`            | `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`, `ANY_VALUE` |
| Text            | `COUNT`, `COUNT_DISTINCT` | `MIN`, `MAX`, `STRING_AGG`, `ANY_VALUE`        |
| Boolean / other | `COUNT`, `COUNT_DISTINCT` | `ANY_VALUE`                                    |

Note that `COUNT` / `COUNT_DISTINCT` are not offered for numeric fields, and `SUM` / `AVG` / percentiles are not offered for non-numeric fields. A report can only request a function the field allows.

<!-- TODO(screenshot): Data Mart schema field row showing the "Allowed aggregations" selector open, with some functions checked and the "off all" state — illustrates per-field governance. -->

## Report Level: Aggregate a Column

In the report's **Columns** picker, each eligible field shows a Σ (aggregation) control. Open it to choose one or more functions for that column. Aggregated columns are named `<column> | <TOKEN>` — the column name followed by an uppercase, spreadsheet-style function token — so the output is self-describing:

> `revenue` with `SUM` → output column **`revenue | SUM`**

<!-- TODO(screenshot): Report Columns picker with the Σ aggregation control open on a metric field (e.g. revenue), showing the function list — illustrates applying an aggregation at report level. -->

### Aggregate Function Reference

The **Output label** is the function's display name in the UI; the **Column token** is the uppercase suffix in the output column name (`<column> | <TOKEN>`).

| Function         | Output label          | Column token        | Returns       | Use when                                                   |
| ---------------- | --------------------- | ------------------- | ------------- | ---------------------------------------------------------- |
| `SUM`            | Sum                   | `SUM`               | numeric       | Total a numeric metric (revenue, spend).                   |
| `AVG`            | Average               | `AVG`               | float         | Average a numeric metric.                                  |
| `MIN` / `MAX`    | Min / Max             | `MIN` / `MAX`       | original type | Smallest/largest value, or earliest/latest date.          |
| `COUNT`          | Count                 | `COUNT`             | integer       | Number of rows in the group.                               |
| `COUNT_DISTINCT` | Count Unique          | `COUNTUNIQUE`       | integer       | Number of unique values (e.g., distinct sessions).         |
| `STRING_AGG`     | Combined              | `STRINGAGG`         | string        | Concatenate text values into one comma-separated list.     |
| `ANY_VALUE`      | Sample                | `ANYVALUE`          | original type | A single representative value (cheaper than `STRING_AGG`). |
| `P25` / `P50` / `P75` / `P95` | 25th Percentile / Median / 75th Percentile / 95th Percentile | `P25` / `MEDIAN` / `P75` / `P95` | float | Distribution percentiles of a numeric metric. |

Which functions appear depends on the field type and the Data Mart's **allowed aggregations** for that field.

## Multiple Aggregations per Column

You can apply several functions to one column — for example `SUM` and `AVG` of `amount`. Each function produces its own output column (`amount | SUM`, `amount | AVG`), so you can compare them side by side in a single report.

<!-- TODO(screenshot): a column with two aggregations applied (SUM + AVG), showing the two resulting output-column chips/labels. -->

## Group By (Dimensions)

Grouping is implicit: every selected column that has **no** aggregation becomes a `GROUP BY` key. There is no separate "group by" toggle — pick the dimensions you want as plain columns and aggregate the rest. If you select only metrics (no dimensions), the report collapses to a single grand-total row.

## Date Bucketing

To answer questions like *"revenue by month"* or *"sessions by week"*, bucket a date or timestamp dimension instead of grouping by the raw (daily) value. Choose a granularity — **Day, Week, Month, Quarter, or Year** — for the date column. For **timestamp/datetime** columns you can optionally set an **IANA time zone** (for example, `America/New_York`) so values are converted to that zone before truncation; without one, no conversion is applied. (Pure `DATE` columns have no time-of-day, so no time zone applies.)

<!-- TODO(screenshot): date-bucketing control on a date/timestamp column showing the granularity options (Day/Week/Month/Quarter/Year) and the optional time-zone field. -->

## Unique Count

The **Unique count** row (at the bottom of the Data Mart's field list) adds a `COUNT(DISTINCT <primary key>)` metric to the report. It counts unique entities by the Data Mart's primary key, including composite keys.

> ⚠️ Unique count requires the Data Mart to have a primary key. If no primary key is defined, the option is not offered.

<!-- TODO(screenshot): the "Unique count" row at the bottom of the Data Mart field list, checked, with the Σ indicator. -->

## Auto Row Count

Whenever a report is aggregated, OWOX automatically adds a **`Row Count`** column (`COUNT(*)`) — the number of underlying rows in each group. There is no toggle; it is included because it is almost always useful when reading aggregated output.

## Totals

**Totals** are a per-column summary over the full filtered dataset, with no grouping. Every selected **numeric** field is aggregated by **all of its allowed functions** — for example `Sum`, `Average`, `Min`, and `Max` of `revenue`. Totals are computed **in the warehouse** by a separate query and returned as a **separate block**, so they stay accurate and are never recomputed from the displayed rows.

Totals are produced even when the report itself is not grouped, and they cover numeric fields from joined Data Marts as well. `Row Count` and `Unique count` are not part of Totals.

<!-- TODO(screenshot): report output (e.g. Google Sheets) showing the grouped rows plus the separate grand-totals block/row. -->

## View Generated SQL

The SQL OWOX builds for an aggregated report is fully transparent — preview it from the report to see the exact `GROUP BY`, aggregate expressions, and date-truncation per your storage dialect, or copy it into a standalone SQL-based Data Mart.

## Limitations and Considerations

- A field is either a dimension or an aggregated metric within a single report — not both.
- Aggregated and date-bucketed reports require an explicit column selection (the columns to group by and aggregate).
- Conditional aggregation (`COUNT(DISTINCT … WHERE …)`) and pivoting values into columns are not supported — model these as pre-aggregated Data Marts instead.
- A date bucket's time zone affects only the bucketing. Date **filters** on the same field are evaluated in the warehouse's session time zone, so rows near midnight can land on different sides of a bucket boundary than of a filter boundary. Keep this in mind when combining a non-session time-zone bucket with a date filter on the same field.
- Percentiles (`P25`/`P50`/`P75`/`P95`) are **approximate** on BigQuery and Athena and **exact** (continuous-interpolated) on Redshift, Snowflake, and Databricks, so the same percentile can differ slightly between storages.
- For joined Data Marts, report-level aggregation is applied **on top of** the join roll-up; see [Joinable Data Marts](./joinable-data-marts.md).

## Related Links

- [Joinable Data Marts](./joinable-data-marts.md) — combine and aggregate fields from multiple Data Marts.
- [Table-based Data Mart](./table-data-mart.md) — define the schema (and primary key) aggregation builds on.
- [MCP Server](./mcp.md) — query Data Marts (including aggregated output) from AI tools.
