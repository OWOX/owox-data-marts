---
'owox': minor
---

# Cleaner connector run logs: warnings for customer-actionable failures

Connector failures you can fix yourself now appear as warnings, not errors.
This covers expired or revoked credentials — Facebook sessions and permissions,
TikTok advertiser access, dead refresh tokens, expired Google storage
authorization — and runs you cancel yourself.

Run logs are also easier to read. A crash and its stack trace now form a single
entry instead of one entry per line, and TikTok no longer records each error
twice.
