---
'owox': minor
---

**Reports no longer deliver duplicate rows when no aggregation was chosen**

A report with an explicit column selection and no aggregation, date bucket, or Unique Count set anywhere used to deliver every underlying row — most visibly from a join that fans one source row out across many. OWOX now collapses it on delivery.

**Two things to check before upgrading.** An automatically aggregated column is relabelled exactly as a manually chosen one always has been — `sessions` becomes `sessions | SUM` — so a Google Sheets formula or Looker Studio binding that reads the plain `sessions` header stops resolving. And a Data Mart defined by SQL now counts as having output controls, which materialises its definition as a view (`CREATE OR REPLACE VIEW`) on every run and on every Generated SQL preview: a **read-only storage credential that worked before will now fail**.

Watch a report that sets no aggregation get one applied, and the query it will actually run.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/5c61c408f7efbc9f2e5f54945193d161/iframe>

What a report gets depends on what it selected:

- Dimensions only — returned **distinct**. Nothing is renamed and no value can change.
- A metric among them — the **first aggregation that Data Mart's governance allows**, in priority order: `SUM` → `AVG` → `MIN` → `MAX` for numbers, `MIN` → `MAX` for dates and times. A boolean metric is left alone, and so is a text metric under its default governance; explicitly allowing `MIN` or `MAX` on a text field opts it back in.
- A row-level calculated formula — **recomputed at group level** when OWOX can prove that returns the same value, so `{{revenue}} / {{cost}}` becomes the ratio of the totals rather than an average of per-row ratios. One it cannot prove stays a grouping key rather than being guessed at.
- A column from a joined Data Mart — left alone entirely, because grouping by a joined metric would move its total.

The report editor marks each column OWOX will aggregate and names the function before the report is ever run, and the Aggregations panel says which column and which function; run history records what was applied.

![The Aggregations panel of a report that sets none, reading "Applied automatically because this report sets none: cost — Sum. Add one below to decide for yourself." above an Add aggregation button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e8194918-f11a-4474-ca25-578563742300/public)

Ad-hoc reads are unchanged: **HTTP Data**, the MCP `query_data_mart` tool, `apps/ctl`, the Looker Studio cache-fill query, "copy as Data Mart", and a report's save-time dry run all keep returning exactly what was asked for, duplicates included. **Microsoft Excel** and **Looker Studio** reports are unchanged too, because the add-in and the connector read the report over those same paths. See [Report Aggregations](../../docs/getting-started/setup-guide/report-aggregations.md) for the full list of cases where a report is deliberately left uncollapsed.
