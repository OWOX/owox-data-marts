---
'owox': minor
---

**Parallel reads of a SQL Data Mart on Google BigQuery no longer fail with a rate limit error**

A plugin page with many cards, such as Gyroscope, reads one SQL Data Mart many times at once. HTTP Data clients and the MCP `query_data_mart` tool can do the same. Previously some of these reads failed with `Exceeded rate limits: too many table update operations for this table` (HTTP 424), and others came back without totals. The cause: every read rewrote the Data Mart's view in Google BigQuery, and Google BigQuery allows 5 updates of one table in 10 seconds. Now a read rewrites the view only after the Data Mart's SQL changes, so parallel reads return their data and totals.

Only SQL Data Marts on Google BigQuery and Legacy Google BigQuery change. Snowflake, Databricks, AWS Redshift and AWS Athena are not affected.

<!-- markdownlint-disable-file MD041 MD036 -->
