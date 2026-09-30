# Your First Data Mart

This tutorial takes you from an empty project to a scheduled report in Google Sheets. Each step links the detailed guide, so you always know where to look deeper.

You will collect advertising data into your warehouse and deliver it to a spreadsheet. The same flow works for any [Source](../connectors/).

## Before you start

You need a running OWOX Data Marts instance. Pick one:

- [Deploy it yourself](./deployment-guide/) — locally or in your cloud.
- [Sign in to OWOX Cloud](../editions/owox-cloud-editions.md) — no deployment needed.

Deploying it yourself? Step 5 and the Report Trigger in Step 6 also need a [license key](./deployment-guide/license-key-setup.md). Create it in an OWOX Data Marts Cloud project. Without a valid `LICENSE_KEY`, imports work, but every report run finishes as **Restricted**.

New to the terms? Skim [Core Concepts](./core-concepts.md) first — it takes five minutes.

## Step 1: Connect a Storage

A [Storage](../storages/) is your data warehouse. Every Data Mart runs on one, and your data never leaves it.

1. Open **Storages** in the left sidebar and click **+ New Storage**.
2. Pick your warehouse and follow its guide, for example [Google BigQuery](../storages/supported-storages/google-bigquery.md).

## Step 2: Create a Connector Data Mart

A [Connector Data Mart](./setup-guide/connector-data-mart.md) imports data from a platform API into your Storage.

1. Click **+ New Data Mart**, enter a title, select your Storage, and click **Create Data Mart**.
2. On the **Data Setup** tab, in **Input Source**, set **Definition Type** to **Connector**. Pick a platform, such as Facebook Ads.
3. Add the platform credentials — each connector's guide shows [how to obtain them](./setup-guide/connector-data-mart.md#step-3-add-access-credentials).
4. Select the data node and fields to import. Confirm where to store the data, and click **Save**. BigQuery asks for a dataset name; other warehouses ask for a database, schema, or catalog.

Already have data in your warehouse? Create a [SQL](./setup-guide/sql-data-mart.md), [Table](./setup-guide/table-data-mart.md), or [View](./setup-guide/view-data-mart.md) Data Mart instead and skip to Step 4.

## Step 3: Run it and check the data

1. Click **Publish & Run Data Mart** in the page header — the first import starts automatically.
2. Watch the **Run History** tab for logs and results.
3. To load data again later, click **Manual Run** in the **Input Source** card header.

After the first run, the **Output Schema** appears automatically. Add business-friendly field names there — they become the column aliases business users see.

## Step 4: Add a Google Sheets Destination

A [Destination](../destinations/) is the tool where business users access the data. This tutorial uses Google Sheets. Other Destinations are added the same way, but their reports differ — see each [Destination guide](../destinations/).

1. Open **Destinations** in the left sidebar and click **+ New Destination**.
2. Choose **Google Sheets** and follow the [setup guide](../destinations/supported-destinations/google-sheets.md) to authenticate.

## Step 5: Create a Report

A [Report](../reports/) delivers the Data Mart's output to your Destination.

1. Open your Data Mart's **Destinations** tab and click **+ New Report** in your Destination's block.
2. Name the report and paste the link to the target spreadsheet tab. The URL must include its `gid`.
3. Share the spreadsheet with the email shown under **Share document with**, and give it **Editor** access. With OAuth, skip this if that Google account can already edit the sheet.
4. Click **Create & Run report**, then open the document — your data is in the sheet.

## Step 6: Automate it with Triggers

Triggers keep the data fresh without manual runs.

1. On the **Triggers** tab, add a [Connector Trigger](./setup-guide/connector-triggers.md) to import new data on a schedule.
2. Add a [Report Trigger](./setup-guide/report-triggers.md) to refresh the spreadsheet on its own schedule. It does not wait for the import, so schedule it after the import usually finishes.

## What's next

| Need | Read |
| --- | --- |
| Model relationships between Data Marts | [Joinable Data Marts](./setup-guide/joinable-data-marts.md) |
| Filter, sort, and cap the rows a report delivers | [Report Output Controls](./setup-guide/output-controls.md) |
| Validate imported data automatically | [Data Quality Checks](./setup-guide/data-quality-checks.md) |
| Invite your team and assign roles | [Project Settings](../project/) |
| Get alerts about failed runs | [Notification Settings](../notifications/notification-settings.md) |
