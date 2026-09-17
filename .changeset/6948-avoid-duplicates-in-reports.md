---
'owox': minor
---

# Reports no longer deliver duplicate rows when no aggregation was chosen

A report with an explicit column selection and no aggregation, date bucket, or Unique Count set anywhere used to deliver every underlying row — most visibly from a join that fans one source row out across many. OWOX now collapses it on delivery.

**Two things to check before upgrading.** An automatically aggregated column is relabelled exactly as a manually chosen one always has been — `sessions` becomes `sessions | SUM` — so a Google Sheets formula or Looker Studio binding that reads the plain `sessions` header stops resolving. And a Data Mart defined by SQL now counts as having output controls, which materialises its definition as a view (`CREATE OR REPLACE VIEW`) on every run and on every Generated SQL preview: a **read-only storage credential that worked before will now fail**.

Watch a report that sets no aggregation get one applied, and the query it will actually run.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/f2661de617b9ac6ce66eda9884203d1b/iframe>

What a report gets depends on what it selected:

- Dimensions only — returned **distinct**. Nothing is renamed and no value can change.
- A metric among them — the **first aggregation that Data Mart's governance allows**, in priority order: `SUM` → `AVG` → `MIN` → `MAX` for numbers, `MIN` → `MAX` for dates and times. A boolean metric is left alone, and so is a text metric under its default governance; explicitly allowing `MIN` or `MAX` on a text field opts it back in.
- A row-level calculated formula — **recomputed at group level** when OWOX can prove that returns the same value, so `{{revenue}} / {{cost}}` becomes the ratio of the totals rather than an average of per-row ratios. One it cannot prove stays a grouping key rather than being guessed at.
- A column from a joined Data Mart — left alone entirely, because grouping by a joined metric would move its total.

The report editor fills the choice in for you rather than only predicting it: open a report that sets no aggregation and the function is already ticked on the column, counted on the **Aggregations** button, and listed in the panel — exactly as one you picked yourself, and changed or removed the same way. A note names the columns OWOX chose for, so you can tell them apart from your own, and the choice is saved with the report the next time you save it. Run history records what was applied.

![The Aggregations panel of a report that set none, reading "Applied automatically because this report set none: cost — Sum. Change or remove it below." above a cost rule aggregated by Sum, with the Aggregations button counting it](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/2d3c870c-b0c9-40ee-0366-e48b2c83cc00/public)

Ad-hoc reads are unchanged: **HTTP Data**, the MCP `query_data_mart` tool, `apps/ctl`, the Looker Studio cache-fill query, "copy as Data Mart", and a report's save-time dry run all keep returning exactly what was asked for, duplicates included — including pulling somebody's Google Sheets report over HTTP Data, where the caller is a third party rather than the report's reader. The two pull destinations part ways: a **Microsoft Excel** report collapses like every other report, because the add-in fetches the very rows it writes into the workbook, while a **Looker Studio** report stays uncollapsed, because its connector reads the report the way any other ad-hoc caller does. See [Report Aggregations](../../docs/getting-started/setup-guide/report-aggregations.md) for the full list of cases where a report is deliberately left uncollapsed.
