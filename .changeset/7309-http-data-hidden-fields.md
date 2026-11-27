---
'owox': minor
---

**Apps on the HTTP Data API can open one record by its hidden key**

Analysts often hide technical keys such as `obligation_id` so they stay out of reports. An app that reads a Data Mart over the HTTP Data API often needs that key to show one record per row and read it back later. Until now the API refused such a column with "Hidden columns: obligation_id", so the only fix was to show the key again, which put it back on every report picker and into MCP answers. Now the HTTP Data API returns a hidden column of the Data Mart when the request names it.

- Name the column in `column`, or in a `filter`, `sort`, `aggregation`, `dateTrunc` or `havingGroupBy` rule, for example `column=obligation_id` with a filter `obligation_id eq 42`.
- Reading all columns (`columns=*`, `columns=**`, or no `column` at all) still leaves hidden columns out, so existing clients get the same columns as before.
- Reports, report runs, destinations and MCP keep hiding these columns. Hidden calculated fields and the hidden fields of a joined Data Mart stay unavailable to the API too.

See [Output Controls](../../docs/getting-started/setup-guide/output-controls.md#hidden-columns-warning).
