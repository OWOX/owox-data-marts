---
'owox': minor
---

# AI metadata generation for SQL data marts no longer requires dataset-creation permission

Generating AI metadata (field aliases and descriptions, data mart title and description) for a SQL-based data mart previously materialized a technical view in the `owox_internal_<location>` dataset, and creating that dataset on first use required the project-level `bigquery.datasets.create` permission — so users with data-only access (e.g. `BigQuery Job User` plus `BigQuery Data Viewer`) could not use the AI helper at all.

Sample rows for AI generation are now fetched through an inline derived table built from the data mart's own SQL (`SELECT <columns> FROM (<data mart sql>) LIMIT <n>`), so the AI helper needs exactly the permissions a regular report run needs:

- Plain `SELECT` definitions are inlined on every storage type except legacy Google BigQuery.
- `WITH`/CTE definitions are additionally inlined on Google BigQuery storage, where the SQL dialect accepts a CTE inside a parenthesized derived table; other storages keep the previous behavior for CTEs.
- Legacy Google BigQuery data marts, SQL that cannot be inlined, explicit table references, and non-SQL definitions (table, view, pattern, connector) continue to use the technical-view path, with the existing human-readable error if permissions are missing there.
