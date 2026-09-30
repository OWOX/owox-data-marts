---
'owox': minor
---

**Run History shows when a run loaded nothing**

When a connector run loaded no rows and had no date to show — for example a Google Sheets
import, or a custom connector node that is not fetched by date — Run History showed no row
count at all, so the run looked like any other successful one. It now shows **Loaded 0 rows**.
For a custom connector the log also names each node whose requests got no records in the run,
and suggests what to check — the usual cause when a new connector returns nothing: the node's
record path and the parameters and dates its request uses, and for a partitioned node its
parent record path and key, or its list of values.

<!-- markdownlint-disable-file MD041 MD036 -->
