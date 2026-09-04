---
'owox': minor
---

# MCP report tools: update the report you have instead of creating another

When a report is created through the assistant and the next request changes it — "add a filter", "sort by revenue", "rename it" — the assistant now updates that report instead of creating a second one. `add_report` refuses a report whose fields duplicate one the same user already created on the same data mart and destination, returning `error_code: similar_report_exists` with the existing report's definition, so the assistant can switch to `update_report`; `allow_similar: true` creates a separate report when that is what the user wants.

`update_report` now returns the report as it is after the update (fields, filters, slices, aggregations, date buckets, sort, limit, and for Google Sheets the spreadsheet and sheet) and, by default, runs a Google Sheets report again when the export changed, so the sheet reflects the new definition. Email, Slack, Microsoft Teams, and Google Chat reports are not re-sent by an update unless `run_immediately: true` is passed, since a run delivers the message to every recipient or channel; a name-only or message-only change never triggers a run. `get_data_mart_reports` lists the same definition for every report — including Unique Count metrics and the report-only `STRING_AGG` / `ANY_VALUE` aggregations, which the report tools now accept so a UI-created report round-trips — plus `created_by_current_user` and `created_at`, so the assistant can recognize an existing report before creating one.

Related Google Sheets exports can now share one document: `add_report` accepts `spreadsheet_id` and adds the report as a new sheet of that spreadsheet instead of creating another file. The MCP instructions steer the assistant to the report tools for any export or delivery, rather than copying query rows into a file or document through another integration.
