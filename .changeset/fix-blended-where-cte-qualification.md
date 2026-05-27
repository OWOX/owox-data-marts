---
'owox': minor
---

# Fix: SQL generation errors in blended reports

Two related fixes in the blended-report SQL builder:

- **Ambiguous column errors in filters and sorting.** Blended reports that filtered or sorted on a column whose name also existed in another joined data mart (for example, a shared `date` join key) failed with database errors like `Column name date is ambiguous`. The generated WHERE and ORDER BY clauses referenced bare column names while the rest of the query already qualified every column with its CTE alias. The query builder now qualifies every WHERE and ORDER BY reference with the correct CTE alias (`main.<col>` for native columns, `<subsidiary>.<alias>` for blended fields, including hidden ones referenced only by filters). Filtering or sorting on a native column that isn't selected for display also now correctly projects that column into the main CTE, so those queries no longer fail with "unknown column" errors.
- **Duplicate CTE names in joined chains.** Two relationships sharing the same `targetAlias` (legal — uniqueness is scoped to `sourceDataMart`) made the SQL builder emit two CTEs with the same name, and the query failed at run / view-SQL / Looker Studio time. CTE names are now derived from the full `aliasPath` (dots → underscores), so every chain gets a unique identifier. The previous targetAlias-collision validation is replaced by a defence-in-depth `cteName` check that surfaces the (rare) path-segment-flatten case with an actionable error.
