---
'owox': minor
---

**Apps on the HTTP Data API can open one record by its hidden key**

Analysts often hide technical keys such as `obligation_id` so they stay out of reports. An app that reads a Data Mart over the HTTP Data API often needs that key to show one record per row and read it back later. Until now the API refused a hidden column, so the only fix was to show the key again, which put it back on every report picker and into MCP answers. Now the HTTP Data API returns a hidden column of the Data Mart when the request selects it by name.

- Select the column with `column=obligation_id`. A `filter`, `sort`, `aggregation`, `dateTrunc` or `havingGroupBy` rule may use it by name too, for example a filter `obligation_id eq 42`; only `column` adds it to the rows.
- Reading all columns (`columns=*`, `columns=**`, or no `column` at all) returns the same columns as before.
- Reports, report runs, destinations and MCP keep hiding these columns.
- A hidden calculated field and a field inside a RECORD stay unavailable by name. Select a hidden RECORD as a whole instead.
- A request is refused when a hidden column it selects shares its name with a part of another selected column, for example `id` next to `customer.id`. Leave one of the two out.

See [Output Controls](../../docs/getting-started/setup-guide/output-controls.md#hidden-columns-warning).
