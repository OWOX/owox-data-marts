---
'owox': minor
---

**Know what a backfill loads when a connector has no date fields**

A user ran a backfill on a connector with no date fields and saw an empty **Run configuration**. Examples are the Google Sheets source and a custom connector with no **Time-series node** and no **Incremental** strategy. The user could not tell if the run loads all data or if the connector needs a change first. Now the form says: "This node has no date filter: a backfill loads all its data in one run, the same as an incremental load." The **Backfill** description above it no longer mentions a time range.

For a custom connector, the form also says: "If the API filters by date, set the node's Incremental strategy and date parameters in the Connector Builder." See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

![The Manual Run sheet of a Data Mart on a custom connector, with Backfill (custom period) selected, a description with no time range, and Run configuration saying the node has no date filter and how to load a period](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/48583129-1e48-4d24-079d-df744cd38200/public)

<!-- markdownlint-disable-file MD041 MD036 -->
