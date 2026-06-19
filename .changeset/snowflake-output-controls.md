---
'owox': minor
---

# Add output controls for Snowflake data marts

Add report-level output controls (filters, slices, sort, limit) for Snowflake data marts. Filter values are inlined as escaped SQL literals (Snowflake-correct backslash + quote escaping); substring matchers use CONTAINS/STARTSWITH/ENDSWITH (not LIKE) so user `%`/`_` stay literal, and regex uses `REGEXP_INSTR(...) > 0` for partial matching; date/time comparisons are CAST to the column type. Works for the web app and the Google Sheets extension.
