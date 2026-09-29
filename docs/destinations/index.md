# Destinations

A **Destination** is the tool where business users access data — for example, Google Sheets, Looker Studio, or Microsoft Excel.

## What Destinations do in OWOX

A Destination connects OWOX Data Marts to the tools your team already uses. Analysts control which services consume the data. Business users get trusted numbers without exporting CSV files or writing SQL.

Destinations work in two modes:

- **Push mode** — OWOX exports [Data Mart](../data-marts/) data into the tool on a manual or scheduled run. Google Sheets works this way.
- **Pull mode** — the tool queries the [Storage](../storages/) when a user requests data. Looker Studio, Excel, and OData work this way.

## How Destinations fit the workflow

[Sources](../connectors/) fill a [Storage](../storages/), and [Data Marts](../data-marts/) define business-ready data on top of it. A [Report](../reports/) then delivers one Data Mart to one Destination. Each Data Mart can feed many Destinations.

## Supported Destinations

| Destination | Read |
| --- | --- |
| Google Sheets | [Setup guide](./supported-destinations/google-sheets.md) |
| Microsoft Excel | [Setup guide](./supported-destinations/microsoft-excel.md) |
| Looker Studio (Data Studio) | [Setup guide](./supported-destinations/data-studio.md) |
| Email | [Setup guide](./supported-destinations/email.md) |
| Slack | [Setup guide](./supported-destinations/slack.md) |
| Microsoft Teams | [Setup guide](./supported-destinations/microsoft-teams.md) |
| Google Chat | [Setup guide](./supported-destinations/google-chat.md) |

## Get started

1. Open **Destinations** in the left sidebar and click **+ New Destination**.
2. Pick the tool your team uses and follow its setup guide above.
3. Create a [Report](../reports/) that links a Data Mart to this Destination.

## Learn more

| Need | Read |
| --- | --- |
| Add, remove, or manage Destination owners | [Destination Management](./manage-destinations.md) |
| Schedule automatic deliveries | [Report Triggers](../getting-started/setup-guide/report-triggers.md) |
| Core terms and how entities relate | [Core Concepts](../getting-started/core-concepts.md) |
