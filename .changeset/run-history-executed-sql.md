---
'owox': minor
---

# Run History shows the executed SQL for report runs

Report runs now record the exact SQL that ran — with output controls (filters, sorting,
limit) applied and filter parameter values inlined as literals, matching the generated-SQL
preview — and surface it in Run History as a dedicated **Executed SQL** block.
Previously the run only stored the raw Data Mart query, so the recorded SQL did not reflect
the parameters used at run time. This covers report exports to Google Sheets, Email, Slack,
Google Chat, and Microsoft Teams, as well as Looker Studio. The block appears only when the
run actually applied output controls or blended SQL.
