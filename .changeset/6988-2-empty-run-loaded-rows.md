---
'owox': minor
---

**Run History shows when a run loaded nothing**

A connector run that completed without loading any rows showed no row count at all in Run
History, so it looked like any other successful run. It now shows **Loaded 0 rows**. For a
custom connector the log also names each node whose requests got no records in the run, and
suggests checking the node's record path and the parameters and dates its request uses — the
usual cause when a new connector returns nothing.

<!-- markdownlint-disable-file MD041 MD036 -->
