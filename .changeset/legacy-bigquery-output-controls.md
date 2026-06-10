---
'owox': minor
---

# Add output controls for Legacy Google BigQuery data marts

Add report-level output controls (filters, slices, sort, limit) for Legacy Google BigQuery data marts, reaching parity with the standard Google BigQuery storage. Reuses the BigQuery SQL renderer and adapter, so filtered/sorted/limited reports — including the generated-SQL preview and the Looker Studio cached path — now work for legacy BigQuery marts in both the web app and the Google Sheets extension.
