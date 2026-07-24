---
'owox': minor
---

# More reliable connector runs during cancellation and long backfills

Previously, cancelling a connector run could fail to stick: the run reappeared
as running minutes later, and its logs were lost. Long BigQuery backfills on
OAuth also stopped after about an hour with an "Invalid Credentials" error.
Now cancelled runs stay cancelled and keep their logs, and BigQuery refreshes
its access token mid-run so long backfills continue.

A run can still fail with "Invalid Credentials" if its saved token expired
before the run started. Reconnect the BigQuery destination, or use a service
account, until token saving arrives.
