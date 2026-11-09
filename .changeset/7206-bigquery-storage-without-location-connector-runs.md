---
'owox': minor
---

**Connector runs on a Google BigQuery Storage without a location no longer fail**

The web form requires a location for a Google BigQuery Storage. MCP and the API can save a Storage without a location. Previously, a connector run on such a Storage failed with `Invalid location 'AUTODETECT'` or `Invalid location 'undefined'`. This happened when the run created the target table or replaced all its data. These runs loaded no data until you set a location on the Storage. Now the run loads data.

The run writes to the target dataset when this dataset exists. Otherwise, Google BigQuery creates the dataset in its default location. Set a location on the Storage before the first run to create the dataset in another location. A later change of the Storage location does not move the dataset. For the steps, see [Google BigQuery](../../docs/storages/supported-storages/google-bigquery.md#select-location). Only connector Data Marts on Google BigQuery change.

<!-- markdownlint-disable-file MD041 MD036 -->
