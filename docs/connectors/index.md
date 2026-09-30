# Sources

A **Source** is a platform that holds data you want to analyze — for example, Facebook Ads, TikTok Ads, or Shopify. Connectors collect raw data from Sources into your Storage.

## What Sources do in OWOX

OWOX Data Marts ships open-source connectors for popular advertising and business platforms. A connector authenticates with the platform's API, fetches the fields you select, and loads them into your [Storage](../storages/). You own the collected data. It lands in your warehouse, not in OWOX.

Two connector kinds cover different needs:

- **Built-in connectors** — ready-made integrations for platforms such as Google Ads, Facebook Ads, and TikTok Ads. Browse them in the sidebar under Sources.
- **[Declarative connectors](./declarative-connectors.md)** — connectors you describe in a JSON manifest, without code, for any HTTP API.

## How Sources fit the workflow

A [Connector Data Mart](../getting-started/setup-guide/connector-data-mart.md) imports data from a Source into a [Storage](../storages/). Other [Data Marts](../data-marts/) then model that data, and [Reports](../reports/) deliver it to [Destinations](../destinations/).

## When to use Sources

- You want advertising or platform data in your own warehouse on a schedule.
- You need one place to blend marketing data from many platforms.
- A platform has no built-in connector, and you want to add it without code.
- You want full control over collected fields and API credentials.

## Get started

1. [Add a Storage](../storages/) to receive the data.
2. Create a [Connector Data Mart](../getting-started/setup-guide/connector-data-mart.md) and pick your platform.
3. Click **Publish & Run Data Mart** to start the first import.
4. Add a [Connector Trigger](../getting-started/setup-guide/connector-triggers.md) to import data on a schedule.

## Learn more

| Need | Read |
| --- | --- |
| Connect an API without a built-in connector | [Declarative Connectors](./declarative-connectors.md) |
| Build a declarative connector in the UI | [Connector Builder](./connector-builder.md) |
| Write or edit a connector manifest | [Manifest Reference](./manifest-reference.md) |
| Contribute a new open-source connector | [Connector Development](../../packages/connectors/CONTRIBUTING.md) |
| Core terms and how entities relate | [Core Concepts](../getting-started/core-concepts.md) |
