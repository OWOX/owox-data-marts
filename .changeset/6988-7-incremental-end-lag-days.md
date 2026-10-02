---
'owox': minor
---

**Custom connectors can leave out today for APIs that report only completed days**

A custom connector's date window always ended today, so an API that refuses such a window, as
the OpenAI Ads insights endpoint does with `time_ranges.end cannot be in the future`, failed
every run. A node can now end its window a number of days before today: set **Skip the last
days** under **Incremental** in the Connector Builder, or `incremental.endLagDays` in the
manifest, e.g. `1` to end the window yesterday.

The left-out days are imported by a later run: the import never marks a day as done before
every node has asked for it. A manual backfill never asks for a later day either, and its log
says where it stopped; **Test** in the builder samples the same window.

<!-- markdownlint-disable-file MD041 MD036 -->
