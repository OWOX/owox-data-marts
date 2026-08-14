---
'owox': minor
---

# Reports no longer add a "Row Count" column automatically

Previously, every aggregated report automatically included a `Row Count` (`COUNT(*)`) column, even though it was never selected. Reports — and the MCP and HTTP data endpoints — now return only the columns you selected. If you need the number of underlying rows per group, apply the **Count** aggregation to a column that is always filled (an ID column works well). A column of your own named "Row Count" is also no longer rejected in aggregated reports.
