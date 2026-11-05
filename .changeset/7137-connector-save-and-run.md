---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**A new connector Data Mart starts loading data right after setup**

Before this release, Save in the connector sheet only saved the settings. A new Data Mart stayed a draft, and no data loaded until you found Publish & Run Data Mart. Now a draft Data Mart gets a "Save & Run" button as the last button of the Set Up Connector, Edit Connector and Connector Fields sheets. See [Set up a connector Data Mart](../../docs/getting-started/setup-guide/connector-data-mart.md#step-5-set-up-the-target-in-your-storage).

- For a draft Data Mart, "Save & Run" saves the settings, publishes the Data Mart and starts the first run. "Save" is in the menu next to it.
- For a published Data Mart, "Save" is the last button. "Save & Run" is in its menu. Save & Run saves the settings and starts a run.
- The sheet shows only "Save" if the Storage is not set up, a run is in progress, or Target Setup shows that another Data Mart writes to the same table.
