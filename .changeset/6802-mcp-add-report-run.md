---
'owox': minor
---

Run newly created push-destination reports immediately by default when they are created through MCP `add_report`, and return the initial `run_id` for status polling. Use `run_immediately: false` for configuration-only creation; Looker Studio remains pull-based. If queueing fails after creation, the response preserves the report id and directs the assistant to retry with `run_report` instead of creating a duplicate report or Google Sheet.
