---
'owox': minor
---

**Custom connectors continue long substream and list nodes where an interrupted run stopped**

A custom connector node can call one endpoint for each parent record, for example once for each page of a site in Bing Webmaster Tools, and such a run can take an hour. When the app stopped in the middle of the run, for example on a restart, it resumed the run later, but the node read every page again from the first one. Now the node writes its rows in batches and saves how far it got. A resumed run skips the nodes it finished and continues after the last batch of pages it wrote. The run log names the node it skipped or the slice it resumed at.

This works for substream and list nodes without a date window and for nodes with a `range` window. If the list of pages, the node or its date window changed after the stop, the node reads all pages again. A day-by-day node already continues from the last finished day. A full-refresh node still reads everything again, because it replaces the whole table. See [Partition router: substream and list](../../docs/connectors/manifest-reference.md#partition-router-substream-and-list).

<!-- markdownlint-disable-file MD041 MD036 -->
