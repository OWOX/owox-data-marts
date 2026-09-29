# Your First Data Mart

This tutorial takes you from an empty project to a scheduled report in Google Sheets. Each step links the detailed guide, so you always know where to look deeper.

You will collect advertising data into your warehouse and deliver it to a spreadsheet. The same flow works for any [Source](../connectors/) and any [Destination](../destinations/).

## Before you start

You need a running OWOX Data Marts instance. Pick one:

- [Deploy it yourself](./deployment-guide/) — locally or in your cloud.
- [Sign in to OWOX Cloud](../editions/owox-cloud-editions.md) — no deployment needed.

New to the terms? Skim [Core Concepts](./core-concepts.md) first — it takes five minutes.

## Step 1: Connect a Storage

A [Storage](../storages/) is your data warehouse. Every Data Mart runs on one, and your data never leaves it.

1. Open **Storages** in the left sidebar and click **+ New Storage**.
2. Pick your warehouse and follow its guide, for example [Google BigQuery](../storages/supported-storages/google-bigquery.md).

## Step 2: Create a Connector Data Mart

A [Connector Data Mart](./setup-guide/connector-data-mart.md) imports data from a platform API into your Storage.

1. Click **+ New Data Mart**, give it a title, and select your Storage.
2. In **Input Source**, choose **Connector** and pick a platform, such as Facebook Ads.
3. Add the platform credentials — each connector's guide shows [how to obtain them](./setup-guide/connector-data-mart.md#step-3-add-access-credentials).
4. Select the data node and fields to import, then set the target dataset name.

Already have data in your warehouse? Create a [SQL](./setup-guide/sql-data-mart.md), [Table](./setup-guide/table-data-mart.md), or [View](./setup-guide/view-data-mart.md) Data Mart instead and skip to Step 4.

## Step 3: Run it and check the data

1. Click **Save**, then **Publish & Run Data Mart** — the first import starts automatically.
2. Watch the **Run History** tab for logs and results.
3. To load data again later, click **Manual Run** in the **Input Source** card header.

After the first run, the **Output Schema** appears automatically. Add business-friendly field names there — they become the column aliases business users see.

## Step 4: Add a Google Sheets Destination

A [Destination](../destinations/) is the tool where business users access the data. This tutorial uses Google Sheets, but any [supported Destination](../destinations/) works the same way — Data Studio, Excel, Email, Slack, and more.

1. Open **Destinations** in the left sidebar and click **+ New Destination**.
2. Choose **Google Sheets** and follow the [setup guide](../destinations/supported-destinations/google-sheets.md) to authenticate.

## Step 5: Create a Report

A [Report](../reports/) delivers the Data Mart's output to your Destination.

1. Open your Data Mart's **Destinations** tab and click **+ New Report** in your Destination's block.
2. Name the report and link the target spreadsheet tab.
3. Click **Create & Run report**, then open the document — your data is in the sheet.

## Step 6: Automate it with Triggers

Triggers keep the data fresh without manual runs.

1. On the **Triggers** tab, add a [Connector Trigger](./setup-guide/connector-triggers.md) to import new data on a schedule.
2. Add a [Report Trigger](./setup-guide/report-triggers.md) to refresh the spreadsheet after each import.

## What's next

| Need | Read |
| --- | --- |
| Model relationships between Data Marts | [Joinable Data Marts](./setup-guide/joinable-data-marts.md) |
| Hide or rename fields for business users | [Output Controls](./setup-guide/output-controls.md) |
| Validate imported data automatically | [Data Quality Checks](./setup-guide/data-quality-checks.md) |
| Invite your team and assign roles | [Project Settings](../project/) |
| Get alerts about failed runs | [Notification Settings](../notifications/notification-settings.md) |
