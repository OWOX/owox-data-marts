---
'owox': minor
---

# Criteo access token refresh on expiry

Previously, the Criteo connector reused a cached access token for the entire connector run without checking whether it had expired, causing request failures mid-run. Now tokens are proactively refreshed 60 seconds before they expire, and if an API request still gets an expired-token error, the token is refreshed and the request retried automatically. This prevents mid-run authentication failures for long-running Criteo syncs.
