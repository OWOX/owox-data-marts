---
'owox': minor
---

**Storage and Destination settings point to the field you need to fix**

Previously, when a Storage or a Destination could not be saved because of one of its values, the only explanation was a toast at the top of the page, such as `Invalid config — projectId: Invalid GCP project ID…`, and nothing in the form showed which field it meant. A Destination's panel even closed, discarding what you had entered. Now the panel stays open and **Save** marks that field in red, opens its section if it was collapsed, moves the cursor to it, and shows the reason under the field. The mark clears when you correct the value.

The video shows a Storage and a Destination that each point to the field to fix:

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/4507b26dd647070abb3d22b6457d6d4e/iframe>

- **Google BigQuery**: the **Project ID** format is checked before saving, so a project name entered instead of the ID is flagged at once. Spaces around a pasted ID are removed.
- **Service Account** in a Google BigQuery Storage or a Google Sheets Destination: a key that is not valid JSON or has no `client_email` is flagged on the field. Before, **Save** in a Storage did nothing in this case.
- Any storage type: when the server rejects a value in the connection settings or credentials, the form marks that field the same way. Connection errors reported by the warehouse itself, such as a wrong password, still appear as a message only.
- **Google Sheets** Destination: a Drive folder the service account can't use is marked on the folder field, with the reason and the fix. Email, Slack, Microsoft Teams and Google Chat Destinations mark a recipient or webhook URL the server refuses.
- A save that fails for another reason, such as a lost connection, now says so instead of doing nothing. A change to the owners is kept when you fix a field and save again. A save refused after your session had to be renewed no longer signs you out.

Also, a calculated field's formula editor no longer loses characters typed quickly while the page is busy, which also closed the field suggestions mid-word.

See [Google BigQuery](../../docs/storages/supported-storages/google-bigquery.md), [Storage Management](../../docs/storages/manage-storages.md) and [Destination Management](../../docs/destinations/manage-destinations.md).

<!-- markdownlint-disable-file MD041 MD036 -->
