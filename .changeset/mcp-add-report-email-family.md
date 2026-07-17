---
'owox': minor
---

# Create email, Slack, Teams, and Google Chat reports with the add_report MCP tool

The `add_report` MCP tool now supports the messaging destinations in addition to Google Sheets and Looker Studio. A new optional `message` parameter carries the subject (defaults to the report name) and the body template (supports the `{{table}}` placeholder that renders the report's result table); it is required for email-family destinations and rejected for others. Recipients and channels stay on the destination itself, and the send condition always gets the product default ("Send always") — conditional sending can be configured in the OWOX Data Marts UI.
