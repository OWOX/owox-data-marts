---
'owox': minor
---

# Fix undefined values in BigQuery Storage and cleanup Facebook fields

- Fixed undefined values being stored as "undefined" strings instead of NULL in BigQuery Storage
- Removed non-working fields from Facebook Marketing adAccountInsightsFields schema
