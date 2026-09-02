---
'owox': minor
---

# Cheaper Incremental Imports into Google BigQuery

Incremental connector runs into Google BigQuery now read only the days they update. Before, every incremental run scanned the whole destination table, including all of its history. As a table grew, each daily import cost more, even when it brought the same amount of new data. Now the import touches only the partitions for the imported dates, so the cost stays flat over time. This applies to time-series tables partitioned by date, such as ad performance reports. Entity tables without a date column, such as campaign lists, keep their current behavior. Users see lower BigQuery query costs and fewer daily quota errors.
