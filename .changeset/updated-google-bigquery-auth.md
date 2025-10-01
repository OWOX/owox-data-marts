---
'owox': minor
---

# Migrated BigQuery clients to google-auth-library

We updated BigQuery authentication to a modern, secure flow using google-auth-library.

- Improved reliability of BigQuery loads (fixes intermittent 401 Unauthorized)
- Removed deprecated authentication paths and warnings
- No action required: existing service account JSON keys continue to work
- If you use external sources (e.g., Drive), ensure your service account has the required permissions
