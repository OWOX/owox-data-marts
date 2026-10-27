---
'owox': minor
---

**Shared SQL logic stays in one place: build a Data Mart on top of another**

An analyst who needed a narrower version of an existing Data Mart — retail orders out of all orders — had to copy its SQL into a new Data Mart. When the original changed, the copy didn't, and the two started reporting different numbers. Now a SQL Data Mart can reference another Data Mart of the same Storage in its `FROM` clause, so the logic lives in one place and every Data Mart built on it follows its changes.

Type `@` in the SQL editor to pick a published Data Mart; it's inserted as `[Orders](dm:<id>)`. When the query runs, OWOX puts that Data Mart's own SQL in place of the reference, so the warehouse receives plain SQL and **Preview SQL** of a report shows it down to the warehouse tables. People who read the new Data Mart don't need access to the one it references.

- A column that keeps its name takes the referenced Data Mart's alias and description, read-only, so business names are written once and stay in step. Primary keys aren't taken over.
- Changing the input source of a referenced Data Mart, or deleting it, now lists the Data Marts that reference it, so you can check them first.
- Available on Google BigQuery, AWS Athena, Snowflake, AWS Redshift and Databricks, not on Legacy Google BigQuery storages. See [Reference another Data Mart](../../docs/getting-started/setup-guide/sql-data-mart.md#reference-another-data-mart).
- API: `GET /api/data-marts` accepts `storageId`, and `GET /api/data-marts/{id}/input-source-change-impact` also returns `referencingDataMartsCount` and `referencingDataMarts`.
