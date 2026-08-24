---
'owox': minor
---

# Report filters: one "is blank" pair instead of four null/empty operators

A blank spreadsheet cell renders identically whether the warehouse holds `NULL`, an empty string, or whitespace — so offering "is empty" and "is null" side by side forced users to guess, and the wrong guess silently returned 0 rows. The filter picker now offers a single pair, **is blank** / **is not blank**, defined by what the cell shows rather than by warehouse state.

The pair is type-aware on every supported storage (BigQuery, Athena, Redshift, Snowflake, Databricks): a string column is blank when it is `NULL`, `''`, or whitespace-only; a number, date, time, or boolean column is blank only when `NULL`. The MCP `query_data_mart` and report tools advertise the same single pair, and the Data API accepts `is_blank` / `is_not_blank` in filter rules.

Nothing saved breaks: reports and API calls that use the previous `is_empty`, `is_not_empty`, `is_null`, or `is_not_null` operators keep working with their exact previous semantics, and saved rules still display under their original names. Only the menus stop offering them.
