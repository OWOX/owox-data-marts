---
'owox': minor
---

# Create and update reports with row filters through MCP

The `add_report` MCP tool accepts a new optional `filters` parameter — the same shape and operator vocabulary as `query_data_mart`'s `filters` — applied to the report's rows on every run. When a user explores data with a filtered query and asks to export it, the assistant can now create a report that matches exactly the numbers they saw, instead of silently exporting the full data mart. `update_report` accepts the same `filters` parameter to replace the row filters of an existing report (`[]` removes every filter; omitting the parameter keeps the current ones). Filters work for every destination type and are validated against the data mart schema before any side effect — for Google Sheets, before the sheet document is created.
