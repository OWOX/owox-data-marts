---
'owox': minor
---

**Backfill a catalog for any period in one run, and follow a long backfill as parts of one operation**

An analyst who reloads a list of ads, campaigns or accounts for the past year used to confirm "Start 12 runs", then find one entry in **Run History** labelled "segment 1 of 12" and nothing after it — such a catalog has no date filter, so a single run loads all of it, and the promised runs never happened. Now the **Manual Run** form says the node loads the whole catalog in one run, whatever period you pick, asks for no confirmation, and **Run History** shows one plain run.

For a node fetched by date, a period that spans several months loads in consecutive runs, now called **parts** and cut at calendar months rather than every 31 days: 1 January – 15 April loads as 1–31 January, 1–28 February, 1–31 March and 1–15 April, so each part lines up with the month you will check it against. The form reads "105 days, loaded in 4 parts, one per calendar month. It counts as 4 runs", the confirmation asks "Start backfill?", and each entry in **Run History** reads "part 3 of 4 loaded". **A backfill already running when this version is deployed finishes with the 31-day parts it was planned with.** The connector fields API gains an `isTimeSeries` flag per node, so an API client can tell a catalog node from a dated one before it starts a backfill.

See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

<!-- markdownlint-disable-file MD041 MD036 -->
