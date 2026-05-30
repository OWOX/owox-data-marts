# Joinable Data Marts

Combine fields from multiple Data Marts in a single report — without writing a line of SQL. Declare which Data Marts can be joined and on which keys, hide the fields you don't want to expose, and any report on the source Data Mart can mix native and joined fields side by side.

> 💡 Internal SQL is generated for you with proper aggregation, so joining a 1-to-many Data Mart never multiplies the rows of the main one. The generated query is fully transparent — you can preview it or copy it into a standalone SQL-based Data Mart at any time.

## What You Can Do

- **Build cross-source reports without SQL.** Once a relationship is set up, a campaign report can pull spend from your Ads Data Mart and matching orders from your CRM Data Mart — you pick the joined columns from the same picker as native ones.
- **Reuse a relationship across many reports.** Define the join once on the Data Mart; the same joined fields become available in the column picker of every report built on it.
- **Chain Data Marts transitively.** If `A` joins `B` and `B` joins `C`, fields from `C` become available for selection in any report on `A` — nothing is added until you pick them.
- **Stay in control of aggregation.** Choose how a joined field collapses for each row of the main Data Mart — `STRING_AGG`, `SUM`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `ANY_VALUE`.
- **Promote a joined report to a Data Mart.** One click turns the generated SQL into a new SQL-based Data Mart you can schedule, share, and build on top of.
- **Visualize the relationship graph.** A diagram view shows every Data Mart you've joined and how the keys connect.

## How It Works

Joinable Data Marts work on three levels:

1. **Relationship level.** A relationship links a **source** Data Mart to a **target** Data Mart on the same storage and defines the join conditions (one or more pairs of fields).
2. **Data Mart level.** All target fields are exposed by default. For each relationship, you can override their **output alias**, **visibility**, and **aggregate function** — or hide the ones you don't need.
3. **Report level.** The Report Columns picker lists native fields plus all joined fields as available options. Existing reports do not change until you actively pick a joined field. As soon as you pick at least one, the report runs on a generated `JOIN` query; otherwise the native fast path runs unchanged.

> 💡 Internally, OWOX Data Marts builds the SQL bottom-up: the deepest joined Data Marts are pre-aggregated by their join key first, then merged into their parent, and finally `LEFT JOIN`-ed into the source Data Mart. This guarantees the result row count never exceeds the source Data Mart's row count.

## Prerequisites

Before you can join two Data Marts:

- Both Data Marts must live on the **same storage**. Cross-storage joins are not supported.
- The source Data Mart needs an **Output Schema** (created automatically once it's saved with a valid input source).
- You need **maintenance** access to both the source and the target Data Mart. See [Ownership and Sharing](../../project/ownership-and-sharing.md) for details on sharing levels.

Supported storages: **Google BigQuery, Snowflake, AWS Redshift, AWS Athena, Databricks**.

## Step 1: Add a Relationship

Open the source Data Mart and go to the **Data Setup** tab. Scroll to the **Joinable Data Marts** block.

![Empty Joinable Data Marts block on the Data Setup tab with the Join Data Mart call to action](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f3d7964f-b171-44f5-2a45-6d6dede1cf00/public)

Click **Join Data Mart** and pick the target Data Mart from the dropdown. Only Data Marts on the same storage are listed.

The new relationship appears as an accordion row.

## Step 2: Configure Join Settings

Expand the relationship row and open the **Join Settings** tab.

![Join Settings tab with the joined Data Mart card, SQL Alias, and Join Fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/91af9809-942f-451a-f28c-1fb482ce0100/public)

### SQL Alias

The internal identifier for the relationship in the generated SQL — used in CTE names and JOIN keys. It never appears in the Column Picker or in report output (those use the Output Alias from Step 3). Auto-generated from the target Data Mart title; must be unique among the source Data Mart's relationships.

### Join Fields

Add one or more pairs of fields:

- **Source field** — a column in the source Data Mart.
- **Related field** — a column in the target Data Mart.

For composite keys, click **+ Add Join Field** to chain additional pairs. All conditions are combined with `AND` in the generated SQL.

> ⚠️ Field types must be compatible across both sides of a condition (e.g., `STRING` ↔ `STRING`, `INT64` ↔ `INT64`). Type-mismatched joins are blocked at save.

## Step 3: Configure Report Fields

Open the **Report Fields** tab on the same relationship.

![Report Fields tab listing target fields with Output Alias and Aggregation](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c6f5118f-f08d-447d-48a2-8e7b91665f00/public)

By default, all fields from the target Data Mart are available in reports built on the source Data Mart. Use this tab to fine-tune the joined Data Mart and each of its fields.

### Output Alias (Data Mart level)

The **Output Alias** at the top of the tab controls how the joined Data Mart is presented to report editors:

- It's the **group label** shown in the Report Columns picker.
- It's the **prefix** added to every joined field name in the report output (e.g., `orders revenue` if the alias is `orders`).

Rename it to anything that reads well in reports — by default it inherits the target Data Mart title.

### Per-field overrides

Each row in the fields table lets you override:

| Setting                | What it does                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alias**              | Per-field rename — replaces the original field name in the report output. The Data Mart-level prefix still applies (e.g., with prefix `orders` and field alias `total`, the column becomes `orders total`).                                                       |
| **Aggregate Function** | How the field is collapsed when the relationship is 1-to-many. See the table below.                                                                   |

To hide a field from reports, open its **⋯** action menu and click **Hide from reports**. Hidden fields stay configurable in this tab but no longer appear in the Report Columns picker on any report. Use it for fields business users don't need.

![Hide from reports action in the field row menu](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/a6426663-3010-47a4-44b5-c99b56960a00/public)

To hide every field of a joined Data Mart in one go, toggle off **Allow for reporting** on the relationship row in the Joinable Data Marts block. The relationship stays in place — only the joined fields disappear from the column picker until you turn the switch back on.

### Aggregate Function Reference

| Function         | Use when                                                                               | Returns       |
| ---------------- | -------------------------------------------------------------------------------------- | ------------- |
| `STRING_AGG`     | You want to keep all values as a comma-separated list (default for text fields).       | `STRING`      |
| `ANY_VALUE`      | You want a single representative value for a 1-to-1 lookup (faster than `STRING_AGG`). | Original type |
| `SUM`            | You want to total a numeric field (e.g., orders, spend).                               | `NUMERIC`     |
| `MIN` / `MAX`    | You want the earliest/latest date or smallest/largest number.                          | Original type |
| `COUNT`          | You want the number of rows on the target side.                                        | `INTEGER`     |
| `COUNT_DISTINCT` | You want the number of unique values.                                                  | `INTEGER`     |

## Step 4: Use Joined Fields in a Report

On any report (Google Sheets, Data Studio, Email) attached to the source Data Mart, open the report editor and locate the **Report Columns** section.

![Report Columns picker with native and joined field groups](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4e181ea4-04d3-4eb3-934e-c89a49229700/public)

You'll see:

- **Native fields** — flat list at the top (the source Data Mart's own columns).
- **Joined fields** — collapsible groups, one per relationship. Each field appears under its **Output Alias** (configured in Step 3).

The badge in the section header (e.g., `9/29`) shows how many of the available fields are currently selected.

Pick any combination of native and joined fields.

As soon as the report includes at least one joined field, OWOX Data Marts runs it through the joined SQL pipeline; otherwise the native fast path runs unchanged.

## View Generated SQL

There are two ways to inspect the SQL OWOX Data Marts builds for a joined report:

- **From the reports list.** Hover over a report row in the source Data Mart's reports table and click the SQL icon — a read-only modal opens with the exact query that will run on the next execution.
- **From Run History.** Open the Data Mart's **Run History** tab and click any report run to see the SQL that was sent to your storage for that run.

![Action icons on a report row, including the SQL viewer button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/db914a0e-2842-460b-2191-b0146158d300/public)

The SQL contains the pre-aggregation CTEs, `LEFT JOIN`s, and output column aliases. Use it to validate the logic, share it with a teammate, or paste it into your warehouse console for manual debugging.

![Joined Data Marts SQL modal with Copy to Clipboard and Copy as Data Mart actions](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d761657f-a27b-421a-afd3-cd3e95812f00/public)

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

![Graph view of the Joinable Data Marts block showing transitive paths and Loop stubs](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/52bc4830-7dcd-4968-344d-fdf84dee3f00/public)

If **Campaigns** joins **Orders**, and **Orders** joins **Products**, the column picker on any **Campaigns** report exposes fields from **Products** as available options — prefixed with the alias chain. Existing reports keep their current columns until you pick the new ones.

There is **no hard limit** on chain length. The generated SQL pre-aggregates each level on its parent's join key, so adding depth never multiplies the source Data Mart's rows.

### Diamond patterns

Two paths to the same target Data Mart are also supported. If both **Campaigns → Orders → Customers** and **Campaigns → Leads → Customers** exist, both branches expose their fields in the column picker independently under their own branch.

### Loops

If a chain folds back on a Data Mart that already appears earlier in the same branch (e.g., `A → B → A`), OWOX Data Marts stops descending at that point and renders a collapsed **Loop** badge in the relationship list and the canvas. The loop branch contributes no fields to the column picker — this is expected behavior, not an error.

## Limitations and Considerations

- **Same storage.** All Data Marts in a chain must live on the same storage type and connection. Cross-storage joins are not supported.
- **No self-reference.** A Data Mart cannot be joined to itself.
- **Type-compatible join keys.** Mismatched types on a join condition are rejected at save.
- **Aggregate function trade-offs.** `STRING_AGG` is the safest default for text but produces long values on high-fanout joins. Switch to `ANY_VALUE` when you know the relationship is effectively 1-to-1.

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
