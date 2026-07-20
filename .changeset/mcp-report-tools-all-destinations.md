---
'owox': minor
---

# Create and update reports for every destination type through MCP

The `add_report` MCP tool now supports all destination types, not just Google Sheets. Looker Studio reports are created with default settings (a data cache lifetime of 5 minutes), and the response includes instructions plus a setup-guide link the assistant relays so the user can connect Looker Studio to OWOX — the same guide link is now also part of the `add_destination` response for `looker_studio`. Email, Slack, Microsoft Teams, and Google Chat reports take a new `message` parameter with the subject (defaults to the report name) and the body template (supports the `{{table}}` placeholder); recipients stay on the destination and the send condition gets the product default ("Send always"). The `update_report` tool accepts the same `message` parameter to change the subject and/or body of an existing email-family report, preserving everything else including the send condition. Every `add_report` response now also reports the `destination_type` it created.
