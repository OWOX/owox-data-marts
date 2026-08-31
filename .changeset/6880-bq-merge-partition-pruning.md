---
'owox': minor
---

# Partition Pruning for BigQuery Connector Imports

Incremental connector runs into Google BigQuery now scan only the partitions they write, not the whole destination table. Before, every incremental MERGE scanned the full table history, so daily import cost grew with table age. A measured example: one two-day import dropped from 1.16 GB scanned to 3.89 MB. The saving applies to time-series tables partitioned by date, such as ad performance reports. Entity tables without a date column keep their current behavior. This lowers query costs and helps connectors stay within BigQuery daily quotas.
