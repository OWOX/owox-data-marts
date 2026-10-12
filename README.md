<!-- markdownlint-disable MD033 -- <img> and <picture> give the icons and the light/dark diagram -->

# OWOX Data Marts

## Free connectors and ontology-backed self-service analytics without hallucinations

Plug your sources into ready-to-prompt ontology models and get hallucination-free self-service analytics. Give people and AI agents [joinable Data Marts](./docs/getting-started/setup-guide/joinable-data-marts.md) in the tools they already know: [API](https://docs.owox.com/docs/api/), [CLI](https://docs.owox.com/docs/api/owox-ctl/), [MCP](https://docs.owox.com/docs/getting-started/setup-guide/mcp/), [Google Sheets](https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/), [Excel](https://docs.owox.com/docs/destinations/supported-destinations/microsoft-excel/), [Claude](https://docs.owox.com/docs/getting-started/setup-guide/mcp/#claude-desktop-recommended), [ChatGPT](https://docs.owox.com/docs/getting-started/setup-guide/mcp/#chatgpt), [Data Studio](https://docs.owox.com/docs/destinations/supported-destinations/data-studio/) and [more destinations](https://docs.owox.com/docs/destinations/). No extra chat tool, no semantic-layer tax, no black boxes. No LLM writes the SQL behind a business user's answer, so nobody downstream gets a hallucinated number with your name on it.

[**📘 Quick Start Guide**](./docs/getting-started/quick-start.md) · [**📚 Docs**](https://docs.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme) · [**🌐 Website**](https://www.owox.com/product?utm_source=github&utm_medium=referral&utm_campaign=readme) · [**🆘 Issues**](https://github.com/OWOX/owox-data-marts/issues)

## Why OWOX Data Marts

1. **Zero hallucinations.** No LLM writes the SQL behind a business user's answer. Every answer resolves to your ontology model: Data Marts are the entities, [declared joins](./docs/getting-started/setup-guide/joinable-data-marts.md) are the relationships. A metric nobody defined goes back to its owner instead of being guessed. [Patented](https://patents.google.com/patent/US11074250B2/en).
2. **Same number everywhere.** Sheets, Excel, Data Studio, Claude and ChatGPT query one model, so revenue means one thing.
3. **You control the handoff.** Nothing reaches business users until you publish it. Access is set per Data Mart and [Data Context](./docs/project/contexts.md).
4. **No semantic-layer tax.** No YAML that goes stale by next Tuesday. Just your SQL, plus metadata that AI autofills for you to review.
5. **Free connectors.** MIT-licensed, with no per-connector bill. A missing API takes the [Connector Builder](./docs/connectors/connector-builder.md), not code.
6. **Your warehouse.** Data Marts run as queries in Google BigQuery, Snowflake, AWS Redshift, AWS Athena or Databricks. No second copy. Self-host for free.
7. **Agent-friendly.** The [`owox-ctl` CLI](./apps/ctl/README.md) and the [MCP server](./docs/getting-started/setup-guide/mcp.md) work out of the box, so your AI can set it up for you:

   > Dear coding agent, set up [owox-data-marts](https://github.com/OWOX/owox-data-marts) and connect the sources I need.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/res/architecture/architecture-dark.svg">
  <img alt="OWOX Data Marts: six layers from Sources through Storages, Data Marts, Destinations and Reports to Plugins. Facebook Ads and Google Ads land in Google BigQuery, become the Unified AdSpend Data Mart, join with Orders, and reach Data Studio, ChatGPT and Google Sheets, where a scheduled Campaigns Performance report refreshes itself" src="./docs/res/architecture/architecture-light.svg">
</picture>

## How it works

1. **Connect** [sources](#-data-sources) to your warehouse.
2. **Define** [Data Marts](./docs/data-marts/index.md#data-mart-types) from SQL, a table, a view or a connector, and declare joins.
3. **Publish** to [destinations](./docs/destinations/index.md), or to Claude and ChatGPT through [MCP](./docs/getting-started/setup-guide/mcp.md).
4. **Schedule** [report refreshes](./docs/getting-started/setup-guide/report-triggers.md) and [data quality checks](./docs/getting-started/setup-guide/data-quality-checks.md).

### [<img src="./docs/res/icons/data-sources.svg" width="24" height="24" align="texttop" alt="">](https://docs.owox.com/docs/connectors/) Data sources

[Shopify](https://docs.owox.com/packages/connectors/src/sources/shopify/getting-started/), [Facebook Ads](https://docs.owox.com/packages/connectors/src/sources/facebook-marketing/getting-started/), [Google Ads](https://docs.owox.com/packages/connectors/src/sources/google-ads/getting-started/), [TikTok Ads](https://docs.owox.com/packages/connectors/src/sources/tik-tok-ads/getting-started/), [LinkedIn Ads](https://docs.owox.com/packages/connectors/src/sources/linked-in-ads/getting-started/), [X Ads](https://docs.owox.com/packages/connectors/src/sources/xads/getting-started/), [Microsoft Ads](https://docs.owox.com/packages/connectors/src/sources/microsoft-ads/getting-started/), [see all](https://docs.owox.com/docs/connectors/)

### [<img src="./docs/res/icons/data-storages.svg" width="24" height="24" align="texttop" alt="">](https://docs.owox.com/docs/storages/) Data storages

[Google BigQuery](https://docs.owox.com/docs/storages/supported-storages/google-bigquery/), [Snowflake](https://docs.owox.com/docs/storages/supported-storages/snowflake/), [AWS Redshift](https://docs.owox.com/docs/storages/supported-storages/aws-redshift/), [AWS Athena](https://docs.owox.com/docs/storages/supported-storages/aws-athena/), [Databricks](https://docs.owox.com/docs/storages/supported-storages/databricks/)

### [<img src="./docs/res/icons/data-destinations.svg" width="24" height="24" align="texttop" alt="">](https://docs.owox.com/docs/destinations/) Data destinations

[Google Sheets](https://docs.owox.com/docs/destinations/supported-destinations/google-sheets/), [Microsoft Excel](https://docs.owox.com/docs/destinations/supported-destinations/microsoft-excel/), [Data Studio](https://docs.owox.com/docs/destinations/supported-destinations/data-studio/), [Claude](https://docs.owox.com/docs/getting-started/setup-guide/mcp/#claude-desktop-recommended), [ChatGPT](https://docs.owox.com/docs/getting-started/setup-guide/mcp/#chatgpt), [Slack](https://docs.owox.com/docs/destinations/supported-destinations/slack/), [Microsoft Teams](https://docs.owox.com/docs/destinations/supported-destinations/microsoft-teams/), [Email](https://docs.owox.com/docs/destinations/supported-destinations/email/), [Google Chat](https://docs.owox.com/docs/destinations/supported-destinations/google-chat/), [see all](https://docs.owox.com/docs/destinations/)

Missing an integration? Request it in [Discussions](https://github.com/OWOX/owox-data-marts/discussions), make it with the [Connector Builder](./docs/connectors/connector-builder.md), or [write your own](packages/connectors/CONTRIBUTING.md).

## 🧑‍💻 Contribute

1. Read the [Contributor Guide](packages/connectors/CONTRIBUTING.md).
2. Check [open Issues](https://github.com/OWOX/owox-data-marts/issues).
3. Join [Discussions](https://github.com/OWOX/owox-data-marts/discussions).

New connectors, docs fixes and bug reports are all welcome, and we spotlight contributors.

## 🛠 Quick Start

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

## 📌 License

OWOX Data Marts is free for internal or client use, but not for resale in a competing product. Dual-license model:

- **Connectors** (`packages/connectors`): [MIT License](licenses/MIT.md)
- **Platform** (all other files): [ELv2 License](licenses/Elasticv2.md)
- **Enterprise features**: [Enterprise License](licenses/ee.md) (files in `apps/backend/src/data-marts/data-destination-types/ee` or containing `.ee.` in the filename)

Enterprise pricing: [owox.com/pricing](https://www.owox.com/pricing?utm_source=github&utm_medium=referral&utm_campaign=readme)

---

[**Star this repo**](https://github.com/OWOX/owox-data-marts) if it saves you from rebuilding the same report every week.
