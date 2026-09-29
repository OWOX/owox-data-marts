# Reports

A **Report** delivers a Data Mart's output to a Destination, such as a Google Sheets tab or a Looker Studio data source. Reports are how business users consume the data that analysts prepare.

## What Reports do in OWOX

A Report connects one [Data Mart](../data-marts/) to one [Destination](../destinations/). Business users get fresh, trusted data in the tool they already use. Analysts keep control over the query logic behind it.

Reports move data in two modes:

- **Push mode** — OWOX exports data into the Destination on a manual or scheduled run. Google Sheets works this way.
- **Pull mode** — the Destination queries the Storage when a user or tool requests data. Looker Studio, Excel, and OData work this way.

## How Reports fit the workflow

[Sources](../connectors/) fill a [Storage](../storages/), Data Marts define business-ready data on top of it, and Reports publish that data to Destinations. A Report is the last step of the OWOX Data Marts workflow.

Each Report belongs to one Data Mart and one Destination. One Data Mart can have many Reports with different schedules.

## When to use Reports

- Business users need current numbers in Google Sheets without asking an analyst.
- A dashboard should refresh on a schedule instead of manual exports.
- Different teams need the same Data Mart in different tools or tabs.
- You want to send run results to Email, Slack, Microsoft Teams, or Google Chat.

## Get started

1. Publish a [Data Mart](../data-marts/).
2. [Add a Destination](../destinations/) for the tool your team uses.
3. On the Data Mart page, create a Report and pick that Destination.
4. Add a [Report Trigger](../getting-started/setup-guide/report-triggers.md) to refresh it on a schedule.

## Learn more

| Need | Read |
| --- | --- |
| Schedule automatic report refreshes | [Report Triggers](../getting-started/setup-guide/report-triggers.md) |
| Aggregate data before delivery | [Report Aggregations](../getting-started/setup-guide/report-aggregations.md) |
| Set up a Google Sheets report | [Google Sheets Destination](../destinations/supported-destinations/google-sheets.md) |
| Get alerts about failed or successful runs | [Notification Settings](../notifications/notification-settings.md) |
| Core terms and how entities relate | [Core Concepts](../getting-started/core-concepts.md) |
