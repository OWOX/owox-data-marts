---
'owox': minor
---

# Add output controls for Snowflake data marts

Add report-level output controls (filters, slices, sort, limit) for Snowflake data marts. Filter values are inlined as escaped SQL literals (Snowflake-correct backslash + quote escaping); substring matchers use CONTAINS/STARTSWITH/ENDSWITH and regex uses RLIKE so user `%`/`_` stay literal; date/time comparisons are CAST to the column type. Works for the web app and the Google Sheets extension.
