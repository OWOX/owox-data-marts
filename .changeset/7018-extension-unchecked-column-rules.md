---
'owox': minor
---

**Unchecking a column in the OWOX Extension no longer fails Save & Run**

Previously, unchecking a column in the Google Sheets Extension or the Excel add-in left its aggregation, date bucket and sort behind, and **Save & Run** failed with `Output controls validation failed. Sort column not selected: … Aggregation column not selected: …`. The report saved only after those rules were removed one by one in Output controls.

Now the Extension removes the rules that hang on an unchecked column:

- The aggregation and date bucket on the column go with it, together with a metric filter bound to that aggregation.
- The sort on the column goes too, whether or not the report still aggregates. A report sorted by a column it does not print skips the automatic collapse and delivers raw rows, so the Extension no longer offers such a sort either. One saved before stays and is not marked as broken.
- **Reset** above the column list returns the columns together with their aggregations, date buckets, metric filters and sorts to the last saved state.

This covers the row checkboxes, the checkbox that selects or clears all columns, and unchecking a disconnected column. See [Report Output Controls](../../docs/getting-started/setup-guide/output-controls.md#sort).

<!-- markdownlint-disable-file MD041 MD036 -->
