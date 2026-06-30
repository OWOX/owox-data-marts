---
'owox': minor
---

# Data Mart report aggregations

Reports can now aggregate Data Mart data server-side, across all supported storages (BigQuery, Athena, Snowflake, Redshift, Databricks):

- **Group-by + metric functions** — `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`, and percentiles `P25`/`P50`/`P75`/`P95`, rendered with the correct per-dialect SQL. Group-by is implied: every selected column without an aggregation rule becomes a grouping key.
- **Date bucketing (`dateTruncConfig`)** — group a date/timestamp dimension by `DAY`/`WEEK`/`MONTH`/`QUARTER`/`YEAR` (e.g. "revenue by month"), with an optional per-rule IANA `timeZone` so the value is converted to that zone before truncation (absent = no conversion). Rendered with the correct per-dialect SQL.
- **Aggregated column naming** — aggregated outputs are named `<column> | <TOKEN>` (an uppercase, spreadsheet-style function token, e.g. `revenue | SUM`, `customer_id | COUNTUNIQUE`) and carry the function's effective type.
- **Multiple aggregations per column** — a column can carry several functions, each rendered as its own output column (e.g. `SUM` and `AVG` of `amount`).
- **Auto Row Count** — aggregated reports automatically include a `Row Count` (`COUNT(*)`) column (no toggle).
- **Unique Count (`uniqueCountConfig`)** — an opt-in `COUNT(DISTINCT <primary key>)` metric (composite primary keys supported via per-dialect concatenation), rejected at save time when the Data Mart has no primary key.
- **Post-aggregation filtering (`HAVING`)** — a filter targeting an aggregated output column (a filter rule that carries its aggregate function) is applied as `HAVING` over the aggregate expression, auto-routed apart from row-level `WHERE` filters; the `(column, function)` pair must match a configured aggregation.
- **Joined (blended) Data Marts** — post-join aggregation over the joined result (an outer `GROUP BY`), in addition to the existing pre-join join-rollup.
- **Totals** — a per-column summary computed over the full filtered dataset (no grouping) as a DWH-side **separate query**: every selected numeric field is aggregated by all of its allowed functions (e.g. `SUM`/`AVG`/`MIN`/`MAX` of `cost`). Persisted at the run level and exposed on the run record; clients bridge to it via the existing run-id response header (totals are never merged into the row stream). Row Count and Unique Count are not part of totals.
- **Data-mart-level governance** — each schema field carries a dimension/metric role plus a type-derived set of **supported** aggregations (the menu the field may use — e.g. percentiles only for numerics) and an **on-by-default** subset, with a per-field override; reports may only aggregate with a function the field allows.
- **Report aggregation UI** — a dedicated **AGG** control (next to output controls) plus a per-field AGG icon configure grouping, multi-aggregation, date bucketing, and timezone.

Backend changes: three additive nullable report columns (`aggregationConfig`, `dateTruncConfig`, `uniqueCountConfig`), request/response API + OpenAPI contract, and save-time validation (column projection required for aggregated/date-trunc reports, function allowed for the field and numeric where required, date-trunc requires a date column, HAVING filters must target a configured aggregation and may not be pushed pre-join, `COUNT_DISTINCT`/`STRING_AGG` rejected on non-groupable `other`-category types, Unique Count requires a primary key).

**Deployment ordering:** the aggregate-function list is mirrored by the separate `google-sheets-extension` report picker, which has no compile-time guard against drift. The API change is additive and safe new-server / old-client, so **deploy the backend (this package) before** shipping an extension build that exposes new aggregation options — that avoids a new client requesting a function an old server doesn't yet accept.
