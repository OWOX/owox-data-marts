---
'owox': minor
---

# Limit manual backfill to 31 days per run and split longer periods into sequential runs

A manual backfill run now covers at most 31 days, so a full calendar month always fits in one run. The
**Manual Run** form explains this limit and previews how many runs your period needs before you start.

A backfill period longer than 31 days is split into sequential runs of up to 31 days each. Only one run of the
sequence is processed at a time; the next run starts once the previous one finishes. Each run appears in Run
History labeled with its position (for example `Backfill 2/4`) and its date range.

If one run in the sequence fails, the remaining runs still start. Cancelling a run stops the remaining runs; start a
new backfill from the next date to continue.

The connector runtime also enforces the 31-day limit as a safeguard, so a manual backfill request for a longer
period fails with a clear message instead of running an unbounded import.
