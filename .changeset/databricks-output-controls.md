---
'owox': minor
---

# Add output controls for Databricks data marts

Add report-level output controls (filters, slices, sort, limit) for Databricks data
marts. Filter values are inlined as escaped SQL literals (Spark-correct backslash + quote
escaping); substring matchers use `contains`/`startswith`/`endswith` and regex uses
`RLIKE` so user `%`/`_` stay literal; date/time comparisons are cast to the column type.
Works for the web app and the Google Sheets extension.
