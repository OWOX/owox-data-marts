---
'owox': minor
---

# Facebook imports survive an inaccessible ad account

Previously, the Facebook Marketing connector aborted the whole import as soon as a single ad
account returned an error. Because accounts are fetched one after another, one account the access
token could no longer reach — typically a client that stopped sharing it — discarded the accounts
already fetched and every account still queued behind it. The failure repeated on each following
run, since the import never got far enough to record its progress, so the data stayed frozen until
someone removed that account from the configuration by hand.

Now, an account that fails is logged and skipped, and the import carries on with the remaining
ones. If every account fails, the run stops with an error instead of reporting success: that points
to a global cause, such as an expired access token, and finishing quietly there would hide an
outage behind a run that imported nothing at all.
