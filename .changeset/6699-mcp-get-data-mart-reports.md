---
'owox': minor
---

# Add a get_data_mart_reports MCP tool

AI assistants connected to OWOX over MCP can now list the reports tied to a data mart. Each report includes its destination, owner, all of its run schedules (a report can have several, each with a cron expression, timezone, and active flag), when it last ran, and the status of that last run — so you can review your reports without leaving the assistant.

Only reports on data marts you have access to are returned.
