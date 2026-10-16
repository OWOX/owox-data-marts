---
'owox': minor
---

**Backfill any past period**

A manual backfill is no longer limited to 31 days. Pick any past start and end date, and OWOX runs the period as a chain of runs, one segment of up to 31 days each. Previously a longer period was rejected, and you had to start a separate backfill for every month.

- Each segment appears as its own run in **Run History**, named with its period and position, such as "segment 3 of 18".
- The **Manual Run** form shows how many days the period covers and how many runs it counts as. A period over 31 days asks you to confirm how many runs it costs before it starts. A period over a year also notes that it can take hours.
- A segment counts as one run once any of its accounts loads data. A segment that loads nothing, or is cancelled or interrupted, does not count.
- The start date cannot be earlier than 2000-01-01. This guard catches typos such as a wrong year.
- A failed segment never stops the rest of the backfill, so OWOX attempts the whole period. The failed run names the last day it loaded.
- If the project becomes restricted, the backfill stops. The last run names the segments that did not load, and OWOX does not resume them when the restriction lifts.
- Cancelling the active run stops the whole backfill. Finished segments stay loaded and keep their history.
- If a restart or deploy delays a segment, OWOX queues it again automatically within 15 minutes.
- OWOX does not start other runs of the same Data Mart, including scheduled runs, until the backfill finishes.

See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

<!-- markdownlint-disable-file MD041 MD036 -->
