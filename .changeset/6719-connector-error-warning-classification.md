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

TikTok runs that lose data now fail instead of reporting success. Previously a
run could finish successfully even when every write to your storage failed. You
lost the data with no warning. Such runs now fail and notify you, so you can
find and fix the cause. If TikTok runs start failing after this release, check
the run history for the storage error behind them.
