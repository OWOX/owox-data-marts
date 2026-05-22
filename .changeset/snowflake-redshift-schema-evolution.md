---
'owox': minor
---

# Automatic schema evolution when adding fields to Snowflake and Redshift data marts

Previously, adding new fields to an existing Snowflake or Redshift data mart caused MERGE or INSERT failures with "invalid identifier" or "column does not exist" errors. This happened because the storage layer did not check the live table schema and skipped the ALTER TABLE step needed to add the new columns.

Now, both Snowflake and Redshift storages query the real table schema on every run and automatically add any missing columns via ALTER TABLE before writing data. Users can safely add fields to an existing data mart without any manual database intervention.
