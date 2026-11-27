---
'owox': minor
---

**Apps on the HTTP Data API can open one record by its hidden key**

**Google BigQuery reports with no column selection no longer deliver a field hidden inside a RECORD.** A report that selects no columns delivers every column of its Data Mart, and such a field used to reach Google Sheets and other destinations although reporting lists treated it as hidden. In Google Sheets, the columns to its right move one place left; the report's output schema and MCP stop listing it. Show the field in reports again if you still need it.

**Google BigQuery reports read a nested field of an empty RECORD as empty.** When a row's RECORD was NULL, its nested field took the value of a top-level column with the same name, if the Data Mart had one.

Analysts often hide technical keys such as `obligation_id` so they stay out of reports. An app that reads a Data Mart over the HTTP Data API often needs that key to show one record per row and read it back later. Until now the API refused such a column with "Hidden columns: obligation_id", so the only fix was to show the key again, which put it back on every report picker and into MCP answers. Now the HTTP Data API returns a hidden column of the Data Mart when the request selects it by name.

- Select the column with `column=obligation_id`. A `filter`, `sort`, `aggregation`, `dateTrunc` or `havingGroupBy` rule may use it by name too, for example a filter `obligation_id eq 42`; only `column` adds it to the rows.
- Reading all columns (`columns=*`, `columns=**`, or no `column` at all) returns the same columns as before: hidden columns stay out, and a visible RECORD still comes back whole, a field hidden inside it included.
- Reports, report runs, destinations and MCP keep hiding these columns. Hidden calculated fields and the hidden fields of a joined Data Mart stay unavailable to the API too.

See [Output Controls](../../docs/getting-started/setup-guide/output-controls.md#hidden-columns-warning).
