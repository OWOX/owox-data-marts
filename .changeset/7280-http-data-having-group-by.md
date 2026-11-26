---
'owox': minor
---

**Plugin charts match their table when a metric filter selects the groups**

A plugin often shows a table grouped by one column and a chart of the same data by day, for example the order statuses with revenue above 100. The chart read checked the metric filter for each day, not for each status. So the chart showed other groups and other numbers than the table: a day could show the revenue of a status that the table removed. A workaround with an `in` filter of the passing values worked only for one plain column and up to 500 values. Now the chart can check the filter at the table's grouping, so it shows the same groups and numbers as the table.

A read checks its metric filters at a separate grouping with `traverseData(id, { havingGroupBy: { column: ['status'] } })`. OWOX finds the groups that pass the filters, keeps their rows, and groups the kept rows by the read's own columns. The grouping can have more than one column, date buckets, joined columns and row-level Calculated Fields. A `NULL` group that passes keeps its rows. Run totals count only the kept rows. The check reads the source one more time.

Scripts that call the HTTP Data endpoint directly send `havingGroupBy` as base64url-encoded JSON, the same as `filter` and `dateTrunc`. An older server ignores the parameter and checks the filters at the read's own grouping. See [Read Data Mart data](../../docs/plugins/authoring-guide.md#read-data-mart-data) and [Stream Data Mart rows](../../docs/api/api-client.md#stream-data-mart-rows).

<!-- markdownlint-disable-file MD041 MD036 -->
