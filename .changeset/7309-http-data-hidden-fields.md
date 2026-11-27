---
'owox': minor
---

**Apps on the HTTP Data API can open one record by its hidden key**

**Google BigQuery reports that read every column of a RECORD no longer deliver a field hidden inside it.** Such a field used to reach Google Sheets and other destinations although reporting lists treated it as hidden; show it in reports again if you still need it.

Analysts often hide technical keys such as `obligation_id` so they stay out of reports. An app that reads a Data Mart over the HTTP Data API often needs that key to show one record per row and read it back later. Until now the API refused such a column with "Hidden columns: obligation_id", so the only fix was to show the key again, which put it back on every report picker and into MCP answers. Now the HTTP Data API returns a hidden column of the Data Mart when the request selects it by name.

- Select the column with `column=obligation_id`. A `filter`, `sort`, `aggregation`, `dateTrunc` or `havingGroupBy` rule may use it by name too, for example a filter `obligation_id eq 42`; only `column` adds it to the rows.
- Reading all columns (`columns=*`, `columns=**`, or no `column` at all) still leaves hidden columns out, so existing clients get the same columns as before.
- Reports, report runs, destinations and MCP keep hiding these columns. Hidden calculated fields and the hidden fields of a joined Data Mart stay unavailable to the API too.

See [Output Controls](../../docs/getting-started/setup-guide/output-controls.md#hidden-columns-warning).
