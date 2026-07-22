---
'owox': minor
---

# Keep NULL rows for "is not" / "does not contain" report filters

Negative filter operators (`is not`, `does not contain`, `does not match regex`) no longer drop rows where the filtered column is NULL. SQL three-valued logic previously excluded those rows; filters and slices now keep them so missing values behave like "not equal to X". Add `is not null` or `is not empty` when you want to exclude NULLs. Applies to BigQuery, Athena, Redshift, Snowflake, and Databricks.

In blended reports this also changes post-join negative filters on `LEFT JOIN`ed columns: a filter like `crm.status is not Churned` now keeps source rows with no join match at all, where it previously acted as an implicit inner join. Add an `is not null` filter on the joined column to drop unmatched rows.

Metric (HAVING) filters share the same logic, so a negative metric filter such as `SUM(amount) ≠ 0` now also keeps groups whose aggregate is NULL (e.g. all-NULL input).
