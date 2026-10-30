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

The limit resets at midnight Pacific Time. When a project has used it, queries fail with the error "This project has used today's OWOX Storage query limit. It resets at midnight Pacific Time."

## Storage size

Each OWOX Storage has a size limit.

| Project plan | Size |
| --- | --- |
| Free | 1 GiB |
| Paid | 10 GiB included |

When a Free storage reaches its limit, new connector runs are refused. They show as RESTRICTED in Run History with the message "This project's OWOX Storage has reached its size limit. Delete tables in the storage or upgrade the plan to load more data." Delete tables or upgrade the plan to load data again.

Reads, reports and table deletion keep working when the storage is full.

A connector run that has already started is not stopped, so usage can end above the limit.

A Paid storage is never stopped for its size.

## Usage and tables

Open **Storages**, then open the OWOX Storage. The **Usage and Tables** section of the edit sheet shows:

- **Usage**: "`<used>` of `<limit>` used" on the Free plan, or "`<used>` used, `<included>` included" on the Paid plan. A full Free storage also shows the warning "This storage is full. New connector runs are refused until you delete tables or upgrade the plan."
- **Tables**: a list of the tables in the storage's dataset with their **Table**, **Rows** and **Size**. Sizes are read live.

To delete a table, click its delete button and confirm.

> ⚠️ A deleted table cannot be restored. Data Marts that read the table fail until a connector loads it again.

## No direct BigQuery access

OWOX Storage gives you no key and no access to the Google Cloud console. Use OWOX Data Marts to query the data and to deliver it with [Destinations](../../destinations/).

## Deleting an OWOX Storage

Delete it as any other Storage: see [Removing a Storage](../manage-storages.md#removing-a-storage). A Storage used by Data Marts cannot be deleted.

> ⚠️ Deleting an OWOX Storage deletes its data.
