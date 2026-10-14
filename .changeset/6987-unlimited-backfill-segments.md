---
'owox': minor
---

**Backfill any past period**

A manual backfill is no longer limited to 31 days. Pick any past start and end date, and OWOX runs the period as a chain of runs, one segment of up to 31 days each. Previously a longer period was rejected, and you had to start a separate backfill for every month.

- Each segment appears as its own run in **Run History**, named with its period and position, such as "segment 3 of 18".
- The **Manual Run** form shows how many days the period covers and how many runs it counts as. A period over a year also notes that it can take hours.
- Each completed segment counts as one run. A segment that fails, is cancelled, or is interrupted does not count.
- A failed segment does not stop the backfill: the next segments still run, and the failed run names the last day it loaded. After three failed segments in a row, the backfill stops.
- Cancelling the active run stops the whole backfill. Finished segments stay loaded and keep their history.
- If a restart or deploy delays a segment, OWOX queues it again automatically within 15 minutes.
- OWOX does not start other runs of the same Data Mart, including scheduled runs, until the backfill finishes.

See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

<!-- markdownlint-disable-file MD041 MD036 -->
