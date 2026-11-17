---
'owox': minor
---

**Know what a backfill loads when a connector has no date fields**

A user ran a backfill on a connector with no date fields and saw an empty **Run configuration**. Examples are the Google Sheets source and a custom connector with no dated node. The user could not tell if the run loads all data or if the connector needs a change first. Now the form says: "This node has no date filter: a backfill loads all its data in one run, the same as an incremental load."

For a custom connector, the form also says: "If the API filters by date, set the node's Incremental strategy and date parameters in the Connector Builder." See [Backfill a custom period](../../docs/getting-started/setup-guide/connector-data-mart.md#backfill-a-custom-period).

<!-- markdownlint-disable-file MD041 MD036 -->
