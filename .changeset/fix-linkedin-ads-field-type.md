---
'owox': minor
---

# Fix LinkedIn Ads field type definitions

- Fix `runSchedule` field in campaign schema: remove duplicate entry and set correct type to `OBJECT` instead of `NUMBER`
- Fix `id` fields in account, campaign, and campaign group schemas to use `STRING` type matching the LinkedIn API
- Fix `dateRangeStart` and `dateRangeEnd` fields in analytics schema to use `DATE` type for proper date handling and BigQuery partitioning
