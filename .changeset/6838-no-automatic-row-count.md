---
'owox': minor
---

# The "Row Count" column is removed from aggregated reports

Previously, every aggregated report automatically included a `Row Count` (`COUNT(*)`) column, even though it was never selected. The column has been removed: reports — and the MCP and HTTP data endpoints — now return only the columns you selected. If you need the number of underlying rows per group, apply the **Count** aggregation to a column that is always filled (an ID column works well); to count unique entities, use a Unique Count. A column of your own named "Row Count" is also no longer rejected in aggregated reports.

## What changes in existing reports

- **Google Sheets**: on its next run, an aggregated report removes the `Row Count` column from the sheet structurally, shifting everything to its right one column left. Formulas and pivots referencing that range move with it — repoint anything that read `Row Count` to an explicit **Count** column first.
- **Looker Studio**: `Row Count` was a schema field of the data source, and Looker Studio keeps requesting fields by their stored names. A chart built **only** on `Row Count` starts failing with an error naming the missing field; a chart that also uses other fields keeps working but silently drops the `Row Count` column. Open the data source and use **Refresh fields**, then rebuild the affected metric on an explicit **Count** field. Because report data is cached, individual reports switch to the new column set gradually as their cache entries expire (from minutes up to the cache lifetime configured on the report).
