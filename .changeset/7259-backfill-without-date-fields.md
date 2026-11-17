---
'owox': minor
---

**Know what a backfill loads when a connector has no date fields**

A user ran a backfill on a connector with no date fields and saw an empty **Run configuration**. Examples are the Google Sheets source and a custom connector with no dated node. The user could not tell if the run loads all data or if the connector needs a change first. Now the form says: "This node has no date filter: a backfill loads all its data in one run, the same as an incremental load."

For a custom connector, the form also says: "If the API filters by date, set the node's Incremental strategy and date parameters in the Connector Builder." See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

![The Manual Run sheet of a Data Mart on a custom connector, with Backfill (custom period) selected and Run configuration saying the node has no date filter and how to load a period](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/96b16e3d-1fb9-4b82-c15f-d52001f08000/public)

<!-- markdownlint-disable-file MD041 MD036 -->
