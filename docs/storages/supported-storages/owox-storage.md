# OWOX Storage

OWOX Storage is a Google BigQuery storage that OWOX hosts for you. You need no warehouse, key or Google Cloud setup.

OWOX Storage is available in OWOX Cloud only. It is not offered in self-hosted deployments.

## 1. Go to the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

## 2. Choose Storage Type

Click **OWOX Storage**. The **New OWOX Storage** dialog opens.

## 3. Add title and location

- **Title**: a name for the storage. The default is `OWOX Storage`.
- **Location**: `US` or `EU`.

> ☝️ The location cannot be changed after the storage is created.

Click **Create**. OWOX creates the storage and its BigQuery dataset.

## Who can create one

- Each project can have one OWOX Storage.
- A project with an unpaid subscription cannot create one. It shows the error "A project with an unpaid subscription cannot create an OWOX Storage."
- If the project already has one, the error is "This project already has an OWOX Storage."

## No Credential

An OWOX Storage needs no [Credential](../../project/credentials.md). The **Credential** field is not shown.

## SQL Data Marts

A SQL Data Mart on an OWOX Storage runs `SELECT` queries only. Any other statement is refused with the error "OWOX Storage runs SELECT queries only. This query is a `<statement type>`."

## Connector Data Marts

A connector Data Mart on an OWOX Storage writes into the storage's one dataset. The setup wizard offers no other dataset.

## Daily query limit

Each project has a limit on the data its OWOX Storage queries scan per day.

| Project plan | Daily limit |
| --- | --- |
| Free | 10 GiB |
| Paid | 100 GiB |

A project with an unpaid subscription gets the Free limit.

Connector loads count toward the limit, with at least 10 MiB for each load, but the limit does not stop them. A query that is already running can take usage past the limit, and new queries are then refused until midnight Pacific Time.

The limit resets at midnight Pacific Time. When a project has used it, queries fail with the error "This project has used today's OWOX Storage query limit. It resets at midnight Pacific Time." A query that would scan more than what is left today is refused before it runs.

## Storage size

On the Free plan, each OWOX Storage has a size limit.

| Project plan | Size |
| --- | --- |
| Free | 1 GiB |
| Paid | 10 GiB included |

When a Free storage reaches its limit, new connector runs are refused. They show as RESTRICTED in Run History with the message "This project's OWOX Storage has reached its size limit. Delete tables in the storage or upgrade the plan to load more data."

Reads, reports and table deletion keep working when the storage is full.

A connector run that has already started is not stopped, so usage can end above the limit.

A Paid storage is never stopped for its size. A project with an unpaid subscription gets the Free size limit.

## Usage and tables

Open **Storages**, then open the OWOX Storage. The **Usage and Tables** section of the edit sheet shows:

- **Usage**: "`<used>` of `<limit>` used" on the Free plan, or "`<used>` used, `<included>` included" on the Paid plan. A full Free storage also shows the warning "This storage is full. New connector runs are refused until you delete tables or upgrade the plan."
- **Tables**: a list of the tables in the storage's dataset with their **Table**, **Rows** and **Size**. Sizes are read live.

To delete a table, click its delete button and confirm. A connector that loads incrementally continues from its last loaded date, so running it again after a delete does not bring back the deleted rows.

> ⚠️ A deleted table cannot be restored. Data Marts that read the table fail until a connector loads it again.

## When an OWOX Storage is deleted

OWOX deletes an OWOX Storage and its data in two cases:

- **Unpaid subscription.** Connector runs into the storage stop at once and show as RESTRICTED in Run History. The storage and its data are deleted 30 days after the subscription became unpaid. Pay for the subscription before then to keep them.
- **No use on the Free plan.** A Free storage that is not used for 30 days is deleted. Any query, report run (Google Sheets, Looker Studio and others) or connector run counts as use, scheduled ones included. A connector run that stops because the storage is full counts too. After an unpaid period, the 30 days count from the day the subscription is paid again. After a Paid period, they count from the day the project moves to Free.

A Paid storage is never deleted for inactivity.

The storage panel shows the deletion date:

- For an unpaid subscription: "This project's subscription is not paid. Connector runs into this storage are stopped, and the storage and its data will be deleted on `<date>`. Pay for the subscription before then to keep them."
- For a Free storage, once it has been idle for 7 days: "This storage has not been used recently. It and its data will be deleted on `<date>` unless a query or a connector run uses it before then."

OWOX sends no emails about deletion. Check the panel.

### After deletion

The panel shows "This storage and its data were deleted on `<date>`. Restore it to use it again. The Data Marts that use it keep their settings, and their next connector runs load their data again."

Until you restore the storage, connector runs end as RESTRICTED, and queries fail with the error "This OWOX Storage and its data were deleted. Restore the storage on its page to continue."

### Restore a deleted storage

1. Pay for the subscription if it is unpaid. A storage cannot be restored while the subscription is unpaid: "Pay for this project's subscription before restoring its OWOX Storage."
2. Open **Storages**, then open the OWOX Storage.
3. Click **Restore storage** in the notice. Only editors can restore a storage.

Restoring brings the storage back empty, under the same names. The deleted data does not come back.

The Data Marts keep their settings. OWOX resets the state of their connectors, so the next runs load data from each connector's start date.

> ☝️ You can also delete the storage instead, as described below. Delete its Data Marts first.

## No direct BigQuery access

OWOX Storage gives you no key and no access to the Google Cloud console. Use OWOX Data Marts to query the data and to deliver it with [Destinations](../../destinations/).

## Deleting an OWOX Storage

Delete it as any other Storage: see [Removing a Storage](../manage-storages.md#removing-a-storage). A Storage used by Data Marts cannot be deleted.

> ⚠️ Deleting an OWOX Storage deletes its data.
