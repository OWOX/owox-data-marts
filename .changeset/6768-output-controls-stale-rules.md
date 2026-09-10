---
'owox': minor
---

# Keep report output controls consistent with the column selection and the Data Mart schema

- Unchecking a column in the report editor now removes the aggregation and date bucket set on it, a metric filter bound to that aggregation, and its sort rule when the sort can no longer resolve: the report aggregates, the column is a calculated field, or the column is missing from the Data Mart schema. Row filters and slices stay.
- A report that does not aggregate can sort by any column of the Data Mart, selected or not, the same way a filter works. Once the report aggregates, sorting is limited to the selected columns: adding an aggregation, a date bucket or a Unique Count removes a sort rule on an unselected column. A calculated field is sortable only while selected.
- An aggregation or date bucket on a column that is missing from the Data Mart schema is reported as a disconnected column, with the column named, instead of a misleading "not selected" or "unknown type" error.
- A scheduled run, and a Looker Studio data pull, drops a sort rule on a column that is missing from the schema and continues, with a warning in the logs, instead of failing. The limit is kept, so under a limit the delivered rows may differ from the ones the sort used to pick. Saving the report, the Generated SQL preview and ad-hoc queries still report the missing column.
- The "Output controls validation failed" message now names the rules that failed and the columns they reference, so run history, MCP clients, and the Google Sheets extension show the reason.
