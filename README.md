# OWOX Data Marts

## Your AI Reporting Data Analyst — Open Source

Stop shipping reports. Hire a reporting data analyst for each of the team members.
OWOX Data Marts automates what reporting data analysts do — governed by data teams, consumed by business users with NO AI Hallycinations.

[![npm installs](https://img.shields.io/npm/dm/owox?label=npm%20installs)](https://www.npmjs.com/package/owox) [![Connectors: MIT](https://img.shields.io/badge/connectors-MIT-green)](https://github.com/OWOX/owox-data-marts/blob/main/licenses/MIT.md) [![Platform: ELv2](https://img.shields.io/badge/platform-ELv2-blue)](https://github.com/OWOX/owox-data-marts/blob/main/licenses/Elasticv2.md) [![Slack](https://img.shields.io/badge/Slack-community-4A154B?logo=slack)](https://join.slack.com/t/owox-data-marts/shared_invite/zt-3tnigd08g-f2uU_7oNNwzCyTB2tITnqA)

## ✨ Why We Built This

Data analysts’ work means nothing unless business users can play with the data freely.

However, most **self-service analytics** initiatives fail because they compromise either the data analysts’ control or the business users’ freedom.

At OWOX, we value both:

- Data analysts **orchestrate data marts** defined either by [SQL](./docs/getting-started/setup-guide/sql-data-mart.md) or by [connectors](./docs/getting-started/setup-guide/connector-data-mart.md) to sources like Facebook Ads, TikTok Ads, and LinkedIn Ads.
- Business users **enjoy trusted reports** right [where they want them](./docs/destinations/manage-destinations.md) — in spreadsheets or dashboards.

At OWOX, we believe data analysts shouldn’t have to waste time on CSV files and one-off dashboards. Business users shouldn’t have to be forced to use complex BI tools either.

<https://github.com/user-attachments/assets/d2d9d913-a6fc-4949-a8e8-d697abd1631a>

[**📘 Quick Start Guide**](./docs/getting-started/quick-start.md) · [**📚 Docs**](https://docs.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme) · [**🌐 Website**](https://www.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme) · [**💬 Slack**](https://join.slack.com/t/owox-data-marts/shared_invite/zt-3tnigd08g-f2uU_7oNNwzCyTB2tITnqA) · [**🆘 Issues**](https://github.com/OWOX/owox-data-marts/issues)

## The Reporting Skills OWOX Automates

We analyzed **1,438 job postings** for reporting data analysts at US ecommerce SMBs. Here's what companies pay $70–120k/yr for — and what OWOX handles out of the box:

| Skill | % of Job Listings | How OWOX Handles It |
|-------|:-----------------:|---------------------|
| Writing & maintaining SQL queries | ~95% | Create data marts from SQL, tables, views, or patterns — version-controlled and reusable |
| Integrating data from multiple sources | ~85% | Open-source connectors (Facebook Ads, Google Ads, TikTok, Shopify, etc.) with zero data engineering |
| Building & maintaining dashboards and reports | ~80% | Publish data marts to Google Sheets, Looker Studio, Slack, email — one source, many outputs |
| Scheduling refreshes and timely delivery | ~70% | Built-in scheduler for data marts and exports — set once, runs forever |
| Enabling stakeholder self-service | ~65% | Business users browse the data mart library in Google Sheets, pick columns, apply filters — no tickets |
| Managing data access and permissions | ~40% | Ownership, context-based access, technical and business owners on every data mart |

**What stays with your analysts** (and becomes more valuable): data integrity validation, business logic mapping, variance diagnosis, metric definitions and standardization, stakeholder requests translation, and orchestrating AI-assisted workflows.

## Why Teams Choose OWOX Over Alternatives

### 1. No AI Hallucinations. Ever

> *"Even one hallucination is too many in this line of work."*
> — u/Cynot88, r/dataengineering

Most "AI analytics" tools generate numbers from LLM guesses. OWOX AI Insights run **pre-approved SQL your analyst approves**. AI helps with narrative prose, not the numbers. Every value is the result of a deterministic SQL query — not a prediction. Backed by [patented technology](https://www.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme).

**Why it matters:**
- Specialized legal AI tools hallucinate 17%+ of the time; general-purpose chatbots hit 58–82% ([Stanford HAI, 2025](https://mitsloanedtech.mit.edu/ai/basics/addressing-ai-hallucinations-and-bias/))
- 46% of developers actively distrust AI tool accuracy (Stack Overflow Developer Survey, 2025)
- EU AI Act (effective August 2025) mandates traceable logic on every AI insight used in significant decisions — fines up to €35M

### 2. No Semantic Layer Required

> *"The semantic layer is fragmented between tools, suffers from vendor lock-in and requires duplicate encoding of business logic that is costly to maintain... making adoption economically unviable for many firms."*
> — Semantic Layer Substack

Skip the 6–12 month semantic layer implementation. Plug in your existing SQL and self-service analytics is here. Business users get reports in minutes, not quarters.

**Why it matters:**
- Production-ready semantic layer environments typically take 6–12 months for enterprise teams ([Datacoves, 2026](https://datacoves.com/post/dbt-core-key-differences))
- Only 27% of teams plan to increase semantic layer investment ([dbt Labs State of Analytics Engineering, 2025](https://www.getdbt.com/resources/state-of-analytics-engineering-2025))
- Of the 30% using AI to consume data via natural language, two-thirds do so with vanilla SQL generation — not via a semantic layer

### 3. Data Stays in Your Data Warehouse

> *"I didn't get an error message — instead I got a column that is entirely blank. No zeroes, just blank all the way down."*
> — Supermetrics customer, Community Forum, July 2025 (after Meta cut historical data access)

Your data never leaves your infrastructure. Once normalized into your warehouse, it stays — immune to upstream API deprecations. Open-source core means no vendor lock-in.

**Why it matters:**
- Meta cut historical data on unique-count fields to 13 months and removed 7/28-day attribution windows entirely ([Supermetrics docs, Jan 2026](https://docs.supermetrics.com/docs/facebook-ads-new-historical-limitations-attribution-window-and-metric-removals-january-12-2026))
- 53.7% of CDOs serve less than 3 years; boards hold data leaders personally accountable for compliance and vendor risk ([MIT Sloan, 2025](https://sloanreview.mit.edu/article/the-chief-data-officer-role-whats-next/))

## Who Is OWOX For?

| | Data Analysts | Business Users | C-Suite |
|---|---|---|---|
| **Problem** | Buried in a reporting backlog — tickets, CSVs, one-off dashboards | Wait days for "just one more column" or trust ChatGPT with company numbers | Need AI-era throughput but can't afford hallucinated numbers at board level |
| **OWOX gives you** | Define once, publish everywhere. Full SQL audit trail. Stay in control. | Self-serve from a governed data mart library in Google Sheets — no SQL, no tickets | Visible value in weeks. Auditable accuracy. No vendor lock-in. Open-source core. |

## 🚀 What You Can Do

- **Create a Data Mart Library** — Bring together data from your warehouse (BigQuery, Snowflake, Redshift, Athena, Databricks), APIs, or spreadsheets into fast, reusable artifacts
- **Deliver Trusted Data Anywhere** — One published data mart feeds Google Sheets, Looker Studio, Slack, email, and more — simultaneously, same numbers everywhere
- **Automate Everything** — Advanced scheduler refreshes both data marts and exports, fully automated from a single place
- **Get AI Insights Without Hallucinations** — AI drafts narrative reports from your analyst-approved SQL. Every number is traceable. Delivered to Slack, Teams, or email.

## 🛠 Quick Start

**OWOX Data Marts** can be run just about anywhere in minutes.  
Here’s how to get started locally on your machine:

1. **Install Node.js** 22.16.0+ (https://nodejs.org)

2. **Install OWOX Data Marts**

   ```bash
   npm install -g owox
   ```
   
3. **Start** locally

   ```bash
   owox serve
   ```

4. **Open** <http://localhost:3000> 🎉

Live in under 5 minutes.
For **Docker** and **cloud deployment options**, see the [Quick Start Guide](./docs/getting-started/quick-start.md).

## 🗣️ What People Are Saying

> *"Connected BigQuery, set up 37 data marts, joined them and enabled live reports in Sheets in under 30 minutes. My team thought I was joking when I showed them how they can now get live reports right in their sheets."*

> *"We migrated 200+ reports from Looker to OWOX Data Marts. Our team now self-serves without filing a single Jira ticket. Easily the best infrastructure decision we made this year."*

> *"75% of CDAOs who fail to demonstrate AI's positive impact will be reassigned or removed from the C-suite by 2027."*
> — Gartner, via TechRadar, November 2025

## 🔌 Available Connectors

Open-source data connectors that pull from any API — zero external tools, no credential sharing, fully customizable.

### Data Sources

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

### Data Warehouses

| Name            | Status    | Links                                                               |
| --------------- | --------- | ------------------------------------------------------------------- |
| Google BigQuery | 🟢 Public | [Readme](docs/storages/supported-storages/google-bigquery.md)       |
| AWS Redshift    | 🟢 Public | [Readme](docs/storages/supported-storages/aws-redshift.md)          |
| AWS Athena      | 🟢 Public | [Readme](docs/storages/supported-storages/aws-athena.md)            |
| Snowflake       | 🟢 Public | [Readme](docs/storages/supported-storages/snowflake.md)             |
| Databricks      | 🟢 Public | [Readme](docs/storages/supported-storages/databricks.md)            |

If you find an integration missing, you can share your use case and request it in the [discussions](https://github.com/OWOX/owox-data-marts/discussions) or [build your own](packages/connectors/CONTRIBUTING.md).

## How it works

1. **Analysts define** data marts using SQL, existing tables/views, or connectors
2. **OWOX governs** — ownership, descriptions, aliases, join keys, access controls, and scheduling
3. **Business users consume** — browse the data mart library in Google Sheets, pick columns, apply filters, get live data
4. **AI Insights narrate** — pre-approved SQL generates numbers; AI writes the prose; delivered to Slack, Teams, email

## 🧑‍💻 Contribute

We're building this **with the community**, not just for it.

- Read the [Contributor Guide](packages/connectors/CONTRIBUTING.md)
- Check [open Issues](https://github.com/OWOX/owox-data-marts/issues)
- Join [Discussions](https://github.com/OWOX/owox-data-marts/discussions)
- Join our [Slack Community](https://join.slack.com/t/owox-data-marts/shared_invite/zt-3tnigd08g-f2uU_7oNNwzCyTB2tITnqA)

Whether you're adding a new connector, improving docs, or fixing a bug — we'll support and spotlight you.

## 📌 License

OWOX Data Marts is free for internal or client use, not for resale in a competing product. Dual-license model:

- **Connectors** (`packages/connectors`) — [MIT License](licenses/MIT.md)
- **Platform** (all other files) — [ELv2 License](licenses/Elasticv2.md)
- **Enterprise features** — [Enterprise License](licenses/ee.md) (files in `apps/backend/src/data-marts/data-destination-types/ee` or containing `.ee.` in the filename)

Enterprise pricing: [owox.com/pricing](https://www.owox.com/pricing?utm_source=github&utm_medium=referral&utm_campaign=readme)

---

[**Star this repo**](https://github.com/OWOX/owox-data-marts) if OWOX saves your team from the reporting backlog.
