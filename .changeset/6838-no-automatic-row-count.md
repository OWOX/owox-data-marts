---
'owox': minor
---

# The "Row Count" column is removed from aggregated reports

Previously, every aggregated report automatically included a `Row Count` (`COUNT(*)`) column, even though it was never selected. The column has been removed: reports — and the MCP and HTTP data endpoints — now return only the columns you selected. If you need the number of underlying rows per group, apply the **Count** aggregation to a column that is always filled (an ID column works well); to count unique entities, use a Unique Count. A column of your own named "Row Count" is also no longer rejected in aggregated reports.
