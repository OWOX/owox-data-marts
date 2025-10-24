---
'owox': minor
---

# Remove MaxFetchingDays parameter and improve incremental fetching logic

Removed the `MaxFetchingDays` parameter from all data source connectors. The incremental data fetching now works as follows:

- **First run (no state)**: Data fetching starts from the 1st of the previous month
- **Subsequent runs**: Data is fetched from the `LastRequestedDate` (with `ReimportLookbackWindow` applied) up to today
- **Manual backfill**: Continues to work as before, fetching data for the specified date range
