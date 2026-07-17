---
'owox': minor
---

# Create Looker Studio reports with the add_report MCP tool

The `add_report` MCP tool now supports Looker Studio destinations in addition to Google Sheets. Pointing it at a Looker Studio destination creates the report with default settings (a data cache lifetime of 5 minutes) — no extra parameters are needed or accepted. Google Sheets behavior is unchanged: a new Sheet is still auto-created and linked, and the sheet-specific response fields (`sheet_url`, `placed_in_root`, `shared_with_requester`) are now returned only for Google Sheets reports. Other destination types are still rejected with a clear message naming the type.
