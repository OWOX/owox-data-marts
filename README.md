# OWOX Data Marts

## Free connectors, governed Data Marts, one number everywhere

Plug in open-source connectors, define each metric once as a Data Mart in your own warehouse, and publish it to Google Sheets, Excel, Data Studio, Slack, Claude and ChatGPT. Every answer comes from your SQL, so nobody downstream gets a hallucinated number with your name on it.

[**📘 Quick Start Guide**](./docs/getting-started/quick-start.md) · [**📚 Docs**](https://docs.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme) · [**🌐 Website**](https://www.owox.com/product?utm_source=github&utm_medium=referral&utm_campaign=readme) · [**🆘 Issues**](https://github.com/OWOX/owox-data-marts/issues)

![OWOX Data Marts: six layers from Sources through Storages, Data Marts, Destinations and Reports to Plugins. Facebook Ads and Google Ads land in Google BigQuery, become the Unified AdSpend Data Mart, join with Orders, and reach Data Studio, ChatGPT and Google Sheets, where a scheduled Campaigns Performance report refreshes itself](./docs/res/architecture/owox-data-marts-architecture.svg)

## Why analysts use it

Once a number leaves your hands, you lose it. Someone copies it into a spreadsheet, someone rebuilds it in a dashboard with a different filter, someone asks ChatGPT and gets a third answer. Then the question comes back to you: why is this number wrong?

OWOX Data Marts keeps the definition with you and sends the data out:

1. **You define it once.** A Data Mart is your SQL, table, view or connector, with a description, an owner and declared joins to other Data Marts.
2. **You decide what goes out.** Nothing reaches a business user until you publish it. Access is set per Data Mart and per [Data Context](./docs/project/contexts.md).
3. **Everyone reads the same definition.** A spreadsheet, a dashboard and an AI assistant all query the same Data Mart, so revenue means the same thing in all three.
4. **You stop being the courier.** Reports refresh on a schedule. Business users pick columns and filters themselves, inside the Data Marts you published.

## How it works

1. **Collect.** [Open-source connectors](#-available-connectors) load ads, e-commerce and other API data into your warehouse. No per-connector bill. A missing API can be added with the [Connector Builder](./docs/connectors/connector-builder.md), without writing code.
2. **Define.** Build Data Marts from [SQL](./docs/getting-started/setup-guide/sql-data-mart.md), a [table](./docs/getting-started/setup-guide/table-data-mart.md), a [view](./docs/getting-started/setup-guide/view-data-mart.md) or a [connector](./docs/getting-started/setup-guide/connector-data-mart.md). Declare [joins](./docs/getting-started/setup-guide/joinable-data-marts.md) between them once, and schedule [data quality checks](./docs/getting-started/setup-guide/data-quality-checks.md) so a broken Data Mart shows up before someone reads it.
3. **Hand off.** Publish to [destinations](./docs/destinations/index.md) where business users already work, and to Claude or ChatGPT through the [MCP server](./docs/getting-started/setup-guide/mcp.md).
4. **Refresh.** [Triggers](./docs/getting-started/setup-guide/report-triggers.md) re-run reports on your schedule. Last run, status and owner sit on each report.

## No hallucinated numbers

When a business user asks Claude or ChatGPT a question, the assistant reads your Data Marts through MCP. It does not write SQL against raw tables. The query is built from your definitions and the joins you declared, not written by an LLM.

If nobody has defined the metric, OWOX does not approximate it. It suggests asking the Data Mart owner to add it, and the owner decides whether it becomes a trusted definition.

## Your data stays yours

1. Data Marts run as queries in your warehouse: Google BigQuery, Snowflake, AWS Redshift, AWS Athena or Databricks. OWOX keeps no second copy.
2. Data you load stays in your warehouse after a source API drops history or removes a field.
3. Self-host it for free, or use [OWOX Cloud](https://www.owox.com/pricing?utm_source=github&utm_medium=referral&utm_campaign=readme). Connectors are MIT-licensed, so you can read, fork and fix every one.
4. No modeling project first. Start from SQL you already have.

## 🛠 Quick start

(1) **Install Node.js** 22.22.0+ [download](https://nodejs.org)

(2) **Install OWOX Data Marts**

```bash
npm install -g owox
```

(3) **Start it**

```bash
owox serve
```

(4) **Open** <http://localhost:3000> 🎉

For **Docker** and **cloud deployment**, see the [Quick Start Guide](./docs/getting-started/quick-start.md). Then [create your first Data Mart](./docs/getting-started/first-data-mart.md).

## 🔌 Available connectors

Free, MIT-licensed connectors, self-hosted or in OWOX Cloud, with no per-connector bill.

### Data sources

| Name                            | Status           | Links                                                                               |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| Bank of Canada                  | 🟢 Public        | [Get started](packages/connectors/src/Sources/BankOfCanada/GETTING_STARTED.md)      |
| Criteo Ads                      | 🟢 Public        | [Get started](packages/connectors/src/Sources/CriteoAds/GETTING_STARTED.md)         |
| Facebook Ads                    | 🟢 Public        | [Get started](packages/connectors/src/Sources/FacebookMarketing/GETTING_STARTED.md) |
| GitHub                          | 🟢 Public        | [Get started](packages/connectors/src/Sources/GitHub/GETTING_STARTED.md)            |
| Google Ads                      | 🟢 Public        | [Get started](packages/connectors/src/Sources/GoogleAds/GETTING_STARTED.md)         |
| LinkedIn Ads                    | 🟢 Public        | [Get started](packages/connectors/src/Sources/LinkedInAds/GETTING_STARTED.md)       |
| LinkedIn Pages                  | 🟢 Public        | [Get started](packages/connectors/src/Sources/LinkedInPages/GETTING_STARTED.md)     |
| Microsoft Ads (former Bing Ads) | 🟢 Public        | [Get started](packages/connectors/src/Sources/MicrosoftAds/GETTING_STARTED.md)      |
| Open Exchange Rates             | 🟢 Public        | [Get started](packages/connectors/src/Sources/OpenExchangeRates/GETTING_STARTED.md) |
| Open Holidays                   | 🟢 Public        | [Get started](packages/connectors/src/Sources/OpenHolidays/GETTING_STARTED.md)      |
| Reddit Ads                      | 🟢 Public        | [Get started](packages/connectors/src/Sources/RedditAds/GETTING_STARTED.md)         |
| Shopify                         | 🟢 Public        | [Get started](packages/connectors/src/Sources/Shopify/GETTING_STARTED.md)           |
| TikTok Ads                      | 🟢 Public        | [Get started](packages/connectors/src/Sources/TikTokAds/GETTING_STARTED.md)         |
| X Ads (former Twitter Ads)      | 🟢 Public        | [Get started](packages/connectors/src/Sources/XAds/GETTING_STARTED.md)              |
| Hotline                         | ⚪️ In Discussion | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/55)                |
| Google Business Profile         | ⚪️ In Discussion | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/61)                |

### Data warehouses

| Name            | Status    | Links                                                         |
| --------------- | --------- | ------------------------------------------------------------- |
| Google BigQuery | 🟢 Public | [Readme](docs/storages/supported-storages/google-bigquery.md) |
| AWS Redshift    | 🟢 Public | [Readme](docs/storages/supported-storages/aws-redshift.md)    |
| AWS Athena      | 🟢 Public | [Readme](docs/storages/supported-storages/aws-athena.md)      |
| Snowflake       | 🟢 Public | [Readme](docs/storages/supported-storages/snowflake.md)       |
| Databricks      | 🟢 Public | [Readme](docs/storages/supported-storages/databricks.md)      |

Missing an integration? Request it in [Discussions](https://github.com/OWOX/owox-data-marts/discussions), make it with the [Connector Builder](./docs/connectors/connector-builder.md), or [write your own](packages/connectors/CONTRIBUTING.md).

### Destinations

| Name                                | Business users get                            | Links                                                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Sheets                       | Reports that refresh on a schedule            | [Setup guide](docs/destinations/supported-destinations/google-sheets.md)                                                                                                                                   |
| Microsoft Excel                     | Reports they refresh from the add-in          | [Setup guide](docs/destinations/supported-destinations/microsoft-excel.md)                                                                                                                                 |
| Data Studio                         | Dashboards that read the Data Mart on open    | [Setup guide](docs/destinations/supported-destinations/data-studio.md)                                                                                                                                     |
| Claude, ChatGPT                     | Answers from your Data Marts, through MCP     | [Setup guide](docs/getting-started/setup-guide/mcp.md)                                                                                                                                                     |
| Slack, Microsoft Teams, Google Chat | Scheduled reports and insights in a channel   | [Slack](docs/destinations/supported-destinations/slack.md) · [Teams](docs/destinations/supported-destinations/microsoft-teams.md) · [Google Chat](docs/destinations/supported-destinations/google-chat.md) |
| Email                               | Scheduled reports and insights in their inbox | [Email](docs/destinations/supported-destinations/email.md)                                                                                                                                                 |

## 🧑‍💻 Contribute

1. Read the [Contributor Guide](packages/connectors/CONTRIBUTING.md).
2. Check [open Issues](https://github.com/OWOX/owox-data-marts/issues).
3. Join [Discussions](https://github.com/OWOX/owox-data-marts/discussions).

New connectors, docs fixes and bug reports are all welcome, and we spotlight contributors.

## 📌 License

OWOX Data Marts is free for internal or client use, but not for resale in a competing product. Dual-license model:

- **Connectors** (`packages/connectors`): [MIT License](licenses/MIT.md)
- **Platform** (all other files): [ELv2 License](licenses/Elasticv2.md)
- **Enterprise features**: [Enterprise License](licenses/ee.md) (files in `apps/backend/src/data-marts/data-destination-types/ee` or containing `.ee.` in the filename)

Enterprise pricing: [owox.com/pricing](https://www.owox.com/pricing?utm_source=github&utm_medium=referral&utm_campaign=readme)

---

[**Star this repo**](https://github.com/OWOX/owox-data-marts) if it saves you from rebuilding the same report every week.
