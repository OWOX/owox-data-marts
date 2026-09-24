# Joinable Data Marts

Combine fields from multiple Data Marts in a single report — without writing a line of SQL. Declare which Data Marts can be joined and on which keys, hide the fields you don't want to expose, and any report on the source Data Mart can mix native and joined fields side by side.

> 💡 Internal SQL is generated for you with proper aggregation, so joining a 1-to-many Data Mart never multiplies the rows of the main one. The generated query is fully transparent — you can preview it or copy it into a standalone SQL-based Data Mart at any time.

## What You Can Do

- **Build cross-source reports without SQL.** Once a relationship is set up, a campaign report can pull spend from your Ads Data Mart and matching orders from your CRM Data Mart — you pick the joined columns from the same picker as native ones.
- **Reuse a relationship across many reports.** Define the join once on the Data Mart; the same joined fields become available in the column picker of every report built on it.
- **Chain Data Marts transitively.** If `A` joins `B` and `B` joins `C`, fields from `C` become available for selection in any report on `A` — nothing is added until you pick them.
- **Stay in control of aggregation.** Choose how a joined field collapses to one value per join key — its [Dedup](#dedup): `ANY_VALUE`, `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`.
- **Promote a joined report to a Data Mart.** One click turns the generated SQL into a new SQL-based Data Mart you can schedule, share, and build on top of.
- **Visualize the relationship graph.** A diagram view shows every Data Mart you've joined and how the keys connect.

## How It Works

Joinable Data Marts work on three levels:

1. **Relationship level.** A relationship links a **source** Data Mart to a **target** Data Mart on the same storage and defines the join conditions (one or more pairs of fields).
2. **Data Mart level.** All target fields are exposed by default. For each relationship, you can override their **output alias**, **visibility**, and **[Dedup](#dedup)** — or hide the ones you don't need.
3. **Report level.** The Report Columns picker lists native fields plus connected joined fields that are available for reporting. Existing reports do not change until you actively pick a joined field. As soon as you pick at least one, the report runs on a generated `JOIN` query; otherwise the native fast path runs unchanged.

> 💡 Internally, OWOX Data Marts builds the SQL bottom-up: the deepest joined Data Marts are pre-aggregated by their join key first, then merged into their parent, and finally `LEFT JOIN`-ed into the source Data Mart. This guarantees the result row count never exceeds the source Data Mart's row count.

## Prerequisites

Before you can join two Data Marts:

- Both Data Marts must live on the **same storage**. Cross-storage joins are not supported.
- The source Data Mart needs an **Output Schema** (created automatically once it's saved with a valid input source).
- You need **maintenance** access to both the source and the target Data Mart. See [Ownership and Sharing](../../project/ownership-and-sharing.md) for details on sharing levels.

Supported storages: **Google BigQuery, Snowflake, AWS Redshift, AWS Athena, Databricks**.

## Step 1: Add a Relationship

Open the source Data Mart and go to the **Data Setup** tab. Scroll to the **Joinable Data Marts** block.

![Empty Joinable Data Marts block on the Data Setup tab with the Join Data Mart call to action](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e3ad80fc-88a2-42e2-3f56-a114dab49800/public)

Click **Join Data Mart** and pick the target Data Mart from the dropdown. Only Data Marts on the same storage are listed.

The new relationship appears as an accordion row.

## Step 2: Configure Join Settings

Expand the relationship row and open the **Join Settings** tab.

![Join Settings tab with the joined Data Mart card, SQL Alias, and Join Fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f11ee057-8957-4568-cbd3-a9fd5ccda100/public)

### SQL Alias

The internal identifier for the relationship in the generated SQL — used in CTE names and JOIN keys. It never appears in the Column Picker or in report output (those use the Output Alias from Step 4). Auto-generated from the target Data Mart title; must be unique among the source Data Mart's relationships.

### Join Fields

Add one or more pairs of fields:

- **Source field** — a column in the source Data Mart.
- **Related field** — a column in the target Data Mart.

For composite keys, click **+ Add Join Field** to chain additional pairs. All conditions are combined with `AND` in the generated SQL.

> ⚠️ Field types must be compatible across both sides of a condition (e.g., `STRING` ↔ `STRING`, `INT64` ↔ `INT64`). Type-mismatched joins are blocked at save.

## Step 3: Describe the Relationship (optional)

Open the **Description** tab of the same relationship row and explain what the join means in business terms — for example, "Visitors from the website sign up for the product and convert into users". The text is saved automatically while you type; the row stays expanded and the cursor stays in the field.

The description is not shown in reports. AI assistants connected through [MCP](mcp.md) read it together with the join fields, so they understand how the joined data relates and not just how the rows are matched. It also appears in the column picker's join-path tooltip.

For a transitive join (see [Transitive Joins](#transitive-joins)) the tab shows the description inherited from the Data Mart that owns the relationship. Typing there overrides the text for this join path only; **Reset to inherited** or clearing the field falls back to the inherited description.

## Step 4: Configure Report Fields

Open the **Report Fields** tab on the same relationship.

![Report Fields tab with the Output Alias and each field's Alias, Dedup and Σ available](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/54eb37d2-0962-4383-579e-11d79b728900/public)

By default, reports built on the source Data Mart include connected target fields that are not hidden for reporting. Use this tab to fine-tune the joined Data Mart and each of its fields.

Once join conditions are configured, this tab uses the target Data Mart's saved Output Schema even while the target is a draft. It also keeps native fields with `DISCONNECTED` status available so you can review or change their aliases, visibility, and Dedup settings. Draft targets and disconnected native fields remain unavailable in reports, and those disconnected fields are not visually distinguished in this configuration table.

### Output Alias (Data Mart level)

The **Output Alias** at the top of the tab controls how the joined Data Mart is presented to report editors:

- It's the **group label** shown in the Report Columns picker.
- It's the **Data Mart name** attached to every joined field name in the report output. Where it goes depends on the destination — with the alias `orders`, a field named `revenue` becomes:
  - `revenue (orders)` in **Google Sheets**, so the field name stays readable in a narrow header cell;
  - `orders revenue` in **Data Studio**, **email-based destinations** and the **HTTP data endpoint**.

The position follows the surface that renders the label, not the report. Reading a Google Sheets report through the HTTP data endpoint therefore returns `orders revenue`, even though its sheet shows `revenue (orders)`. Match columns on the technical field name — it is identical everywhere.

Rename it to anything that reads well in reports — by default it inherits the target Data Mart title.

### Per-field overrides

Each row in the fields table lets you override:

| Setting         | What it does                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alias**       | Per-field rename — replaces the original field name in the report output. The Data Mart-level Output Alias still applies. With Output Alias `orders` and field alias `total`, the column becomes `total (orders)` in Google Sheets and `orders total` elsewhere. |
| **Dedup**       | How the field collapses to one value per join key before the join. See [Dedup](#dedup) below.                                                                                                                                                                    |
| **Σ available** | The aggregations a report may apply to the field after the join. The list follows the type the Dedup produces.                                                                                                                                                   |

To hide a field from reports, open its **⋯** action menu and click **Hide from reports**. Hidden fields stay configurable in this tab but no longer appear in the Report Columns picker on any report. Use it for fields business users don't need.

![Hide from reports action in the field row menu](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3b030d5c-2b7c-461a-b931-725e3eab6e00/public)

To hide every field of a joined Data Mart in one go, toggle off **Allow for reporting** on the relationship row in the Joinable Data Marts block. The relationship stays in place — only the joined fields disappear from the column picker until you turn the switch back on.

### Dedup

A joined Data Mart can hold several rows for one value of the join key — several orders per customer, several hits per session. Before the join, each of its fields is collapsed to **one value per join key** with the function in the field's **Dedup** column. That is what keeps the join from multiplying the rows of the Data Mart you report on.

Hover over the **Dedup** column header for a short reminder with a link back to this section.

![Dedup column header tooltip with a Learn more link, above fields set to COUNT_DISTINCT, ANY_VALUE and SUM](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/85d688cd-47b1-4471-a8a8-b775425ddc00/public)

The Dedup function decides three things:

- **The value in a report column.** A joined field selected as a plain column shows its collapsed value — one per row of the source Data Mart.
- **The field's type, and with it Σ available.** `COUNT` and `COUNT_DISTINCT` turn any field into an integer, `STRING_AGG` into text and `AVG` into a float; the other functions keep the field's type. The **Type** column in this tab keeps showing the source type — the type a report sees follows the Dedup. Change the Dedup across types and **Σ available** switches to that type's defaults — set a text `hit_id` to `COUNT_DISTINCT` and a report can `Sum` it.
- **What a report's aggregations read.** With `ANY_VALUE`, a report's `Sum`, `Average`, `Min`, `Max`, `Combined` and percentiles are computed over the joined Data Mart's own rows. With any other Dedup they are computed over the collapsed values, one per join key. Either way each joined row or key counts once, however many source rows it matches. A report's `Count Unique` counts the joined Data Mart's own values rather than the collapsed ones; its `Count` counts the source rows that got a joined value.

A new field starts with `SUM` for numbers, `MAX` for dates, times and timestamps and `STRING_AGG` for everything else. Array fields always collapse into a JSON array — see [Joined array columns](#joined-array-columns).

| Dedup            | Collapses the rows of one join key into                                                                                                                                         | Type          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `ANY_VALUE`      | One of their values. Use it for a join with one row per key, or when reports should aggregate the joined rows themselves; as a plain column it then shows only one row's value. | Original type |
| `SUM`            | Their total. Numbers only.                                                                                                                                                      | Original type |
| `AVG`            | Their average. Numbers only.                                                                                                                                                    | Float         |
| `MIN` / `MAX`    | The smallest / largest value — the earliest / latest date.                                                                                                                      | Original type |
| `COUNT`          | The number of rows with a value.                                                                                                                                                | Integer       |
| `COUNT_DISTINCT` | The number of distinct values.                                                                                                                                                  | Integer       |
| `STRING_AGG`     | All values, sorted, as one comma-separated text, e.g. `paid, paid, shipped`.                                                                                                    | Text          |

The editor offers every function for any field, so it does not stop you from picking `SUM` or `AVG` for text or dates; a report that reads such a field fails when it runs.

#### Choosing a Dedup

| You join                                                                  | Dedup                         | What you get                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A lookup with one row per key — sessions to users for `country` or `plan` | `ANY_VALUE`                   | The value as it is. Report aggregations read the joined rows directly.                                                                                                                                                                                                                            |
| Orders to customers, and each customer row should carry its revenue       | `SUM` on `amount`             | A per-customer total in the column; a report's `Sum` adds the customers up.                                                                                                                                                                                                                       |
| Orders to customers, and reports need per-order figures                   | `ANY_VALUE` on `amount`       | A report's `Average` is the average **order**, and its `Max` the largest order — not the average or largest customer total. The column itself shows a single order's amount per customer.                                                                                                         |
| Hits to sessions, to show how many each session had                       | `COUNT_DISTINCT` on `hit_id`  | An integer per session, which a report can `Sum` or `Average`. For the total number of hits alone, keep `hit_id` text (the default `STRING_AGG` works) and use a report's `Count Unique`, or the hits Data Mart's own [Unique Count](./report-aggregations.md#unique-count-per-joined-data-mart). |
| Orders to customers for the first or last purchase                        | `MIN` / `MAX` on `order_date` | The earliest or latest date per customer.                                                                                                                                                                                                                                                         |
| A text attribute that varies per key — order statuses per customer        | `STRING_AGG`                  | Every value, repeats included, e.g. `paid, paid, shipped`. Values grow long on keys with many rows; use `ANY_VALUE` if all rows share one value.                                                                                                                                                  |

> ⚠️ Pick the Dedup for the question the column answers. `SUM` and `ANY_VALUE` on the same `amount` both give the right grand total, but `Average` and `Max` read different things: customer totals with `SUM`, individual orders with `ANY_VALUE`.

A `COUNT_DISTINCT` Dedup counts distinct values **per join key**. Adding those counts up across keys counts a value twice when it appears under two keys — fine for hits, which belong to one session each, but not for products bought by several customers. For a distinct count across the whole report, use a report's `Count Unique` instead — it is not available for number fields.

On a [transitive join](#transitive-joins) the column value of a deeper Data Mart's field is collapsed again at each Data Mart on the way up, over the rows of the Data Mart in between. `MIN` and `MAX` stay exact. `SUM` and `COUNT` stay exact only while the Data Mart in between has one row per deeper key; when several of its rows share one — many orders of one customer — the deeper value is added once per row. `COUNT_DISTINCT` is added up the same way, on top of the double counting above. `AVG` becomes an average of averages, `ANY_VALUE` the largest value, and `STRING_AGG` repeats the deeper list once per row. A report's `Sum`, `Average`, `Min`, `Max`, `Combined` and percentiles are not affected: they read the deeper Data Mart directly, as described above.

## Step 5: Use Joined Fields in a Report

On any report (Google Sheets, Data Studio, Email) attached to the source Data Mart, open the report editor and locate the **Report Columns** section.

![Report Columns picker with native and joined field groups](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/24e4a48b-b723-4997-998b-9b8ffbfa5900/public)

You'll see:

- **Native fields** — flat list at the top (the source Data Mart's own columns).
- **Joined fields** — collapsible groups, one per relationship. Each field appears under its **Output Alias** (configured in Step 4).

The badge in the section header (e.g., `5/14`) shows how many of the available fields are currently selected.

Pick any combination of native and joined fields.

As soon as the report includes at least one joined field, OWOX Data Marts runs it through the joined SQL pipeline; otherwise the native fast path runs unchanged.

## View Generated SQL

There are two ways to inspect the SQL OWOX Data Marts builds for a joined report:

- **From the reports list.** On the source Data Mart's **Destinations** tab, hover over a report row and click the **Preview SQL** icon — the read-only **Report SQL** modal opens with the exact query that will run on the next execution.
- **From Run History.** Open the Data Mart's **Run History** tab and click any report run to see the SQL that was sent to your storage for that run.

![Preview SQL icon on a report row in the Destinations tab](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/0b6b7825-8512-42bf-4a14-46c8351f8c00/public)

The SQL contains the pre-aggregation CTEs, `LEFT JOIN`s, and output column aliases. Use it to validate the logic, share it with a teammate, or paste it into your warehouse console for manual debugging.

![Report SQL modal with the Dedup CTEs and the Copy to Clipboard and Copy as Data Mart actions](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/52ef6d8f-17e7-4fdd-38df-a91bc9a30e00/public)

## Copy as Data Mart

If a joined report becomes a recurring asset, promote it to its own Data Mart in one click.

Click **Copy as Data Mart**. OWOX Data Marts creates a new SQL-based Data Mart on the same storage, using the generated joined SQL as its definition. The new Data Mart:

- Has its own Output Schema, triggers, destinations, and Insights.
- Can be joined to other Data Marts itself.
- Is fully decoupled from the source — later changes to the original relationship do not affect it.

This is useful when several teams want to consume the same joined dataset, or when you want to materialize the result on a schedule.

## Transitive Joins

You can chain relationships across more than two Data Marts.

The Joinable Data Marts block has a **Graph** view that visualizes every relationship reachable from the source Data Mart, including transitive paths.

![Graph view of the Joinable Data Marts block showing transitive paths and Loop stubs](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e570279e-6b2d-4fe2-1b05-5d7dbdfce300/public)

If **Campaigns** joins **Orders**, and **Orders** joins **Products**, the column picker on any **Campaigns** report exposes fields from **Products** as available options — qualified with the Output Alias of the Data Mart the field actually comes from (**Products**), not the whole chain. Existing reports keep their current columns until you pick the new ones.

There is **no hard limit** on chain length. The generated SQL pre-aggregates each level on its parent's join key, so adding depth never multiplies the source Data Mart's rows.

### Diamond patterns

Two paths to the same target Data Mart are also supported. If both **Campaigns → Orders → Customers** and **Campaigns → Leads → Customers** exist, both branches expose their fields in the column picker independently under their own branch.

### Loops

If a chain folds back on a Data Mart that already appears earlier in the same branch (e.g., `A → B → A`), OWOX Data Marts stops descending at that point and renders a collapsed **Loop** badge in the relationship list and the canvas. The loop branch contributes no fields to the column picker — this is expected behavior, not an error.

## Joined array columns

An array identified by the source schema uses JSON array rollup, preserving the array from each source row. For example, two matching rows containing `["a", "b"]` and `["c"]` produce `[["a","b"], ["c"]]`. Each ancestor join adds one more array level; descendants are not flattened or unnested.

An empty source array contributes `[]` (one such row produces `[[]]`); a source SQL `NULL` contributes a JSON `null` (one row produces `[null]`). BigQuery writes NULL arrays to tables as empty arrays, so this distinction follows the value returned by the warehouse query. A missing joined descendant stays SQL `NULL` when no descendant contributes a value, rather than becoming an empty array. Missing descendants are omitted from ancestor rollups when other descendants contribute values. The order inside each source array is preserved. Aggregated rows are sorted deterministically by their serialized JSON text, but separate array columns are sorted independently, so sibling-index alignment between them is not guaranteed. Exact collation can differ between storage engines.

These columns cannot use output controls. Opaque JSON, Snowflake VARIANT, and Redshift SUPER values keep their existing behavior.

## Calculated Fields Across a Join

> 💡 A calculated field can combine its own Data Mart's fields with a joined Data Mart's fields — see [Referencing a Joined Data Mart's Field](calculated-fields.md#referencing-a-joined-data-marts-field). Two things about such a field are worth knowing before you read its number, and OWOX Data Marts points both out while you write the formula and when you save it. Neither of them blocks the save, and an AI assistant reading the field through the MCP server is told the same.

### `SUM` and `AVG` over a joined Data Mart are already set-based

A joined Data Mart's rows are pre-aggregated to the join key before they're attached to the source Data Mart (see [How It Works](#how-it-works)), and that pre-aggregated value then lands on every source row sharing the key. A formula that sums or averages it does **not** add it up once per matching row: each such aggregation is computed over the distinct combinations of report dimensions and the joined row's own identity, so a value that reaches several report rows still contributes once. The same holds at any depth of a transitive join (`orders.items`), and for `MIN`, `MAX`, `ANY_VALUE`, `COUNT(DISTINCT …)` and your dialect's approximate distinct counters.

### A joined `COUNT` counts this Data Mart's rows, not the joined one's

`COUNT` written **without** `DISTINCT` over a joined Data Mart's column is the one exception. It is computed where the equivalent report metric is — after the join, over the joined Data Mart collapsed to one row per key — so it counts the rows of **the Data Mart the formula belongs to** that found a match, not the joined Data Mart's own rows. The two agree only when each row here matches exactly one row there. Otherwise the count is off in either direction:

- **Higher**, when one joined row matches several rows here — the join key doesn't cover this Data Mart's primary key. One order reached from two sessions counts twice.
- **Lower**, when several joined rows share one key — the join key doesn't cover the joined Data Mart's primary key. A customer with three orders counts as one.

> ⚠️ OWOX warns about a joined `COUNT` unless every join on the way is keyed by a primary key on both sides, and says which way it can be off. Where this Data Mart — or a joined one it is judged against — declares no primary key, it warns that it cannot tell either way; that is the most common way you'll meet it, and declaring a primary key is what turns "cannot tell" into a definite answer. To count the joined Data Mart's own rows instead, use `COUNT(DISTINCT …)` over a column of **that** Data Mart which identifies its rows — not over the join key, which is a column of the Data Mart the formula belongs to. When the joined Data Mart declares a usable primary key it also publishes a **Unique Count** measure, which you can select as a report column (a formula cannot reference it), and the warning says so.

### A joined measure leaves out the joined Data Mart's unmatched rows

Independently of any key and of the aggregate, every join runs outwards from the Data Mart the formula belongs to and keeps **all** of its rows. A row of this Data Mart with no counterpart survives with nothing to add from the joined side; a row of the **joined** Data Mart that matched nothing here is left out entirely. So `SUM(costs.spend)` on an Orders Data Mart is the spend of campaigns that have orders, not all spend, and a ROAS built from `revenue` and `costs.spend` will not reconcile with the Costs Data Mart's own totals. OWOX points this out on every formula that reads a joined Data Mart, when you write it and when you save it — not again on every later save that leaves the formula alone. No key configuration recovers rows that never matched.

### When you need a ratio of two facts, conform the grain first

A join can't express what a cross-fact ratio needs: one row per grain shared by both facts, with neither side's rows dropped. Aggregate the two measures to the grain they share — day and traffic source, say — in a **separate Data Mart** built with `UNION ALL`, and calculate the ratio there instead of across the join.

## Limitations and Considerations

- **Same storage.** All Data Marts in a chain must live on the same storage type and connection. Cross-storage joins are not supported.
- **No self-reference.** A Data Mart cannot be joined to itself.
- **Type-compatible join keys.** Mismatched types on a join condition are rejected at save.
- **Dedup trade-offs.** `STRING_AGG` keeps every text value but produces long values on high-fanout joins. Switch to `ANY_VALUE` when the relationship is effectively 1-to-1, or when reports should aggregate the joined rows themselves — see [Choosing a Dedup](#choosing-a-dedup).
- **Athena array serialization.** Joined array rollup requires every element and nested field to support casting to JSON. Athena/Trino does not currently support date, time, timestamp, or binary values in this cast path.

## Troubleshooting

### A relationship shows a "Draft" badge

The target Data Mart is in Draft status. As long as it stays a draft, it blocks the relationship — its fields are not exposed in the column picker, and any chain that passes through it stops at this node. Open the target Data Mart and publish it to unblock the chain.

### A relationship shows a "Join not configured" badge

The relationship was saved but has no join conditions. Its fields are not exposed in the column picker yet — open the **Join Settings** tab and add at least one Join Field pair.

### A relationship shows a "Blocked" badge

A Data Mart further upstream in the chain is in Draft status or has a relationship with no join conditions. Everything downstream of that node is marked **Blocked** until the upstream issue is resolved — publish the upstream Data Mart and finish its join configuration to unblock the rest of the chain.

## Related Links

- [Create SQL-based Data Mart →](sql-data-mart.md)
- [Create Connector-based Data Mart →](connector-data-mart.md)
- [Adding a Report Destination →](../../destinations/manage-destinations.md)
- [Scheduling Reports Updates →](report-triggers.md)
- [Manage Storages →](../../storages/manage-storages.md)
- [Ownership and Sharing →](../../project/ownership-and-sharing.md)
