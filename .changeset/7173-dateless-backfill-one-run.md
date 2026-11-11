---
'owox': minor
---

**Backfill a catalog for any period in one run, and follow a long backfill as parts of one operation**

An analyst who reloads a list of ads, campaigns or accounts for the past year used to confirm "Start 12 runs", then find one entry in **Run History** labelled "segment 1 of 12" and nothing after it — such a catalog has no date filter, so a single run loads all of it, and the promised runs never happened. Now the **Manual Run** form says the node loads the whole catalog in one run, whatever period you pick, asks for no confirmation, and **Run History** shows one plain run.

![Manual Run sheet for a Reddit Ads catalog node with 1 January – 15 April selected: the notice says the backfill loads the whole catalog in one run, whatever period is picked](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/552bbbf7-375d-4424-e9a9-518081ab9e00/w=800)

For a node fetched by date, a period longer than 31 days loads in consecutive runs, now called **parts** and cut at calendar months rather than every 31 days: 1 January – 15 April loads as 1–31 January, 1–28 February, 1–31 March and 1–15 April, so each part lines up with the month you will check it against. The form reads "105 days, loaded in 4 parts, one per calendar month. It counts as 4 runs", the confirmation asks "Start backfill?", and each entry in **Run History** reads "part 3 of 4 loaded". **A backfill already running when this version is deployed finishes with the 31-day parts it was planned with. Operators of a self-hosted deployment with several replicas: finish the rollout before anyone starts a backfill longer than a month, because a replica still on the previous version continues a calendar-month backfill with 31-day parts and leaves days unloaded.** The connector fields API gains an `isFetchedByDate` flag per node, so an API client can tell a catalog node from a dated one before it starts a backfill.

![Manual Run sheet for a dated node with 1 January – 15 April selected: 105 days, loaded in 4 parts, one per calendar month, counting as 4 runs](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/0540e4b4-79b1-4dbc-20d8-598b8afb5700/w=800)

![Start backfill? confirmation naming 4 parts and 4 runs, with Keep editing and Start backfill buttons](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/bef2cc39-7a9d-4ba7-ae14-2221f800a500/w=800)

See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

<!-- markdownlint-disable-file MD041 MD036 -->
