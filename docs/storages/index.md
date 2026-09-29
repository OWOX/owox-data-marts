# Storages

A **Storage** is your project's data warehouse — a SQL-compatible system, such as Google BigQuery or Snowflake, where all your data lives and gets processed.

## What Storages do in OWOX

Every [Data Mart](../data-marts/) runs on a Storage. Connectors load raw data into it, SQL Data Marts query it, and Reports read from it. OWOX Data Marts never retains your data. It stays in your warehouse, under your ownership and control.

Each project needs at least one Storage. You can add several Storages to isolate clients or teams. Each Data Mart links to exactly one Storage.

## How Storages fit the workflow

[Sources](../connectors/) import raw data into a Storage. [Data Marts](../data-marts/) define business-ready data on top of it. [Destinations](../destinations/) and [Reports](../reports/) deliver that data to business users.

## Supported Storages

| Storage | Read |
| --- | --- |
| Google BigQuery | [Setup guide](./supported-storages/google-bigquery.md) |
| AWS Athena | [Setup guide](./supported-storages/aws-athena.md) |
| AWS Redshift | [Setup guide](./supported-storages/aws-redshift.md) |
| Snowflake | [Setup guide](./supported-storages/snowflake.md) |
| Databricks | [Setup guide](./supported-storages/databricks.md) |

## Get started

1. Open **Storages** in the left sidebar and click **+ New Storage**.
2. Pick your warehouse and follow its [setup guide](./manage-storages.md).
3. Create your first [Data Mart](../data-marts/) on that Storage.

## Learn more

| Need | Read |
| --- | --- |
| Add, remove, or manage Storage owners | [Storage Management](./manage-storages.md) |
| Core terms and how entities relate | [Core Concepts](../getting-started/core-concepts.md) |
| Choose an OWOX Data Marts edition | [Self-Managed Editions](../editions/self-managed-editions.md) |
