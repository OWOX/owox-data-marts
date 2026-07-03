---
'owox': minor
---

# Automatic retry and clearer error messages for Criteo Ads imports

Previously, a temporary server error from Criteo would fail the whole import immediately, and the logs only showed a raw stack trace with no explanation of what went wrong. Now, Criteo Ads imports automatically retry on server errors, rate limits, and network issues, so brief outages on Criteo's side no longer stop your import. When an import does fail, the logs now include a short summary — the HTTP status, the provider's own error message, and a note when the failure looks temporary — so you can tell at a glance whether it's worth just re-running the import.
