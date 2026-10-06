---
'owox': minor
---

**Import from Google BigQuery blocks tables stored in another location**

Previously, **Import data marts from storage** let you pick a table or view from a dataset stored in a different location than the Google BigQuery storage, for example a `US` dataset with an `EU` storage. The data mart was created, but it could not read its data. The picker now shows each dataset's location and greys out the tables and views outside the storage's [location](../../docs/storages/supported-storages/google-bigquery.md#select-location), so they can't be picked.

The **Select...** picker in the Table, View and Table Pattern definition fields follows the same rule.

<!-- markdownlint-disable-file MD041 MD036 -->
