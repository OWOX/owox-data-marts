---
'owox': minor
---

# Fix validation for connector definitions in data marts

Fixed data mart validators to allow early validation success for connector definitions. Connector definitions no longer require credential validation during publish, resolving validation failures for Athena, BigQuery, Databricks, Redshift, and Snowflake data storage types.
