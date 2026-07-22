---
'owox': minor
---

# Create and update reports with query-parity output controls through MCP

The `add_report` MCP tool accepts new optional `filters`, `slices`, `aggregations`, `date_buckets`, `sort`, and `limit` parameters — the same shape and vocabulary as `query_data_mart` — applied to the report on every run. When a user explores data with a filtered or aggregated query and asks to export it, the assistant can now create a report that matches exactly the numbers they saw, instead of silently exporting the full raw data mart. `update_report` accepts the same parameters as replacements for an existing report (`[]` removes a control, `null` removes the row limit; omitting a parameter keeps the current value; `filters` and `slices` replace the stored filter rules as one unit). All controls work for every destination type and are validated against the data mart schema before any side effect — for Google Sheets, before the sheet document is created.
