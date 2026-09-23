# Report Aggregations and Totals

Summarize Data Mart data directly in a report — group by dimensions, apply aggregate functions to metrics, bucket dates, and get grand totals — without writing any SQL. OWOX builds the correct `GROUP BY` query for your storage and returns compact, ready-to-read numbers instead of raw rows.

> 💡 Aggregation runs **server-side in your data warehouse**, so the report returns one row per dimension combination (plus a separate totals block via the data API) rather than every underlying row. This keeps results small enough for Google Sheets and AI tools, and every number is backed by a query — nothing is recomputed downstream.

## What You Can Do

- Apply aggregate functions (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, percentiles, and more) to a column.
- Apply **more than one** function to the same column — each becomes its own output column.
- **Group by** the remaining columns automatically (every non-aggregated selected column becomes a grouping key).
- **Bucket a date/timestamp** by day, week, month, quarter, or year (with an optional time zone).
- Add a **Unique Count** metric (`COUNT(DISTINCT primary key)`) — for the report's own Data Mart and for each joined one.
- Get **Totals** for numeric fields and any aggregated metric — each by its allowed functions — returned as a separate block.
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

- **Role (dimension or metric)** is derived from the field type by default — numeric fields default to _metric_, everything else to _dimension_. A field is either a grouping key or an aggregated metric in any given report.
- **Allowed aggregations** is the set of functions a report may apply to the field. The **Allowed aggregations** selector on the field row offers only the functions **supported** for that field type, with a sensible **default** subset pre-selected; you can **narrow the set per field, or turn aggregation off entirely**.

The supported menu and on-by-default subset per type:

| Field type                                | Default (on)                                         | Also available                                       |
| ----------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Numeric                                   | `SUM`, `AVG`, `MIN`, `MAX`                           | percentiles (`P25`/`P50`/`P75`/`P95`), `ANY_VALUE`   |
| Date / time                               | `MIN`, `MAX`                                         | `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`, `ANY_VALUE` |
| Text                                      | `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`, `ANY_VALUE` | `MIN`, `MAX`                                         |
| Boolean                                   | `COUNT`, `COUNT_DISTINCT`                            | `ANY_VALUE`                                          |
| Other (JSON, geography, array, struct, …) | `COUNT`                                              | `ANY_VALUE`                                          |

Note that `COUNT` / `COUNT_DISTINCT` are not offered for numeric fields, and `SUM` / `AVG` / percentiles are not offered for non-numeric fields. A report can only request a function the field allows.

![Data Mart "CRM Data" on the Data Setup tab with the Output Schema section expanded. The field table has Name, Type, Mode, PK, and a "Σ available" column; an arrow points to the "available" header. The order_timestamp (TIMESTAMP) row has its allowed-aggregations dropdown open, showing MIN and MAX checked with ANY_VALUE, COUNT, COUNT_DISTINCT, and STRING_AGG also available.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/b87a0c7b-4012-4063-79cd-f7e5081ccc00/public)

## Report Level: Aggregate a Column

In the report's **Columns** picker, each eligible field shows a Σ (aggregation) control. Open it to choose one or more functions for that column. Aggregated columns are named `<column> | <TOKEN>` — the column name followed by an uppercase, spreadsheet-style function token — so the output is self-describing:

> `revenue` with `SUM` → output column **`revenue | SUM`**

![Google Sheets report with the OWOX Data Marts side panel open. The AGGREGATIONS list shows one entry — order_id aggregated by Max — and the order_id column row carries a Σ icon. An arrow points to the resulting "order_id | MAX" output column header in the sheet.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4969dedd-fb39-4b3a-cb3d-7f489423aa00/public)

### Aggregate Function Reference

The **Output label** is the function's display name in the UI; the **Column token** is the uppercase suffix in the output column name (`<column> | <TOKEN>`).

| Function                      | Output label                                                 | Column token                     | Returns       | Use when                                                   |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------- | ------------- | ---------------------------------------------------------- |
| `SUM`                         | Sum                                                          | `SUM`                            | numeric       | Total a numeric metric (revenue, spend).                   |
| `AVG`                         | Average                                                      | `AVG`                            | float         | Average a numeric metric.                                  |
| `MIN` / `MAX`                 | Min / Max                                                    | `MIN` / `MAX`                    | original type | Smallest/largest value, or earliest/latest date.           |
| `COUNT`                       | Count                                                        | `COUNT`                          | integer       | Number of rows in the group.                               |
| `COUNT_DISTINCT`              | Count Unique                                                 | `COUNTUNIQUE`                    | integer       | Number of unique values (e.g., distinct sessions).         |
| `STRING_AGG`                  | Combined                                                     | `STRINGAGG`                      | string        | Concatenate text values into one comma-separated list.     |
| `ANY_VALUE`                   | Sample                                                       | `ANYVALUE`                       | original type | A single representative value (cheaper than `STRING_AGG`). |
| `P25` / `P50` / `P75` / `P95` | 25th Percentile / Median / 75th Percentile / 95th Percentile | `P25` / `MEDIAN` / `P75` / `P95` | float         | Distribution percentiles of a numeric metric.              |

Which functions appear depends on the field type and the Data Mart's **allowed aggregations** for that field.

## Multiple Aggregations per Column

You can apply several functions to one column — for example `SUM` and `AVG` of `amount`. Each function produces its own output column (`amount | SUM`, `amount | AVG`), so you can compare them side by side in a single report.

![Google Sheets report with the OWOX Data Marts side panel open. The AGGREGATIONS list shows four entries for the revenue field — aggregated by Sum, Average, Min, and Max. The sheet shows corresponding output columns revenue | SUM, revenue | AVG, revenue | MIN, and revenue | MAX with matching values in each row.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d6c5e5e2-e570-4501-9f6d-8ee1f9903e00/public)

## Group By (Dimensions)

Grouping is implicit: every selected column that has **no** aggregation becomes a `GROUP BY` key. There is no separate "group by" toggle — pick the dimensions you want as plain columns and aggregate the rest. If you select only metrics (no dimensions), the report collapses to a single grand-total row.

## Automatic Aggregation (No Aggregation Chosen)

A report with an explicit column selection but **no** aggregation, date bucket, or Unique Count set anywhere can still return duplicate rows — most commonly when a join fans a source row out across several joined rows, or a [calculated field](./calculated-fields.md) formula is row-level. OWOX now closes that gap on its own, without you adding anything:

- If every selected column is a **dimension**, OWOX returns the projection **distinct** — the same rows, de-duplicated, with no `GROUP BY` and no relabeled columns.
- If the selection includes at least one **metric** column, OWOX groups by the remaining dimensions and applies the **first aggregation the column's allowed-aggregations set permits**, in this fixed priority order:

  | Field type     | Priority order                |
  | -------------- | ----------------------------- |
  | Numeric        | `SUM` → `AVG` → `MIN` → `MAX` |
  | Date / Time    | `MIN` → `MAX`                 |
  | String         | `MIN` → `MAX`, but see below  |
  | Boolean, Other | never auto-aggregated         |

  This draws from the same [supported menu](#data-mart-level-roles-and-allowed-aggregations) as manual aggregation, so a function narrowed away at the Data Mart level is skipped in favor of the next one in priority order for that type. A **text** field marked as a metric is the case to watch. Its DEFAULT allowed set is `COUNT`, `COUNT DISTINCT`, `STRING_AGG`, and `ANY VALUE` — none of which returns the column you selected — so under those defaults nothing is applied and the report is left uncollapsed. Explicitly allowing `MIN` or `MAX` on that field opts it back in, and the column is then delivered as `country | MIN`.

- A **row-level calculated formula** on a selected column may be rewritten to its group-level equivalent instead of becoming a `GROUP BY` key, when OWOX can prove the rewrite returns the same value the row-level formula would have summed to. See [When a calculated formula is lifted](#when-a-calculated-formula-is-lifted) below.

An auto-applied aggregation relabels its column exactly like a manually chosen one: `sessions` becomes **`sessions | SUM`** in the delivered output, the same `<column> | <TOKEN>` naming [described above](#report-level-aggregate-a-column). If a downstream formula or binding reads the plain `sessions` header, it stops resolving once the report starts auto-aggregating — a Google Sheets formula, a Looker Studio binding, or a formula in the Excel workbook the add-in refreshes. Worth checking after upgrading a report that used to return duplicates.

**The editor fills the rule in rather than only predicting it.** Open a report that sets no aggregation and the function is already there: ticked on the column, counted on the **Aggregations** button, listed in the panel — and changed or removed like any rule you picked yourself. A note above the panel names the columns OWOX chose for while the choice is fresh, and the rule is saved with the report the next time you save it.

**Removing an aggregation is remembered.** What you keep is what runs: remove two of five automatic aggregations and the report runs with the other three. Remove all of them and the report returns its rows exactly as stored — no aggregation and no `DISTINCT` — on every save, run, and reopen, instead of OWOX choosing again. Adding an aggregation back to a column makes it a rule you chose and clears that column's removal. Taking the column out of the report clears it too. Once no selected column has a removed aggregation, OWOX chooses automatic aggregations again.

The **Aggregations** button also carries a small dot for the columns OWOX chose for; the tooltip and screen-reader text name each one ("Automatic aggregations applied for fields: …"). The dot clears itself the first time you hover it and does not return for that editing session. Run history for the report records which columns were auto-aggregated — including an Excel report refreshed from the add-in — and whichever way the report collapsed, the executed SQL stored with the run shows it.

> This applies wherever the report is **delivered** — a scheduled or manual Google Sheets, email, Slack, Teams, or Google Chat run, an MCP "run report" call against a saved report, and the **Microsoft Excel** add-in's own fetch, which is how an Excel report reaches its reader. It does **not** apply to ad-hoc queries: **HTTP Data**, the MCP `query_data_mart` tool, `apps/ctl`, the Looker Studio cache-fill query, "copy as Data Mart", and the report's save-time dry run all keep returning exactly what you asked for, duplicates included — including pulling a Google Sheets report over HTTP Data, where the caller is a third party rather than the report's reader. **Looker Studio** is the one destination left out entirely, because its connector reads the report over exactly those ad-hoc paths; see the exclusion list below.

### When a Calculated Formula Is Lifted

A [row-level calculated field](./calculated-fields.md) — one whose formula reads as an ordinary column, such as `{{quantity}} * {{unit_price}}` — would ordinarily become a `GROUP BY` key like any other dimension, so the report keeps one row per distinct formula value rather than collapsing the duplicates a plain projection would return. When OWOX can prove the formula is safe to recompute at the group level instead, it rewrites it once for that report and treats it as a metric there — the field's own schema, level, and declared allowed-aggregations are untouched.

"Safe" means a strict, provable rewrite, never a best guess. OWOX only lifts a formula built from `+`, `-`, `*`, `/`, references whose own allowed-aggregations set permits `SUM`, and the two division helpers `NULLIF(<denominator>, 0)` and `SAFE_DIVIDE(a, b)` in that position and no other — and only where no division's divisor holds a reference except at the formula's own top-level ratio. `{{revenue}} / {{cost}}` lifts to `SUM(revenue) / SUM(cost)` — the true group ratio, recomputed correctly rather than averaged row by row. Anything OWOX cannot prove distributes this way keeps the field as a `GROUP BY` key instead of guessing; the next section lists exactly what that excludes.

Where the rewrite puts its `SUM` depends on whether the formula divides **by another column**, and empty values are what decides it. A formula whose divisors are all fixed numbers is summed as a whole — `{{revenue}} - {{cost}}` becomes `SUM({{revenue}} - {{cost}})`, and so does `({{revenue}} - {{cost}}) / 2`, which divides but only by a constant and so scales exactly like `* 0.5` — so the collapsed report totals exactly the values the uncollapsed one displayed, including rows where one side was empty and the whole cell was therefore empty. A formula that divides by another column has each of its references summed instead, because summing a column of row-by-row ratios is not the group's ratio. That form deliberately reads a numerator whose denominator is empty: `SUM(revenue) / SUM(cost)` is the ratio of the two totals, which is what a collapsed ratio means, even though the row it came from showed no value.

### When automatic aggregation does not apply

OWOX leaves the report exactly as you built it — duplicates and all — whenever any of the following is true, so a report never changes behavior it wasn't given a labeled aggregation for:

- **You removed an aggregation from a column the report still selects.** The report returns its rows exactly as stored. Adding an aggregation back makes it a rule you chose rather than an automatic one; taking the column out of the report clears the removal.
- **An aggregation, date bucket, or Unique Count is already set anywhere in the report.** Automatic aggregation only fills in a report the analyst left fully unaggregated; it never overrides or adds to an explicit choice.
- **A filter targets an aggregate-level calculated field.** Filtering on one — even without selecting it — already puts the report on the grouped query, exactly as selecting it does, so it is an explicit choice in the sense of the bullet above.
- **There is no explicit column selection.** A report with no columns picked runs as `SELECT *` and is unaffected, the same as every other output control that requires a selection.
- **A sort rule names a column the report does not display.** An ungrouped report may legitimately be ordered by a column it never prints, and OWOX keeps offering that. Neither collapsed shape can express it, so the whole report is left uncollapsed rather than have its row order quietly changed.
- **A sort rule names a numeric calculated dimension, and the report has no metric to aggregate.** Such a report would collapse to a plain `DISTINCT`, and a sort on a calculated field of a number type is ordered by the formula rewritten with a type cast rather than by the output column name — an expression the `DISTINCT` list does not contain, which BigQuery, Athena, and Redshift all reject. The report ran fine before it would have collapsed, so the collapse is what gives way.
- **The report's destination is Looker Studio.** A Looker Studio report is never run by OWOX — the connector reads it over the same ad-hoc paths listed above, the way any other caller does — so it keeps returning every underlying row, exactly as before. **Microsoft Excel** pulls its own data too, but the add-in is the report's reader rather than a third party, so an Excel report collapses exactly like a Google Sheets one.
- **A selected column's type cannot be a `GROUP BY` key.** JSON, ARRAY, STRUCT, and GEOGRAPHY columns — the "Other" row in the table above — are never grouped or auto-aggregated.
- **The report selects a joined column.** A column belonging to a joined Data Mart rather than the report's own cannot be read as a dimension or a metric from the report's own schema. Grouping by a joined metric would drop its duplicate rows and move its total just as aggregating it wrongly would, so the whole report is left alone. Joined fields are a separate piece of work.
- **The metric has no aggregation OWOX may apply automatically.** The automatic pick only chooses from the aggregations a field's governance already allows. A **text** field marked as a metric is the case you are most likely to meet: its default allowed set is `COUNT`, `COUNT DISTINCT`, `STRING_AGG`, and `ANY VALUE`, and none of those returns the column you selected — so under those defaults the report is left uncollapsed rather than have that column replaced by a count. Explicitly allowing `MIN` or `MAX` opts it back in. The same holds for a **boolean** metric, and for any field whose allowed-aggregations set has been emptied outright.
- **Another calculated field reads the column that would be lifted.** Lifting rewrites that column's formula for the report, and every formula built on it is then read at the group level too — a dimension made from it stops being a `GROUP BY` key, and a filter on it moves to the grouped query. Neither is something the report asked for, so a formula anything else reads is left unlifted.
- **A row-level calculated formula does not distribute over the rewrite.** `{{quantity}} * {{unit_price}}` is the clearest example: `SUM(quantity) * SUM(unit_price)` is not the same number as `SUM(quantity * unit_price)`. OWOX also declines to lift a formula that contains a conditional (`CASE`), an additive constant (`{{clicks}} + 5`), a reference inside a divisor other than the formula's own top-level ratio, or any reference whose own allowed-aggregations set does not permit `SUM`.
- **A division inside the formula would truncate a whole-number reference.** `INTEGER / INTEGER` truncates per row on **Athena** and **Redshift**, so a formula that divides by an integer — or a `DECIMAL` reference, whose declared scale OWOX cannot see on every storage — is left unlifted on those two, even though the identical formula lifts safely on BigQuery, Snowflake, and Databricks, where division promotes to a floating type.

When none of these block it, the report gets a clearly labeled aggregation or a `DISTINCT` projection; when one of them does, the report keeps returning every underlying row exactly as it did before this feature — never a guess in between.

## Date Bucketing

To answer questions like _"revenue by month"_ or _"sessions by week"_, bucket a date or timestamp dimension instead of grouping by the raw (daily) value. Choose a granularity — **Day, Week, Month, Quarter, or Year** — for the date column. For **timestamp/datetime** columns you can optionally set an **IANA time zone** (for example, `America/New_York`) so values are converted to that zone before truncation; without one, no conversion is applied. (Pure `DATE` columns have no time-of-day, so no time zone applies.)

![Edit report panel with a popover open on the order_timestamp column. "Group by bucket" is set to WEEK and "Time zone (optional)" to America/New_York, with "Or aggregate by" Min/Max checkboxes below. An arrow points to the Group by bucket dropdown.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3230bcf4-f40a-478e-b174-be28be8d6a00/public)

## Unique Count

The **Unique Count** row (at the bottom of the Data Mart's field list) adds a `COUNT(DISTINCT <primary key>)` metric to the report. It counts unique entities by the Data Mart's primary key, including composite keys.

> Not to be confused with the per-column **Count Unique** (`COUNT_DISTINCT`) aggregation above — Unique Count is a single report-wide metric keyed on the primary key, not applied to an individual column.
>
> ⚠️ Unique Count requires the Data Mart to have a primary key. Without one the row is shown disabled, with a tooltip explaining what to fix.
>
> A key column marked **Hidden for Report** still counts: counting distinct values of a column puts nothing in the output, so there is nothing to hide. A key column that has **disconnected** from the source is different — the whole metric is withheld, because counting by the rest of a composite key would merge records the full key keeps apart.

![Create new report panel with the column list scrolled to the bottom. A checked "Unique Count" row appears below the fields with a Σ icon, and a tooltip reads "Auto-generated column — counts the distinct values of the primary key." An arrow points to the Unique Count checkbox.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/28565768-b0c0-4f3b-c17c-51b224b56f00/public)

### Unique Count per Joined Data Mart

Every [joined Data Mart](./joinable-data-marts.md) offers a Unique Count of its own, at the bottom of that Data Mart's group in the **Columns** picker. In the picker it is simply `Unique Count` — the group heading above already names the Data Mart — with a tooltip naming that Data Mart and the key columns being counted. In the produced file it carries the Data Mart's name like any other joined field: `Unique Count (Orders)` in Google Sheets, `Orders Unique Count` everywhere else. It counts distinct records of **that** Data Mart by **its** primary key, composite keys included.

This answers questions the join alone cannot: _"how many orders per customer"_, or _"how many unique products across a customer's orders"_ — without adding the order or product key to the report as a column. Select as many as you need; each joined Data Mart contributes its own column — and each one its own `SELECT DISTINCT` pass over that Data Mart, so on a pay-per-scan warehouse a report that ticks several costs more to run.

> ⚠️ A joined Unique Count can be **selected** and **sorted by**, like the report's own Data Mart's Unique Count. It cannot be filtered or aggregated on.

When a joined Data Mart cannot offer the metric, the row is still shown, disabled, with a tooltip naming that Data Mart and explaining why. The primary key is defined on that Data Mart's **Data Setup** page:

| Why it is disabled                                           | What to fix                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| No primary key is set on that Data Mart                      | Mark the key field(s) as **PK** in that Data Mart's output schema.           |
| Part of the primary key is disconnected                      | Reconnect the missing key field, or actualize that Data Mart's schema.       |
| The primary key is a nested field (for example `user.id`)    | Unique Count cannot key on a nested field — declare a top-level key instead. |
| The primary key is nested **and** part of it is disconnected | Both need fixing — a top-level key, all of whose fields are connected.       |

## Counting rows in a group

An aggregated report contains only the columns you select — no `Row Count` column is added on its own. To see how many underlying rows each group stands for, apply the **Count** aggregate function. Use a column that is always filled, such as an ID column. To count unique entities instead, use a Unique Count.

## Totals

**Totals** are a per-column summary over the full filtered dataset, with no grouping. Totals cover every selected **numeric** field — aggregated by **all of its allowed functions** (for example `Sum`, `Average`, `Min`, and `Max` of `revenue`) — plus any **non-numeric field the report aggregates as a metric** (for example `Count Unique` on a text `country` column, giving its distinct count). `Sample` (`ANY_VALUE`) and `Combined` (`STRING_AGG`) are **never** part of Totals: a single representative value or a full-column concatenation is not a meaningful grand total. Totals are computed **in the warehouse** by a separate query and returned as a **separate block**, so they stay accurate and are never recomputed from the displayed rows. [Calculated fields](./calculated-fields.md) are the one exception to the rule above: OWOX never invents a Totals aggregation for a formula, so a calculated field appears in Totals as its own formula recomputed over the whole dataset, and a calculated dimension the report aggregates carries no Totals value at all.

Totals are produced even when the report itself is not grouped, and fields from joined Data Marts are included on the same basis (numeric fields automatically; non-numeric ones when the report aggregates them). `Unique Count` is not part of Totals.

> ⚠️ Totals are returned in the report **data API** (used by the MCP server and HTTP destinations), not written into Google Sheets or Looker Studio report output.

## View Generated SQL

The SQL OWOX builds for an aggregated report is fully transparent — preview it from the report to see the exact `GROUP BY`, aggregate expressions, and date-truncation per your storage dialect, or copy it into a standalone SQL-based Data Mart.

![Data Mart "Orders" on the Destinations tab with the Google Sheets section expanded, showing one "Google Sheets report" row. An arrow points to the Preview SQL icon button in the row's actions, with a "Preview SQL" tooltip visible.](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/112a1da6-5bbd-4825-19ad-a7b50d37f700/public)

## Limitations and Considerations

- A field is either a dimension or an aggregated metric within a single report — not both.
- Aggregated and date-bucketed reports require an explicit column selection (the columns to group by and aggregate).
- Conditional aggregation (`COUNT(DISTINCT … WHERE …)`) and pivoting values into columns are not supported — model these as pre-aggregated Data Marts instead.
- `Count Unique` (`COUNT_DISTINCT`) and `Combined` (`STRING_AGG`) are not available for complex column types (JSON, geography, array, struct, and similar) — those values are neither comparable nor reliably text-convertible across warehouses, so only `Count` and `Sample` apply.
- A date bucket's time zone affects only the bucketing. Date **filters** on the same field are evaluated in the warehouse's session time zone, so rows near midnight can land on different sides of a bucket boundary than of a filter boundary. Keep this in mind when combining a non-session time-zone bucket with a date filter on the same field.
- Percentiles (`P25`/`P50`/`P75`/`P95`) are **approximate** on BigQuery and Athena and **exact** (continuous-interpolated) on Redshift, Snowflake, and Databricks, so the same percentile can differ slightly between storages.
- A Unique Count — the report's own Data Mart's or a **joined** one's — can be selected as a column and used as a sort column, but not in a filter or as the input to another aggregation.
- Unique Count ignores rows whose primary key is **empty** — an empty key is not an identity, so such rows are neither counted nor merged together. Declare a primary key only on columns that are genuinely unique and always filled.
- **Turning on any Unique Count makes the report aggregated.** The remaining selected columns become `GROUP BY` keys, so a report that returned one row per underlying record now returns one row per combination of those columns. That is what makes the count meaningful per group, but it is not announced: the report looks the same while each row now stands for several records.
- For joined Data Marts, report-level aggregation is applied **on top of** the join roll-up; see [Joinable Data Marts](./joinable-data-marts.md).
- **Totals over joined fields are approximate**, because they re-aggregate the per-join roll-up rather than raw rows: `AVG`/percentiles are unweighted (an average of per-join averages), and a `Count Unique` over a joined **text** field counts distinct rolled-up values (by default a concatenation of the joined rows), not distinct raw values. Totals over the Data Mart's own (native) fields are exact.

## Related Links

- [Joinable Data Marts](./joinable-data-marts.md) — combine and aggregate fields from multiple Data Marts.
- [Table-based Data Mart](./table-data-mart.md) — define the schema (and primary key) aggregation builds on.
- [MCP Server](./mcp.md) — query Data Marts (including aggregated output) from AI tools.
