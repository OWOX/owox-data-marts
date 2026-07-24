---
'owox': minor
---

# Cleaner connector run logs: warnings for customer-actionable failures

Customer-actionable connector failures now log as warnings instead of errors.
This covers expired or revoked credentials (Facebook session and permission
errors, TikTok advertiser access errors, `invalid_grant` refresh-token
failures, expired Google storage authorization) and user-cancelled runs.

Connector crash output now arrives as a single log entry instead of one entry
per stack-trace line, and TikTok no longer logs each error twice.
