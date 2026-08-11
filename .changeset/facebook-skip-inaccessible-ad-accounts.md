---
'owox': minor
---

# Facebook imports survive an inaccessible ad account

Previously, the Facebook Marketing connector aborted the whole import as soon as a single ad
account returned a permission error. Because accounts are fetched one after another, one account
the access token could no longer reach — typically a client that stopped sharing it — discarded the
accounts already fetched and every account still queued behind it. The failure repeated on each
following run, since the import never got far enough to record its progress, so the data stayed
frozen until someone removed that account from the configuration by hand.

Now, an account that returns a permission error is skipped and the import carries on with the
remaining ones, for catalog and time-series data alike. Each skip is raised as a warning on the run,
so an account that is quietly missing from the destination is visible without reading the run log.
Only permission failures are skipped: a storage write or an exhausted transient error still fails
the run, which keeps the import from moving past a day whose data was never stored. If every account
fails, the run stops with an error naming each one, because that points to a global cause such as an
expired access token — and finishing quietly there would hide an outage behind a run that imported
nothing at all.
