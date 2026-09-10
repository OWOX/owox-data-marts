---
'owox': minor
---

Keep report output controls consistent with the column selection and the Data Mart schema.

- Unchecking a column in the report editor now removes the aggregation and date bucket set on it, and its sort rule when the report aggregates. Filters and slices stay.
- A report that does not aggregate can sort by any column of the Data Mart, selected or not, the same way a filter works. Once the report aggregates, sorting stays limited to the selected columns. A calculated field is sortable only while selected.
- An aggregation or date bucket on a column that is missing from the Data Mart schema is reported as a disconnected column, with the column named, instead of a misleading "not selected" or "unknown type" error.
- A scheduled run drops a sort rule on a column that is missing from the schema and continues, with a warning in the logs, instead of failing. The limit is kept, so under a limit the delivered rows may differ from the ones the sort used to pick.
- The "Output controls validation failed" message now names the rules that failed and the columns they reference, so run history, MCP clients, and the Google Sheets extension show the reason.
