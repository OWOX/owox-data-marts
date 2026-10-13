---
'owox': minor
---

**Backfill any past period in one run**

A manual backfill is no longer limited to 31 days. Pick any past start and end date, and OWOX runs the period as consecutive segments of up to 31 days inside one run in **Run History**. Previously a longer period was rejected, and you had to start a separate backfill for every month.

- The **Manual Run** form shows how many days the period covers, how many segments it takes and how many runs it counts as. A period over a year also notes that it can take hours.
- Each completed segment counts as one run. A segment that fails, is cancelled or is interrupted does not count.
- The run shows the period, the day it loaded through, and the segment it is loading. If a segment fails, it shows the failed segment and the last day that loaded.
- Cancelling stops the segment that is loading. Segments that already finished stay loaded.
- Connectors that load catalog data without dates load it again with each segment.
- OWOX does not start other runs of the same Data Mart, including scheduled runs, until the backfill finishes.

See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

<!-- markdownlint-disable-file MD041 MD036 -->
