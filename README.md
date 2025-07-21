# OWOX Data Marts

## 🏷 Open-Source Self-Service Analytics Platform

Power self-service analytics from your infrastructure – with reusable Data Marts, semantic layer, and zero vendor lock-in for what you do. Forever free & fully yours.

[📘 Quick Start Guide](./quick-start.md) | [🌐 Website](https://www.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme) |  [💬 Community](https://github.com/OWOX/owox-data-marts/discussions) | [🆘 Create an Issue](https://github.com/OWOX/owox-data-marts/issues)

![OWOX Data Marts - Open-Source Self-Service Analytics Platform](https://i.imgur.com/XVKA8mI.png)

## ✨ Why We Built This

Every data team deserves the power to automate analytics processes while keeping full control over them – **without relying on engineers**, **without exposing credentials**, and **without buying another SaaS platform**.

The **OWOX BI Community Edition** is an open-source platform for building, storing, managing & sharing **Data Marts** and enabling **controlled self-service reporting** – with all logic defined and deployed on your terms.

Whether you're a data analyst at a startup, a team lead at an agency, or the head of BI at an enterprise – this repo gives you full control over the reporting layer.

## 🚀 What You Can Do with OWOX Data Marts

### 📘 Create a Data Mart Library

Bring together data from your warehouse (BigQuery, Snowflake, etc.), APIs, or spreadsheets – and turn it into fast, reusable artifacts that you can manage & share:

- Connectors to any marketing, financial, or CRM data that you can collect into **AWS Athena** or **Google BigQuery** (more supported DWHs are being developed as you read this)
- Custom SQL
- Tables & views
- Table patterns (eg. events_2025*)

### 📤 Deliver Trusted Data Anywhere

Connect your Data Marts to Google Sheets, Looker Studio, or Excel – empowering business teams with reports they need to make decisions.

### 🧾 Define a Semantic Layer

Document KPIs and metrics once, and keep every dashboard, pivot table, and report in sync with the same numbers & logic behind calculations – no matter the tool.

### 📅 Automate Everything

Use the advanced scheduler to refresh both Data Marts and exports at any time, fully automated and managed from the single place

## Key Capabilities

| Feature                         | Available |
|----------------------------------|-------------------------------|
| [Data Connectors](#data-sources) (No limits on #)  | ✅ |
| [Data Storages](#data-storages) (BigQuery & Athena)  | ✅ |
| Spreadsheet & BI tool integrations  | ✅ |
| Data Mart Management (Unlimited)  | ✅ |
| Orchestration (Unlimited refreshes)  | ✅ |
| Runs in your infra (GCP, AWS) | ✅ |
| Semantic Layer for business logic  | ✅ |
| Full version control for SQL Data Marts  | ✅ |
| Data access control  | 🔒 Enterprise Only |
| AI Assistant (Conversational UI) | 🔒 Enterprise Only |
| Audit logs & more  | 🔒 Enterprise Only |

**[Install locally on mac / pc now](docs/getting-started/quick-start.md)**

## 🔌 Available Connectors

**OWOX Data Marts** includes growing library of JavaScript **connectors** that:

- Pull data from **any APIs** like Facebook, TikTok, LinkedIn, etc.
- Require **no external platforms** or credentials sharing
- Don't require **ANY data engineering resources**
- Free, open-source and **customizable**
- Give full control over the logic

### Data Sources

| Name                          | Status            | Links     |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facebook Ads                  | 🟢 Public         | [Google Drive](https://drive.google.com/drive/u/0/folders/1_x556pta5lKtKbTltIrPEDkNqAn78jM4), [Source Code](packages/connectors/src/Sources/FacebookMarketing), [Readme](packages/connectors/src/Sources/FacebookMarketing/README.md) |
| Open Exchange Rates           | 🟢 Public         | [Google Drive](https://drive.google.com/drive/u/0/folders/1akutchS-Txr5PwToMzHrikTXd_GTs-84), [Source Code](packages/connectors/src/Sources/OpenExchangeRates), [Readme](packages/connectors/src/Sources/OpenExchangeRates/README.md) |
| Bank of Canada                | 🟢 Public         | [Google Drive](https://drive.google.com/drive/u/0/folders/18c9OHHmdZs-evtU1bWd6pIqdXjnANRmv), [Source Code](packages/connectors/src/Sources/BankOfCanada), [Readme](packages/connectors/src/Sources/BankOfCanada/README.md)           |
| LinkedIn Ads & LinkedIn Pages | 🟢 Public         | [Google Drive](https://drive.google.com/drive/folders/1anKRhqJpSWEoeDZvJtrNLgfsGfgSBtIm), [Source Code](packages/connectors/src/Sources/LinkedIn), [Readme](packages/connectors/src/Sources/LinkedIn/README.md)                       |
| TikTok Ads                    | 🟢 Public         | [Google Drive](https://drive.google.com/drive/folders/1zYBdx4Lm496mrCmwSNG3t82weWZRJb0o), [Source Code](packages/connectors/src/Sources/TikTokAds), [Readme](packages/connectors/src/Sources/TikTokAds/README.md)                     |
| X Ads (former Twitter Ads)    | 🟢 Public         | [Google Drive](https://drive.google.com/drive/folders/16PMllaU704wrjHH45MlOBjQWZdxNhxZN), [Source Code](packages/connectors/src/Sources/XAds), [Readme](packages/connectors/src/Sources/XAds/README.md)                               |
| Criteo Ads                    | 🟢 Public         | [Google Drive](https://drive.google.com/drive/folders/12C7MZDyUb5fnI9IIxD8o_qvLecOD7TyQ?usp=sharing), [Source Code](packages/connectors/src/Sources/CriteoAds), [Readme](packages/connectors/src/Sources/CriteoAds/README.md)         |
| Bing Ads                      | 🟢 Public         | [Google Drive](https://drive.google.com/drive/folders/1AmLYbXj72CpDeamfCecvIXJgvKwIpoOS?usp=sharing), [Source Code](packages/connectors/src/Sources/BingAds), [Readme](packages/connectors/src/Sources/BingAds/README.md)             |
| Reddit Ads                    | 🟢 Public | [Google Drive](https://drive.google.com/drive/folders/1Bnd-GN2u3BPzI1RqZpG03aeov9kcaXNx?usp=sharing), [Source Code](packages/connectors/src/Sources/RedditAds), [Readme](packages/connectors/src/Sources/RedditAds/README.md)                      |
| Hotline                       | ⚪️ In Discussion  | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/55)                                                                                                                                                                  |
| Shopify Ads                   | ⚪️ In Discussion  | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/63)                                                                                                                                                                  |
| Google Business Profile       | ⚪️ In Discussion  | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/61)                                                                                                                                                                  |

### Data Storages

| Name            | Status    | Environment          | Links                                                                                                       |
| --------------- | --------- |----------------------| ----------------------------------------------------------------------------------------------------------- |
| Google Sheets   | 🟢 Public | Apps Script          | [Readme](packages/connectors/src/Storages/GoogleSheets/README.md)                                            |
| Google BigQuery | 🟢 Public | Node.js, Apps Script | [Readme](packages/connectors/src/Storages/GoogleBigQuery/README.md)                                          |
| AWS Athena      | 🟢 Public | Node.js              | [Readme](packages/connectors/src/Storages/AwsAthena/README.md)                                             |

If you find an integration missing, you can share your use case and request it in the [discussions](https://github.com/OWOX/owox-data-marts/discussions)

## 🧰 How It Works

### Community Edition (Node.js)

- Use this [🚀 quick start no-code setup guide](docs/getting-started/quick-start.md)
- Deploy on GCP, AWS Lambda, or any infrastructure of your choice

### Apps Script Edition (Google Sheets)

Alternatively, you can run any of [our connectors](#data-sources) using Google Sheet templates we've developed for [OWOX Data Marts Apps Script Edition](./appsscript-edition.md)

- 🎯 Pick your platform (e.g. Facebook Ads) from [existing integrations](#data-sources)
- 🧾 Make a copy of the Template from the [connectors table](#data-sources)
- 🔐 Add your API credentials directly to the sheet — **they stay private**
- 🚀 Run the Apps Script to pull your data
- 📅 Schedule it (optional) for daily/weekly refreshes

#### 🎥 Watch the Webinar - *Own Your Data*

[**Own Your Data: How Data Analysts Can Connect Any Data**](https://www.youtube.com/live/nQYfHX-IjY8?t=66s)

Learn how to collect and automate marketing, financial, and any other data into Google Sheets or BigQuery — with **zero engineering help** and **no SaaS subscriptions**.

What you'll learn:

- Why data access is broken (and how to fix it)
- Facebook Ads → Sheets and TikTok Ads → BigQuery — **live demos**
- How to automate reporting across clients without SaaS limits
- How to contribute, customize, and grow the connector library

🎯 **For**: Data analysts at agencies, startups, enterprises, or doing solo  
🛠️ **Includes**: Free templates & walkthroughs  
🎙️ **Hosted by**: [Ievgen Krasovytskyi](https://www.linkedin.com/in/ievgenkrasovytskyi/)

▶️ [**Watch the Replay on YouTube**](https://www.youtube.com/live/nQYfHX-IjY8?t=66s)

## 🧑‍💻 Contribute or Build Your Own

Want to build a connector?

We'd love your help.

**To contribute to existing integrations or create a new one:**

- 📘 Read the [contributor guide](packages/connectors/CONTRIBUTING.md)
- 🚀 Check [this tutorial](packages/connectors/TUTORIAL.md) of how we built a GitHub Connector in 25 minutes
- 📌 Check open [requests](https://github.com/OWOX/owox-data-marts/issues)

All you need to get started is the desire to build a new connector.

No software installation is required on your computer.

Whether you're adding a new API, tweaking one, or improving docs, we'll support and **spotlight you**.

## 🌍 Join the Community

Need help or want to connect with others?

- 💬 [Join our Community](https://github.com/OWOX/owox-data-marts/discussions)
- 🗨️ Ask questions or suggest features

We're building this **with the community**, not just for it.

## 📌 License

OWOX Data Marts is free for internal or client use, not for resale in a competing product. The project uses a dual-license model:

- **Connectors** (`packages/connectors`) are distributed under the [MIT License](licenses/MIT.md)
- **Platform** (all other files and directories) is distributed under the [ELv2 License](licenses/Elasticv2.md)

---

⭐ **Like this project?** [Star the repo here »](https://github.com/OWOX/owox-data-marts)
