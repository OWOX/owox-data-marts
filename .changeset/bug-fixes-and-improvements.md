---
'owox': minor
---

# Bug fixes and improvements

- Fix data storage validation for Google Legacy BigQuery connector
- Fix missing dependencies for data destination and storage forms to avoid errors
- Fix duplicate trigger runs caused by MySQL deadlocks not being handled as transient errors
- Fix Google BigQuery storage not saving OAuth credentials and blocking OAuth-authenticated users from saving storage settings
- Fix field descriptions and primary key flags being lost after schema sync in Redshift and Snowflake data marts
