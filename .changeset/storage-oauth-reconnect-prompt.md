---
'owox': minor
---

# Clearer reconnect prompt when Google Storage access expires

Previously, when a storage's Google authorization expired, connector runs would start and then fail with a confusing authentication error, and other actions showed raw "Failed to refresh OAuth tokens" text. Now expired authorization is detected before a run starts and surfaced as a clear "Reconnect Storage" prompt, and the storage health indicator updates automatically when access is lost. This helps users quickly understand they need to reconnect the storage instead of troubleshooting opaque failures.
