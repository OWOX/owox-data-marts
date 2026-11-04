---
'owox': minor
---

**Backfill a catalog for any period in one run, and follow a long backfill as parts of one operation**

An analyst who reloads a list of ads, campaigns or accounts for the past year used to confirm "Start 12 runs", then find one entry in **Run History** labelled "segment 1 of 12" and nothing after it — such a catalog has no date filter, so a single run loads all of it, and the promised runs never happened. Now the **Manual Run** form says the node loads the whole catalog in one run, whatever period you pick, asks for no confirmation, and **Run History** shows one plain run.

For a node fetched by date, a period over 31 days still loads in consecutive runs, now called **parts** rather than segments: the form reads "307 days, loaded in 10 parts of up to 31 days. It counts as 10 runs", the confirmation asks "Start backfill?", and each entry in **Run History** reads "part 3 of 10 loaded". The connector fields API gains an `isTimeSeries` flag per node, so an API client can tell the two cases apart before it starts a backfill.

See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

<!-- markdownlint-disable-file MD041 MD036 -->
