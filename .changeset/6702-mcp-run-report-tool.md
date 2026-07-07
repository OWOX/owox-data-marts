---
'owox': minor
---

# Add run_report and get_report_run_status MCP tools

AI assistants connected to OWOX over MCP can now run a report by its id: `run_report` starts the run and returns immediately with just the report id and run id, while data is delivered to the report's push destination (Google Sheets, Email, Slack, Microsoft Teams, or Google Chat). `get_report_run_status` then reports the current outcome for that run — still running, success, failed with an error message, cancelled, interrupted, or restricted — along with `queued_at`, nullable `started_at`, and the backend `raw_status`.

While a run is in progress, the status response also carries `should_poll`, `stop_reason`, and an explicit guidance message that recommends polling about every 15 seconds. Assistants keep checking while `should_poll` is true, but can stop and show the run ids when a run stays queued too long or appears stuck.

Pull-based consumers — Data Studio and the HTTP Data API — fetch data themselves, so such reports cannot be run through `run_report`. Runs are billed as standard Report Runs for the destination, not as MCP queries. Starting a run requires the mcp:write scope; checking its status only requires mcp:read.
