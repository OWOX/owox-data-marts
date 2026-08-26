# Calculated Fields

A **calculated field** is a formula you add to a Data Mart's output schema — plain SQL in that Data Mart's own warehouse dialect, over that Data Mart's fields — which the warehouse itself evaluates as part of every query the field is selected in. Because it is computed inside the query rather than stored as a column, a ratio such as click-through rate is recomputed correctly at whatever grain the request asks for: a report broken down by day returns the true ratio of that day's sums, never an average of per-row ratios.

> 💡 A formula is either **all aggregate** or **all row-level** — never a mix. `SUM(clicks) * 1.0 / NULLIF(SUM(impressions), 0)` is a metric; `CONCAT(session_id, user_id)` is a dimension; `SUM(clicks) + impressions` is refused, because a row-level column has no defined value beside an aggregation. You do not choose which kind you are writing — OWOX reads it from the formula. The formula is checked when you **save the schema**, not when a report runs — and the resulting query is test-run against your warehouse once per save — so a broken formula is caught before anyone builds a report on it.

## What You Can Do

- Define a field as a formula over the Data Mart's own fields, written in the storage's own SQL dialect.
- Write it as a **metric** (`SUM(clicks) * 1.0 / NULLIF(SUM(impressions), 0)`) or as a **dimension** (`CONCAT(session_id, user_id)`) — the formula decides which, and there is nothing to pick.
- Reference **another calculated field of the same Data Mart** — `roas = revenue / NULLIF(cost, 0)`, where `revenue` and `cost` are calculated fields of their own. The reference is resolved when the query is built, so editing `cost` changes every formula that reads it.
- Reference a **joined Data Mart's field** in the same formula (`orders.amount`), computed at the report's grain so a one-to-many join does not inflate the number. Only a metric formula may do this.
- Use your dialect's aggregate functions together with scalar functions, `CASE` expressions and arithmetic.
- Get **autocomplete** for the Data Mart's fields (its own, its calculated ones, and joined), the dialect's aggregate functions, a curated list of its scalar functions, and a ready-made guarded-division snippet.
- See problems **while you type**, underlined on the token at fault and spelled out beneath the editor.
- **Select** a calculated field as a report column and **sort** by it — on any report, whether or not it joins another Data Mart. A metric also appears in a report's **Totals**, recomputed over the whole filtered dataset; a dimension groups the report instead.
- **Filter** by it, selected or not — a dimension row by row, a metric by each group's recomputed value. Filtering by a metric makes the report a grouped one, so the report has to say which columns it returns: on a report that picks no columns at all and groups by nothing, the filter is refused with a message telling you to choose them. The comparison is made on the type you declared, so declare the type your formula actually returns: on two storages a wrong declaration filters wrongly rather than raising an error.
- Apply a report **aggregation** to a dimension — `Count Unique` over `CONCAT(session_id, user_id)`, say. The field then stops being a grouping key and becomes a metric of that report, exactly as an aggregation on an ordinary column does.
- **Bucket a calculated date** — a row-level field declared `DATE` or `TIMESTAMP` can be grouped by day, week, month, quarter or year, and the report's metrics are computed at that bucket's grain.

Every supported storage has its own formula dialect: **BigQuery, Athena, Snowflake, Redshift, and Databricks**.

## How It Works

You type plain warehouse SQL, and you name a field by writing its name — there is no special reference syntax to learn, and another calculated field of the same Data Mart is named exactly like a column. Every name that matches a field you may reference is recognised and drawn as a pill; everything else — functions, operators, literals — is passed through to the warehouse exactly as written. OWOX does not rewrite your expression: it splices it into the query's `SELECT` list and lets the warehouse do the rest.

### Metric or dimension — read from the formula

Whether the field is a **metric** or a **dimension** follows from what you wrote, and nothing else:

| Your formula                                | The field is | In a report                                                                                                           |
| ------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| contains at least one aggregation           | a metric     | already aggregated; never grouped by                                                                                  |
| contains no aggregation at all              | a dimension  | grouped by, exactly like an ordinary column — unless the report aggregates it, and then it is a metric of that report |
| mixes the two (`SUM(clicks) + impressions`) | —            | refused on save                                                                                                       |

A reference to another calculated field counts for this reading, and counts as whatever **it** is: `revenue / NULLIF(cost, 0)` holds no aggregation of its own and is still a metric, because `revenue` and `cost` are. See [Referencing Another Calculated Field](#referencing-another-calculated-field).

A **metric** is already an aggregate, and that decides most of its behaviour: it never becomes a `GROUP BY` key, no report aggregation can be applied on top of it, and it appears in Totals as itself.

A **dimension** behaves as an ordinary column — in every sense, including that a report may aggregate it. Left alone it is a grouping key, and the key is the **whole expression**, so a report grouped by it returns one row per distinct value of the field, not one row per combination of the columns the formula happens to mention. If the report does not group, it is simply a projected expression.

Apply a report **aggregation** to it and the same thing happens as to any ordinary column: the field leaves the grouping keys and becomes a metric of that query, computed over each group the report's remaining dimensions define. That is the report's decision and not a property of the field — the schema still holds a dimension, another report may still group by it, and nothing about the formula changed.

Either way a dimension is **not** a Total: a total of a dimension would mean nothing, and an aggregation the report applied belongs to that report rather than to the field, so it is left out of the Totals block rather than given a number nobody asked for.

Both levels share what follows from having no warehouse column behind them: neither is ever part of a primary key — that cell stays empty on the row — and neither is ever "disconnected". The row is marked green while its formula resolves and red once a field it references is gone — its own reference or one further down a chain of calculated fields, since a formula is only as usable as everything it reads.

One cell differs between them. An **aggregate-level** field carries no allowed-aggregations set: it is already an aggregate, there is nothing left to apply on top of it, and the cell stays empty. A **row-level** one governs its own set exactly like a warehouse column — filled from its **declared type** by default (a `STRING` gets `Count`, `Count Unique`, `Combined` and `Sample`; a numeric gets `Sum`, `Average`, `Min` and `Max`), narrowed by unticking entries, and cleared entirely if you want the field never aggregated.

When the report also pulls fields from a **joined** Data Mart, each aggregate call in the formula is computed against the Data Mart it reads — the field's own, or the joined one — and the field itself is computed **at the last join, after de-duplication**, at the report's grain. That is a metric's behaviour. A dimension works on such a report too, and in the same way it does on a plain one: it becomes one of the report's grouping keys, and every joined metric beside it is computed at that grain rather than at a coarser one. On a joined report that aggregates nothing, it is simply projected per row. Aggregate it, and it leaves that grain along with the grouping keys — the joined metrics beside it are then computed at the grain the report's remaining dimensions define, and the aggregation runs over the whole group.

## Prerequisites

- A Data Mart whose output schema is actualized, so its field names and types are known.
- Permission to edit that Data Mart.
- Its storage configured. Without a configured storage the schema still saves, but the warehouse test run is skipped and you are told so.
- To reference a joined Data Mart's field: a [relationship](./joinable-data-marts.md) already defined to that Data Mart, and access to it.

## Add a Calculated Field

On the Data Mart's **Data Setup** tab, open **Output Schema** and press **Add Calculated Field**. A row is appended straight away, marked with the calculated-field icon in the status column. Fill in three things:

| Column      | What to put there                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Name**    | The output column name reports and API consumers will select.                                                                     |
| **Type**    | The field's output type, from the types your storage accepts. This is your declaration — OWOX does not infer it from the formula. |
| **Formula** | Click the cell to open the formula editor.                                                                                        |

Then save the schema. The save is what validates every formula.

## Writing the Formula

The editor is plain SQL with autocomplete. Type any word character to open the suggestion list, which offers four groups in this order:

1. **Fields** — every field of this Data Mart, including ones hidden for reporting (hiding takes a column off the reporting menu; it does not remove it from the source) and this Data Mart's own calculated fields, plus every field of each joined Data Mart, offered as `<join alias>.<field>`. Each row shows the field's type and, where they apply, which Data Mart it comes from and whether it is an `aggregated formula` or a `row-level formula` — which is what decides how you may write it. A **joined** Data Mart's calculated field is not offered, because it cannot be referenced at all.
2. **Guarded division** — a snippet that expands to `SUM(numerator) / NULLIF(SUM(denominator), 0)`, so a zero denominator yields `NULL` instead of failing the query. It guards the **denominator** only. Over two integer columns that division still truncates on Redshift and Athena — see [Dividing one integer by another](#dividing-one-integer-by-another).
3. **Aggregate functions** — the aggregate names OWOX recognises for your storage's dialect (see the table below).
4. **Scalar functions** — a curated selection of that dialect's scalar functions, together with the SQL words a `CASE` expression is built from (`CASE`, `WHEN`, `THEN`, `ELSE`, `END`, `AND`, `OR`, `NOT`, `IN`, `IS NULL`, `IS NOT NULL`).

A recognised field is drawn as a pill and behaves as one unit: the caret never lands inside it, and `Backspace` beside it removes the whole reference in one step, which a single undo brings back. Hover a pill that names a **joined** field — in the editor or on the row — and it tells you which Data Mart that field comes from, which the join alias on its own does not.

`Ctrl`/`Cmd`+`Enter` applies the formula without reaching for the mouse, and `Escape` cancels. `Tab` indents inside the editor rather than leaving it.

### Dividing one integer by another

Dividing one `INTEGER` column by another is **integer division on Redshift and on Athena**: both truncate the result toward zero. `SUM(clicks) / NULLIF(SUM(impressions), 0)` over 1 click and 2 impressions returns:

| BigQuery | Snowflake | Databricks | Redshift | Athena  |
| -------- | --------- | ---------- | -------- | ------- |
| `0.5`    | `0.5`     | `0.5`      | **`0`**  | **`0`** |

Nothing tells you. There is no error and no warning: the save's warehouse test run passes, the report runs, and the click-through rate publishes a confident `0`. It is a plausible wrong number rather than a failure, so it can sit in a dashboard indefinitely. Declaring the field `FLOAT` does not rescue it either — the warehouse truncated the value before any declaration was read.

Multiply one side by `1.0`, or cast it, and the division is no longer integer division on any of the five storages:

```text
SUM(clicks) * 1.0 / NULLIF(SUM(impressions), 0)
```

The guarded-division snippet inserts the plain form, so add the `* 1.0` yourself whenever both sides are integers.

### Aggregate Functions per Dialect

These are the names OWOX recognises **as aggregates** when it reads your formula. Every storage offers the shared set:

`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`, `STDDEV`, `STDDEV_POP`, `STDDEV_SAMP`, `VARIANCE`, `VAR_POP`, `VAR_SAMP`, `ANY_VALUE`

and, on top of it, its own dialect's:

| Storage    | Also recognised                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BigQuery   | `APPROX_COUNT_DISTINCT`, `APPROX_QUANTILES`, `APPROX_TOP_COUNT`, `ARRAY_AGG`, `STRING_AGG`, `COUNTIF`, `LOGICAL_AND`, `LOGICAL_OR`, `CORR`, `COVAR_POP`                               |
| Athena     | `APPROX_DISTINCT`, `APPROX_PERCENTILE`, `ARBITRARY`, `ARRAY_AGG`, `BOOL_AND`, `BOOL_OR`, `COUNT_IF`, `GEOMETRIC_MEAN`, `MAX_BY`, `MIN_BY`, `CORR`                                     |
| Snowflake  | `APPROX_COUNT_DISTINCT`, `APPROX_PERCENTILE`, `ARRAY_AGG`, `LISTAGG`, `MEDIAN`, `PERCENTILE_CONT`, `PERCENTILE_DISC`, `MODE`, `CORR`, `COVAR_POP`, `HLL`, `BOOLAND_AGG`, `BOOLOR_AGG` |
| Redshift   | `LISTAGG`, `MEDIAN`, `PERCENTILE_CONT`, `PERCENTILE_DISC`, `BOOL_AND`, `BOOL_OR`                                                                                                      |
| Databricks | `APPROX_COUNT_DISTINCT`, `APPROX_PERCENTILE`, `PERCENTILE`, `PERCENTILE_APPROX`, `COLLECT_LIST`, `COLLECT_SET`, `FIRST`, `LAST`, `CORR`, `COUNT_IF`, `BOOL_AND`, `BOOL_OR`            |

> ⚠️ This list is about **recognition**, not about what your warehouse can do. A call OWOX does not recognise as an aggregate is treated as a scalar function, so the fields inside it read as bare row-level columns and the save refuses the formula with a level-mixing message. If you need an aggregate that is not listed here, wrap the row-level part in one that is, or model the field in the Data Mart's SQL instead.

## Referencing Another Calculated Field

A formula may name another calculated field of the **same** Data Mart, written exactly as a column is:

```text
revenue = SUM(amount)
cost    = SUM(bonus)
roas    = revenue / NULLIF(cost, 0)
```

The reference is resolved when a **query is built**, never when the schema is saved. `roas` stores the text you typed; `revenue` and `cost` are spliced into it — each wrapped in parentheses, so their own operators keep the meaning they had on their own row — at the moment a report, a Google Sheet, an MCP agent or an HTTP Data caller asks for `roas`. Nothing is frozen at save time, and that is the point: edit `cost` and every formula that reads it changes with it, with no formula to re-save and no copy left behind. The save's warehouse test run sends the **substituted** query, so a chain is checked as the SQL it will actually become.

### A reference to an aggregated field aggregates

`roas` contains no aggregation of its own and is nonetheless a **metric**, because `revenue` and `cost` are: referencing an aggregated calculated field makes the formula that reads it aggregated too. That carries along a chain of any length — a formula reading a formula that reads an aggregate is a metric as well.

Everything a metric's level implies then applies to it. It is never a grouping key, it appears in Totals as itself recomputed over the whole filtered dataset, no report aggregation may be applied on top of it, and a row-level column written beside it — `revenue / cost + clicks` — is refused as a level mix, exactly as `SUM(clicks) + impressions` is.

A **row-level** calculated field is the simpler case: it reads as an ordinary column wherever one may be written. `UPPER(session_key)`, over a `session_key` holding `CONCAT(session_id, user_id)`, is a dimension, and a report grouped by it groups by the whole expression the chain expands to — not by the columns those formulas happen to mention.

The editor tells you which you are looking at before you write it: a calculated field is offered in autocomplete as an `aggregated formula` or a `row-level formula`, and hovering its pill says the same thing in the words the save would use.

A metric built from two other metrics, and a row-level formula built from another row-level one, were both executed against **BigQuery, Athena, Snowflake, Redshift and Databricks** — the metric on a blended report as well as on one with no joined columns.

### What is refused

| What is refused                                                         | Example                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Wrapping an aggregated calculated field in an aggregation               | `SUM(revenue)`, where `revenue` is `SUM(amount)` — the message names the field that already aggregates                  |
| A loop between formulas                                                 | `a` reads `b` and `b` reads `a` — the message draws the loop, `a` → `b` → `a`, so you can see which reference to remove |
| A formula that references itself                                        | `roas = roas / 2`, reported as itself rather than as a loop of one                                                      |
| A joined Data Mart's calculated field                                   | `orders.roas` — see [below](#referencing-a-joined-data-marts-field)                                                     |
| Referencing a calculated field that itself reads a **joined** Data Mart | `roas` over a `revenue` written as `SUM(orders.amount)` — the refusal names `revenue` and `orders.amount`               |

Two formulas reading the same third one is not a loop and is perfectly fine.

The last two are one rule met twice, and it is the rule the section below is about: which Data Marts a report joins, and whether the person running it may read them, are decided from the text of the formula that was selected — so a joined Data Mart reached only _through_ a reference would be joined with nobody's access to it checked. The difference between them is only where each is caught. `orders.roas` is refused by reading your formula, with no warehouse involved; a reference to a field that reads a joined Data Mart is caught by the save's warehouse test run, so on a Data Mart whose storage is not configured it surfaces the first time a report asks for the field instead.

### A referenced field is not a report column

Referencing `revenue` does not put `revenue` in the report. It enters the query to be substituted into `roas` and for nothing else: it is not projected, it is absent from the output, and a wildcard request does not receive it merely because `roas` reads it. Select it by name if you want its column too, exactly as you would any other field.

Breakage travels the chain in the other direction. Drop a column the chain reads and every formula above it is marked broken in the output schema, and a report that selects one is refused naming what is missing rather than returning `NULL`. What is named there may be a field that is still on the row: a calculated field whose own formula is broken is reported as missing **or broken**, because that is what it is — present, and not computable.

## Referencing a Joined Data Mart's Field

Write a joined field as `<join alias>.<field>` — for example `SUM(cost) * 2 * SUM(orders.amount)`, where `orders` is the alias of a joined Data Mart. Autocomplete offers those fields once the joins have loaded, each row naming the Data Mart it belongs to.

A joined field is readable **only inside an aggregation**, which makes any formula that names one a metric. `CONCAT(session_id, orders.status)` is refused.

Two rules govern how such a formula is computed:

- **One aggregate call reads one Data Mart.** `SUM(cost) * 2 * SUM(orders.amount)` is fine — each call is computed where it belongs. `SUM(cost * orders.amount)` is refused: there is no single grain at which that is defined. Split it into one aggregate per Data Mart.
- **A field the join already summarises is read through that summary.** If the joined field carries a pre-join aggregation, naming it in a formula and selecting it as a report metric give the same number. Combining such a field with another column of the same source inside one `SUM` or `COUNT(DISTINCT …)` is refused, because each was collapsed separately and no row set computes the expression you wrote.

Three asymmetries against your own Data Mart's fields are deliberate: a joined field **hidden for reporting** in its own Data Mart cannot be referenced (your own hidden fields can), a joined Data Mart **you do not have access to** cannot be referenced at all, and a joined Data Mart's **calculated field** cannot be referenced where one of your own now can.

That last one is not a feature waiting its turn. Which Data Marts a report joins, and whether the person running it may read them, are both decided from the text of the formula in front of you — so a joined Data Mart reachable only _through_ a calculated field you referenced would be joined without that access check ever running. `orders.roas` is therefore refused by name, told to you as a calculated field of a joined Data Mart and not as a missing one, and autocomplete does not offer it.

The same boundary holds on a **report**, and not only inside a formula. A joined Data Mart's calculated field cannot be selected as a report column, filtered, sorted, aggregated or date-bucketed: a report that joins another Data Mart reads that Data Mart's **real columns** only. The refusal names the field and the Data Mart it belongs to, rather than reporting a column your warehouse has never heard of. Where you meet it depends on what the report does with the field — filtering, sorting, aggregating or bucketing it is refused when the report is **saved**, while a report that merely selects it is refused when it **runs**, so on a scheduled run or a destination push rather than in the editor. A report that already carried such a field was reading whatever column of the joined Data Mart happened to share the formula's name and serving that value as the formula's; it now says so instead.

## Checks While You Type

A moment after you stop typing, the editor asks the backend what is wrong with the formula. It is the **same rule set the save applies**, run without touching the warehouse, so the two cannot disagree. The answer appears in two places at once: underlined on the column or function at fault, and written out beneath the editor — both, because several problems name no particular token.

Two things this channel deliberately does _not_ do:

- It never blocks **Apply**. Its answer is asynchronous, so gating on it would let a stale verdict stand between you and a formula you have already fixed. The save remains the authority.
- It never invents a problem. If the check cannot be reached — offline, a server error, a view-only session — it stays silent rather than blaming the formula.

It also reports what saving **this** formula would break in **another** calculated field: every formula the Data Mart holds is re-judged, not only the one you have open, because one formula's level decides how the formulas that read it may be written. Turn a plain column into an **aggregated** calculated field, for instance, and a formula that wrapped that column in a `SUM` of its own becomes illegal — and you are told before you save rather than by the save failing.

## What Actually Blocks a Save

Two gates, in order.

**The editor's own Apply gate** runs locally and immediately. It refuses:

- an empty formula;
- a name it could not resolve to any field on offer — reported as itself ("`clickz` is not a field of this Data Mart"), rather than as a confusing complaint about the aggregation around it;
- a reference whose name contains a double quote.

When the joined Data Marts have not loaded, a dotted name is refused with _"could not be checked against the joined Data Marts"_ and what to do about it — never with an assertion that the field does not exist.

**The schema save** validates every calculated field in one pass and reports every problem across every field at once, each naming the field it belongs to. It refuses:

| What is refused                                                                                                      | Example                                         |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A row-level column beside an aggregation in the same formula                                                         | `SUM(clicks) + impressions`                     |
| A joined Data Mart's field read outside an aggregation                                                               | `CONCAT(session_id, orders.status)`             |
| An aggregation nested inside another                                                                                 | `SUM(COUNT(clicks))`                            |
| An aggregate call with no field in it                                                                                | `COUNT(1)`                                      |
| One aggregate call reading two Data Marts                                                                            | `SUM(cost * orders.amount)`                     |
| An unclosed parenthesis                                                                                              | `SUM(clicks`                                    |
| A subquery (`SELECT`), a window function (`OVER`), or a `;`                                                          | `SUM(clicks) OVER ()`                           |
| A `#` or `//` comment — they mean different things on different warehouses, so use `--`                              | `SUM(clicks) # daily`                           |
| A backslash inside a quoted value — some warehouses read it as an escape and others do not, so write a quote as `''` | `CONCAT(a, 'it\'s')`                            |
| A quoted value or comment left unclosed — including a dialect spelling such as `$$…$$` or `'''…'''`                  | `LENGTH($$it's$$)`                              |
| A reference to a field that no longer exists                                                                         | a renamed or deleted column                     |
| A reference to a **joined** Data Mart's calculated field — one on your own Data Mart is allowed                      | `orders.roas`                                   |
| An aggregated calculated field wrapped in another aggregation                                                        | `SUM(revenue)` where `revenue` is `SUM(amount)` |
| A loop between calculated fields, or a formula that references itself                                                | `a` reads `b` and `b` reads `a`                 |
| A joined alias that is not joined, or a field that source does not offer                                             | `orders.amount` after the join was removed      |
| A joined field hidden for reporting, or a joined Data Mart you cannot access                                         | —                                               |
| A reference to a Unique Count measure, own or joined                                                                 | `unique_count`                                  |
| A field reference that ends up inside a text value                                                                   | a field pill enclosed in `'…'` quotes           |
| Anything the **warehouse itself** rejects on the test run                                                            | an unknown function, a bad cast                 |

Two outcomes are **warnings** and do not block the save:

- **Unguarded division.** A `/` whose denominator is neither a number nor already wrapped in a null-guard is flagged so you can wrap it — `NULLIF(SUM(impressions), 0)` — but the formula still saves. Nothing is rewritten for you. This warning is about a **zero** denominator and nothing else: an integer-by-integer division is never flagged, on any storage — see [Dividing one integer by another](#dividing-one-integer-by-another).
- **The warehouse was unreachable.** The schema saves without the test run, says so by name, and the check runs again on the next save.

## Using the Field in a Report

A calculated field enters a query only when a report **names** it — as a selected column, in a filter, or in a sort. Sorting by one requires selecting it as well; filtering by one does not, and is its own case [below](#filtering-by-a-calculated-field). If a field the formula references is gone, a report that selects, filters or sorts by it is refused naming exactly what is missing, instead of quietly returning `NULL` — whether that field is one the formula names itself or one further down a chain of calculated fields.

A **metric** additionally appears in the report's **Totals**, recomputed over the whole filtered dataset — as itself, not summed or averaged — and works on a report that also pulls joined columns, at the report's own grain.

A **dimension** groups the report by its expression instead, exactly as an ordinary column would — unless that report aggregates it, which is its own case [below](#aggregating-a-dimension) — and is absent from Totals. A report that **joins** another Data Mart is no different: the dimension is one of that report's grouping keys, the joined metrics beside it are computed at that grain, and if the report aggregates nothing at all the formula is projected once per row. When a metric filter drops some groups, Totals covers exactly the rows the report is left showing.

> ⚠️ Grouping a joined report at a fine grain — which a dimension formula makes easy to write — can leave a **joined** column summing to more than that Data Mart's own total, while Totals still shows the true one. Both numbers are right, for a reason that has nothing to do with formulas: see [Limitations](#limitations-and-considerations).

### Filtering by a calculated field

A report can **filter** by a calculated field, and the filter compares the **formula itself** rather than the column name it is published under:

- a **dimension** is filtered row by row, exactly as an ordinary column is;
- a **metric** filters the report's **groups** by its recomputed value — `ctr > 0.5` on a breakdown by country keeps the countries whose own ratio clears it, not the rows a per-row reading of the formula would have kept.

The field does **not** have to be selected to be filtered on. Both kinds were executed against **BigQuery, Athena, Snowflake, Redshift and Databricks**, with the filtered field selected and unselected alike — a dimension filter on a plain report and on one that pulls joined columns, a metric filter on a plain report — and in each case **Totals** covered exactly the rows the report was left showing.

> ⚠️ Filtering by a **metric** turns the report into a grouped one. There is no `HAVING` without a `GROUP BY`, so a report that projects `country` and filters on `ctr` returns one row per country, where the same report without that filter returns one row per source row. That is what filtering on a metric means, and it is the same shape selecting a calculated field already produces — but nothing on screen announces the change.

The **declared type** decides how the comparison is made. A filter imposes it on both sides — on the formula and on the value you typed — exactly where the aggregation path already does: on a floating-point or exact-decimal declaration, and never on an `INTEGER` one, for the same reason it is left alone there. So a field declared `FLOAT` is compared as a number even on a storage that would otherwise have compared it as text. That closed a measured wrong answer on **Redshift**: a `FLOAT`-declared formula returning `'9'`, `'10'` and `'100'`, filtered `> 5`, used to return `9` alone — the two largest values missing, no error and nothing on screen to suggest it — and now returns all three, on all five storages.

That has a cost, and it is a deliberate one. A comparison over a value the declared type cannot read now **fails the query** on all five storages instead of quietly filtering on some other reading of it — one unparseable row under a `FLOAT` declaration is enough to stop the whole report. A loud failure was chosen over a plausible wrong subset. The operators that do not read the value as its declared type — `is null`, `is not null`, and the text matchers such as `contains` and `starts with` — are left alone and are unaffected.

One shape is refused rather than answered: a **metric whose formula aggregates a joined Data Mart** cannot be filtered on, and the refusal names the field. It is the same rule an ordinary joined `Sum` or `Average` column already meets — the post-join filter cannot be routed through the dedup-safe computation the selected value is computed by, so it would compare a different, incorrect value. Filter on a column of the Data Mart the report is built on instead.

> ⚠️ **A type you declared but did not return filters wrongly on two storages, and silently.** On **Snowflake** a mis-declared date string is read month-first, so `05/08/2026` — which your formula means as the 5th of August — filters as **8 May**; a `MIN` or `MAX` over such a field carries the same misreading. On **Redshift** the comparison is made on **text**, so a date spelled any way but ISO returns an **empty** report. Neither raises anything. The other three storages refuse a date spelled that way outright. A formula that returns the type it declares filters correctly on all five — that was executed, not assumed. See [Limitations](#limitations-and-considerations).

### Aggregating a dimension

Open the field's **Σ** control in the report's column picker and tick a function — `Count Unique` on a `session_key` field holding `CONCAT(session_id, user_id)`, for example. From that point the field is a **metric of that report**:

- it is **no longer a grouping key**, so the report returns one row per combination of its _remaining_ dimensions, and the count is taken over each of those groups as a whole;
- the result arrives under the usual aggregated column name, `session_key | COUNTUNIQUE` — the field no longer appears under its own bare name. Tick more than one function and each gets its own column, exactly as for an ordinary column;
- the functions on offer come from the field's **declared type** and from the allowed-aggregations set on its schema row, on the same rules as any warehouse column;
- it works the same way on a plain report, on one that **joins** another Data Mart, and on a blended one, on every supported storage.

> ⚠️ A dimension the report aggregates shows **no Totals value** — the Totals block carries nothing for that column, and the cell beside it stays empty. This is deliberate, not a defect. OWOX never invents a Totals aggregation for a formula: a metric appears in Totals as _itself_, its own formula recomputed over the whole filtered dataset and never summed or averaged, while a dimension has no such value of its own to recompute. The aggregation you applied belongs to that report, not to the field, so it does not create one either.

Two things a **metric** is refused, permanently rather than for now, each with a message naming which rather than being silently ignored. A **report aggregation** on top of it: it already _is_ an aggregate, so there is nothing left to apply, and only a dimension can be aggregated. And a **date bucket**: an aggregate-level field is never a grouping key, so there is no dimension to bucket. A **row-level** field can be bucketed — see [Bucketing a calculated date](#bucketing-a-calculated-date).

To a destination that separates the two — Looker Studio, for instance — a metric arrives as a metric and a dimension arrives as a dimension. A dimension the report has aggregated arrives as a metric, under exactly the rules an ordinary column carrying that same function gets: `Count Unique`, for one, arrives as a metric Looker is told not to roll up further.

### Bucketing a calculated date

A **row-level** field declared `DATE` or `TIMESTAMP` can be bucketed: open the same **Σ** control in the report's column picker and pick **Day, Week, Month, Quarter** or **Year**. The report then groups by the truncated value of the whole formula, and every metric beside it — including one pulled from a **joined** Data Mart — is computed at that bucket's grain rather than at a coarser one.

Which fields are offered a bucket follows from the **declared type**, on the same rule a warehouse column obeys: a field declared `STRING` is refused one in the same words a `STRING` column is refused, and an **aggregate-level** field is refused one permanently, because it is not a dimension at all.

A calculated bucket carries **no time zone**, on any of the five warehouses. The **Σ** control offers the time-zone list for an ordinary `TIMESTAMP` column and not for a formula, and a report that asks for one anyway is refused when it is saved, naming the field. Bucket without a zone, or put the zone on an ordinary date column — see [Limitations](#limitations-and-considerations) for what was measured.

Nothing is converted on the way to your warehouse. A formula declaring `DATE` that in fact returns something else is truncated exactly as it was written, and that is a measured choice rather than an omission — see [Limitations](#limitations-and-considerations).

## Limitations and Considerations

- **The scalar-function suggestions are curated, deliberately incomplete, and validate nothing.** BigQuery alone documents hundreds of scalar functions; the menu holds at most 100 entries per storage. A function's absence from the list is not a verdict — you may type any scalar function your warehouse has, and it will work. Its presence only means that warehouse's own reference documents it. The warehouse is the authority, and the save's test run is what actually accepts or rejects a call.
- **Dividing one integer by another truncates on Redshift and Athena, and OWOX does not warn you.** `SUM(clicks) / NULLIF(SUM(impressions), 0)` over two `INTEGER` columns returns `0.5` on BigQuery, Snowflake and Databricks, and `0` on **Redshift** and **Athena** — those two do integer division and truncate toward zero. No error is raised anywhere: the save's warehouse test run passes, the report runs, and a wrong-but-plausible number is published under the right column name. OWOX neither warns nor casts for you, so the guard is yours to write: multiply one side by `1.0` — `SUM(clicks) * 1.0 / NULLIF(SUM(impressions), 0)` — or cast it, and the division behaves the same way on all five. See [Dividing one integer by another](#dividing-one-integer-by-another).
- **A dimension formula reads its own Data Mart only.** A joined Data Mart's field stays readable inside an aggregation and nowhere else, and this one is permanent rather than a missing feature: the join summarises each of that Data Mart's columns separately before joining it in, so a row-level read of two of them would return a combination that exists in none of its rows.
- **On a joined report, a fine grain lifts a joined column above its own total — and Totals will not match it.** A joined Data Mart's row is counted once in **every** group the report puts its matching rows into. Group by `country` and one customer's single order lands in one group; group by `(country, session_key)` and, if that customer's sessions fall into two of those groups, the same order is counted in both — so the revenue column now adds up to more than that Data Mart holds. Totals is computed over the same rows with no grouping at all, so each order is counted once there however many groups it appears in on screen, and it keeps showing the true figure. Both numbers are correct; they answer different questions, and the visible column's sum is not meant to equal the Totals cell. None of this is specific to calculated fields — any ordinary dimension that splits a joined mart's rows across groups has always behaved this way — but a dimension formula makes such a grain easy to reach. If you need the two to agree, group only by columns that never split one joined Data Mart's rows across two groups. A coarser grain is not enough on its own: grouping by a column that simply cuts across the join key — say `channel`, when the join is on `customer_id` — splits that customer's rows just as a finer one would.
- **A date bucket converts nothing, deliberately.** A row-level field declared `DATE` or `TIMESTAMP` is truncated by the warehouse exactly as your formula wrote it, so what becomes of a field that declares `DATE` while returning something else is the warehouse's verdict rather than OWOX's. That question — what each warehouse does when asked to truncate a value it cannot read as a date — has now been measured, and the answer is that it **refuses the query**: none answered with an empty column. The one conversion OWOX considered adding, an explicit `CAST` before truncating, was measured turning that refusal into a **confidently wrong month** on Redshift: `05/08/2026` came back bucketed as May where the formula meant the 5th of August, with no error at all. So OWOX adds none, and a bucket is only as trustworthy as the type you declared.
- **A calculated date bucket cannot carry a time zone — one rule on all five warehouses.** An ordinary date column's bucket still can; a formula's cannot, and the report is refused when it is saved rather than run with the zone quietly dropped. The reason was measured on **Snowflake**, the one warehouse that reads a formula returning text as a date at all once a zone is asked for: given `05/08/2026`, which the formula means as the 5th of August, it published the bucket as **May** — one row, no error, nothing on screen to suggest it. Which month you get there depends on that warehouse's own date-reading setting rather than on your data, so two Snowflake accounts could show different months for the same report. The other four refuse that shape outright with or without a zone, which is why this reads as one sentence instead of four: a report means the same thing wherever it runs. Casting is not an escape — the bullet above measured a `CAST` producing the same wrong month on Redshift. Bucket without a zone, or bucket an ordinary date column when the zone matters.
- **A filter trusts your declared type, and on two storages a wrong one filters wrongly instead of failing.** A `DATE`-declared formula that in fact returns text is compared as a date on **Snowflake**, which reads such a string month-first: `05/08/2026` filters as **8 May** where your formula means the 5th of August, and a `MIN` or `MAX` over that field carries the same misreading. On **Redshift** the comparison is made on text, so a date spelled any way but ISO is ordered alphabetically and the report comes back **empty**; ISO spellings hide it, because alphabetical and chronological order coincide there. Neither storage raises anything — a wrong-month or empty report is all you see. BigQuery, Athena and Databricks refuse a date spelled that way outright, so there the report fails rather than misleads; on **BigQuery** and **Athena** that refusal covers ISO spelling too, so a `DATE`-declared formula returning text fails the query there however the text is spelled. This is accepted deliberately rather than fixed by refusing date filters: the failure needs the declaration to be a fiction, and a formula that returns the type it declares was executed filtering correctly on all five storages. Declare what your formula returns, and if a date report looks empty or a month out, check that declaration first.
- **A metric whose formula aggregates a joined Data Mart cannot be filtered on.** The report is refused when it is saved, naming the field. It is the same rule an ordinary joined `Sum` or `Average` column already meets: the post-join filter cannot be routed through the dedup-safe computation that produces the selected value, so it would compare a different and incorrect one. Filter on a column of the Data Mart the report is built on instead, or move the calculation onto that Data Mart. Every other shape filters — a row-level formula on a joined report included.
- **A dimension is never in Totals — including when the report aggregates it.** A metric appears there as its own formula recomputed over the whole filtered dataset; a dimension has no such value of its own, so aggregating it in a report yields a column whose Totals cell is empty. By design: the aggregation belongs to that report, not to the field, and OWOX never invents a Totals aggregation for a formula.
- **A formula cannot reference a JOINED Data Mart's calculated field.** One on its **own** Data Mart it can — that is what [Referencing Another Calculated Field](#referencing-another-calculated-field) is about — but a joined one is refused, and permanently rather than for now. Which Data Marts a report joins and whether its author may read them are both decided from the formula's own text, so a joined Data Mart reachable only through a referenced field would be joined with nobody's access to it checked. The same rule refuses a reference to one of your **own** calculated fields when that field reads a joined Data Mart — `roas` over a `revenue` written as `SUM(orders.amount)`. Write the underlying expression out in the formula that needs it instead.
- **A joined Data Mart's calculated field is not a report column either.** The same boundary, met on the report rather than in a formula: it cannot be selected, filtered, sorted, aggregated or date-bucketed, and the refusal names the field and the Data Mart it belongs to. Filtering, sorting, aggregating or bucketing it is refused when the report is **saved**; a report that only selects it is refused when it **runs**. Select one of that Data Mart's real columns instead, or add the same calculation to the Data Mart the report is built on.
- **Renaming a joined Data Mart's alias, or removing the join, does not silently repoint the formula.** The reference keeps naming the old alias, the field's row in the output schema turns red with a tooltip naming what is missing, and both the next schema save and any report using the field are refused with a message naming the alias. Point the formula at an alias that exists to fix it.
- **A reference is only a reference while its text matches a field on offer.** Delete the pill and retype the name, and it re-links only if it still resolves; anything else stays plain text and is refused by name on Apply.
- **Save the schema from the Data Mart editor.** A save that carries no user identity cannot read the join tree, so a formula naming a joined Data Mart is refused rather than saved unchecked.
- **The declared type is your declaration, and it is never checked against the formula.** It is not inferred from the formula, and it is not verified against it: declaring a type your storage does not accept is refused, but declaring `FLOAT` for `CONCAT(first_name, last_name)` is not. That declaration is also what decides which aggregations a report may apply, so such a field will be offered `Sum` and a report that asks for it will validate — and then the warehouse answers: some dialects reject `SUM(CONCAT(…))` outright, others coerce the value on their own terms. That coercion is where the declaration stops being harmless, and it was measured: on **Redshift** a summed text value is read as a whole number and truncated **row by row** before being added up, which published `17` where `20.25` is correct, with no error and nothing on screen to suggest it. So OWOX no longer leaves the type to the dialect to guess at. Before an aggregation that reads the value as a number — `Sum`, `Average` and the percentiles — a field declared as a floating-point or exact-decimal type is cast to that type, so the report sums the value the declaration says it is; on **BigQuery** and **Athena**, which reject that sum outright, it returns the correct total instead. An **integer** declaration is deliberately left uncast: rounding every row to a whole number before summing would be the same kind of loss, and the dialects do not even agree on which way to round. The same imposition runs on a **filter's** comparison, which is what stopped Redshift comparing a `FLOAT`-declared formula as text and returning a subset of the rows; the price is that a value the declared type cannot read now fails the query rather than being compared on some other reading of it — see [Filtering by a calculated field](#filtering-by-a-calculated-field). The rest of the design choice stands: a formula is warehouse SQL, and only the warehouse can judge what it returns. Declare the type the formula actually produces, and everything downstream — the aggregation menu, the report, the destination — follows from it correctly.
- Adding a calculated field to a schema never changes what an existing wildcard request receives — it only enters a query when a report names it, whether as a selected column, in a filter or in a sort.

## Related Links

- [Joinable Data Marts](./joinable-data-marts.md) — define the relationships a formula's `orders.amount` reads through.
- [Report Aggregations and Totals](./report-aggregations.md) — how grouping, aggregate functions and Totals work around a calculated field.
- [Report Output Controls](./output-controls.md) — the filters, sorts and limits a report applies on top.
- [Table-based Data Mart](./table-data-mart.md) — where the output schema a formula reads is defined.
