# OWOX Storage

OWOX Storage is a Google BigQuery storage that OWOX hosts for you. You need no warehouse, key or Google Cloud setup.

OWOX Storage is available in OWOX Cloud only. It is not offered in self-hosted deployments.

## 1. Go to the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

## 2. Choose Storage Type

Click **OWOX Storage**. The storage settings panel opens.

## 3. Add title and location

- **Title**: a name for the storage. The default is `OWOX Storage`.
- **Location**: `US` or `EU`.

> ☝️ The location cannot be changed after the storage is created.

Click **Save**. OWOX creates the storage and its BigQuery dataset.

## Who can create one

- Each project can have one OWOX Storage in each location: one in `US` and one in `EU`.
- If the project already has one in the selected location, the error names that location, for example "This project already has an OWOX Storage in EU."

## No Credential

An OWOX Storage needs no [Credential](../../project/credentials.md). The **Credential** field is not shown.

## SQL Data Marts

A SQL Data Mart on an OWOX Storage runs `SELECT` queries only. Any other statement is refused with the error "OWOX Storage runs SELECT queries only. This query is a `<statement type>`."

## Connector Data Marts

A connector Data Mart on an OWOX Storage writes into the storage's one dataset. The setup wizard offers no other dataset.

## Daily query limit

Each OWOX Storage can scan up to 100 GiB of data a day with its queries and connector loads. BigQuery enforces this limit. The limit is the same on every plan. Each load counts as at least 10 MiB.

BigQuery also stops all OWOX Storages for the rest of the day when together they use their shared daily capacity.

The limit resets at midnight Pacific Time. Queries that BigQuery stops fail with the error "OWOX Storage has used its query capacity for today. It resets at midnight Pacific Time. If you need it sooner, contact support." Connector runs that it stops show BigQuery's own error in Run History.

To get a higher limit, contact support.

## Storage size

Each OWOX Storage can hold up to 100 GiB. The limit is the same on every plan.

When a storage reaches its limit, new connector runs are refused. They show as RESTRICTED in Run History with the message "This project's OWOX Storage has reached its size limit. Delete tables in the storage to load more data, or contact support to get a higher limit."

Reads, reports and table deletion keep working when the storage is full.

A connector run that has already started is not stopped, so usage can end above the limit.

To get a larger storage, contact support.

## Usage and tables

Open **Storages**, then open the OWOX Storage. The **Usage and Tables** section of the edit sheet shows:

- **Usage**: "`<used>` of `<limit>` used". A full storage also shows the warning "This storage is full. New connector runs are refused until you delete tables. To get more space, contact support."
- **Tables**: a list of the tables in the storage's dataset with their **Table**, **Rows** and **Size**. Sizes are read live.

To delete a table, click its delete button and confirm. A connector that loads incrementally continues from its last loaded date, so running it again after a delete does not bring back the deleted rows.

> ⚠️ A deleted table cannot be restored. Data Marts that read the table fail until a connector loads it again.

## When an OWOX Storage is deleted

OWOX does not delete an OWOX Storage on its own. Only you can delete it, as described in [Deleting an OWOX Storage](#deleting-an-owox-storage).

If the deletion fails partway, OWOX shows the error "OWOX Storage could not be deleted. Try again later." The storage stays in the list, but its data can be partly deleted. OWOX tries again to delete the data once a day. To remove the storage from the list, delete it again.

### After deletion

The panel shows "This storage and its data were deleted on `<date>`. Restore it to use it again. The Data Marts that use it keep their settings, and their next connector runs load their data again."

Until you restore the storage, connector runs end as RESTRICTED, and queries fail with the error "This OWOX Storage and its data were deleted. Restore the storage on its page to continue."

### Restore a deleted storage

1. Open **Storages**, then open the OWOX Storage.
2. Click **Restore storage** in the notice. Only editors can restore a storage.

Restoring brings the storage back empty, under the same names. The deleted data does not come back.

The Data Marts keep their settings. OWOX resets the state of their connectors, so the next runs load data from each connector's start date.

> ☝️ You can also delete the storage instead, as described below. Delete its Data Marts first.

## No direct BigQuery access

OWOX Storage gives you no key and no access to the Google Cloud console. Use OWOX Data Marts to query the data and to deliver it with [Destinations](../../destinations/).

## Deleting an OWOX Storage

Delete it as any other Storage: see [Removing a Storage](../manage-storages.md#removing-a-storage). A Storage used by Data Marts cannot be deleted.

> ⚠️ Deleting an OWOX Storage deletes its data.
