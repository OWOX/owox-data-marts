---
'owox': minor
---

# Correct column types and aggregations for blended fields in Looker Studio

When a Data Mart pulls in fields from joined Data Marts (blended fields), the Looker Studio connector now reports the right column types and respects the aggregation function you selected for each field.

- `COUNT` and `COUNT_DISTINCT` blended fields appear as numeric metrics — no more text dimensions for counts.
- `STRING_AGG` and `ANY_VALUE` blended fields appear as dimensions, so Looker Studio doesn't try to sum already-aggregated values.
- `MIN` / `MAX` / `SUM` blended fields use the matching default aggregation in Looker Studio (`MIN`/`MAX`/`SUM`), instead of always defaulting to `SUM`.
- `COUNT_DISTINCT` is no longer marked as re-aggregatable, preventing inflated totals when the field is used across filters or breakdowns.
- The fix works consistently across BigQuery, Snowflake, Redshift, Athena, and Databricks.

Native (non-blended) numeric fields continue to behave as before — they default to `SUM` and remain re-aggregatable.
