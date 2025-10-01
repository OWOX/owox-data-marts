---
'owox': minor
---

# Updated Google BigQuery & Google Sheets authentication

- Switched to JWT-based auth client (`google-auth-library`).
- Removed deprecated credential paths and warnings.
- Improved reliability of loads/queries.
- No action required — existing service account JSON keys continue to work.
