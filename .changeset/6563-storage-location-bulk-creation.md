---
'owox': minor
---

**Import from Google BigQuery blocks tables stored in another location**

Previously, **Import data marts from storage** let you pick a table or view from a dataset stored in a different location than the Google BigQuery storage, for example a `US` dataset with an `EU` storage. The data mart was created, but it could not read its data. The picker now shows each dataset's location and greys out the tables and views outside the storage's [location](../../docs/storages/supported-storages/google-bigquery.md#select-location), so they can't be picked.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/f972a02d97d1f06d42e5db5bcb67e581/iframe>

The **Select...** picker for Table, View and Pattern Data Marts follows the same rule.

<!-- markdownlint-disable-file MD041 MD036 -->
