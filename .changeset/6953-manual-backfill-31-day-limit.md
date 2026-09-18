---
'owox': minor
---

# Limit manual backfill to 31 days per run

A manual backfill run now covers at most 31 days, so a full calendar month always fits in one run. The
**Manual Run** form explains this limit, shows how many days the chosen period covers, and rejects longer
periods before the run starts. The manual-run API rejects such requests with a clear error as well.

To reload a longer history, start several backfills with consecutive periods, one after another.
