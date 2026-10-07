---
'owox': minor
---

**Storage settings point to the field you need to fix**

Previously, when a Storage could not be saved because of one of its values, the only explanation was a toast at the top of the page, such as `Invalid config — projectId: Invalid GCP project ID…`, and nothing in the form showed which field it meant. Now **Save** marks that field in red, opens its section if it was collapsed, moves the cursor to it, and shows the reason under the field. The mark clears when you correct the value.

- **Google BigQuery**: the **Project ID** format is checked before saving, so a project name entered instead of the ID is flagged at once. Spaces around a pasted ID are removed.
- **Service Account** in a Google BigQuery Storage or a Google Sheets Destination: a key that is not valid JSON or has no `client_email` is flagged on the field. Before, **Save** in a Storage did nothing in this case.
- Any storage type: when the server rejects a value in the connection settings or credentials, the form marks that field the same way. Connection errors reported by the warehouse itself, such as a wrong password, still appear as a message only.
- A save that fails for another reason, such as a lost connection, now says so instead of doing nothing. A change to the Storage's owners is kept when you fix a field and save again.

See [Google BigQuery](../../docs/storages/supported-storages/google-bigquery.md) and [Storage Management](../../docs/storages/manage-storages.md).

<!-- markdownlint-disable-file MD041 MD036 -->
