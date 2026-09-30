---
'owox': minor
---

**Unchecking a column in the OWOX Extension no longer fails Save & Run**

Previously, unchecking a column in the Google Sheets Extension or the Excel add-in left its aggregation, date bucket and sort behind, and **Save & Run** failed with `Output controls validation failed. Sort column not selected: … Aggregation column not selected: …`. The report saved only after those rules were removed one by one in Output controls.

Now the Extension removes the rules that hang on an unchecked column:

- The aggregation and date bucket on the column go with it, together with a metric filter bound to that aggregation.
- The sort on the column goes too, whether or not the report still aggregates. A report sorted by a column it does not print skips the automatic collapse and delivers raw rows, so the Extension no longer offers such a sort either. One saved before stays and is not marked as broken, so such a report stays uncollapsed until you remove it.
- **Reset** above the column list returns the columns together with their aggregations, date buckets, metric filters and sorts to the last saved state. A saved sort the report can no longer sort by, for example after you add a Unique Count, stays removed.

This covers the row checkboxes, the checkbox that selects or clears all columns, and unchecking a disconnected column. See [Report Output Controls](../../docs/getting-started/setup-guide/output-controls.md#sort).

Also fixed in the Extension:

- Editing a metric filter, a filter on an aggregated value such as the Sum of Revenue, keeps it a metric filter. Before, the edit turned it into a filter on the rows. The filter lists now name the aggregate, for example `Sum greater than: 100`.
- Unchecking every column shows **Select at least one column** and does not save. Before, an empty selection delivered every column, or failed on the server when the report had slices, a sort or a filter on an aggregating calculated field. A Unique Count on its own still saves, as a metrics-only report.
- Saving from the Extension keeps the column list a report was saved with. A report made in the web app or through MCP with every native column selected used to lose its automatic duplicate collapse the first time it was saved from the Extension.
- Adding a slice to a report that lists no columns now shows the automatic aggregation that the report gets on delivery.

<!-- markdownlint-disable-file MD041 MD036 -->
