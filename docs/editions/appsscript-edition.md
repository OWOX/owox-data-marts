# 🏷 Apps Script Data Connectors

With this set of connectors, data analysts & marketers can collect any marketing, financial, or CRM data into **Google Sheets** & **Google BigQuery**.

No cost. No email collection. No vendors. No lock-in. No permissions sharing with 3-rd parties.

Just **Google Sheets Templates** + Your full **control** + Amazing OWOX **Community**.

[🌐 Website](https://www.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme) | [💬 Join Community](https://github.com/OWOX/owox-data-marts/discussions) | [🆘 Create an Issue](https://github.com/OWOX/owox-data-marts/issues)
![JavaScript Open-Source Connectors](../../packages/connectors/res/main-cover.png)

## 🔌 Available Connectors

### Data Sources

| Name                          | Status           | Links                                                                                                                                                                            |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facebook Ads                  | 🟢 Public        | [Copy Template](https://drive.google.com/drive/u/0/folders/1_x556pta5lKtKbTltIrPEDkNqAn78jM4), [How-to-guide](../../packages/connectors/src/Sources/FacebookMarketing/README.md) |
| Open Exchange Rates           | 🟢 Public        | [Copy Template](https://drive.google.com/drive/u/0/folders/1akutchS-Txr5PwToMzHrikTXd_GTs-84), [How-to-guide](../../packages/connectors/src/Sources/OpenExchangeRates/README.md) |
| Bank of Canada                | 🟢 Public        | [Copy Template](https://drive.google.com/drive/u/0/folders/18c9OHHmdZs-evtU1bWd6pIqdXjnANRmv), [How-to-guide](../../packages/connectors/src/Sources/BankOfCanada/README.md)      |
| LinkedIn Ads & LinkedIn Pages | 🟢 Public        | [Copy Template](https://drive.google.com/drive/folders/1anKRhqJpSWEoeDZvJtrNLgfsGfgSBtIm), [How-to-guide](../../packages/connectors/src/Sources/LinkedIn/README.md)              |
| TikTok Ads                    | 🟢 Public        | [Copy Template](https://drive.google.com/drive/folders/1zYBdx4Lm496mrCmwSNG3t82weWZRJb0o), [How-to-guide](../../packages/connectors/src/Sources/TikTokAds/README.md)             |
| X Ads (former Twitter Ads)    | 🟢 Public        | [Copy Template](https://drive.google.com/drive/folders/16PMllaU704wrjHH45MlOBjQWZdxNhxZN), [How-to-guide](../../packages/connectors/src/Sources/XAds/README.md)                  |
| Criteo Ads                    | 🟢 Public        | [Copy Template](https://drive.google.com/drive/folders/12C7MZDyUb5fnI9IIxD8o_qvLecOD7TyQ?usp=sharing), [How-to-guide](../../packages/connectors/src/Sources/CriteoAds/README.md) |
| Bing Ads                      | 🟢 Public        | [Copy Template](https://drive.google.com/drive/folders/1AmLYbXj72CpDeamfCecvIXJgvKwIpoOS?usp=sharing), [How-to-guide](../../packages/connectors/src/Sources/BingAds/README.md)   |
| Reddit Ads                    | 🟢 Public        | [Copy Template](https://drive.google.com/drive/folders/1Bnd-GN2u3BPzI1RqZpG03aeov9kcaXNx?usp=sharing), [How-to-guide](../../packages/connectors/src/Sources/RedditAds/README.md) |
| Hotline                       | ⚪️ In Discussion | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/55)                                                                                                             |
| Shopify Ads                   | ⚪️ In Discussion | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/63)                                                                                                             |
| Google Business Profile       | ⚪️ In Discussion | [Discussion](https://github.com/OWOX/owox-data-marts/discussions/61)                                                                                                             |

### Data Destinations Available

| Name            | Status    | Environment | Links                                                                     |
| --------------- | --------- | ----------- | ------------------------------------------------------------------------- |
| Google Sheets   | 🟢 Public | Apps Script | [Readme](../../packages/connectors/src/Storages/GoogleSheets/README.md)   |
| Google BigQuery | 🟢 Public | Apps Script | [Readme](../../packages/connectors/src/Storages/GoogleBigQuery/README.md) |

If you need an integration that is currently not available, you can share your use case and request it in the [discussions](https://github.com/OWOX/owox-data-marts/discussions)

## ✨ Why We Built This

We believe every **data analyst should have the power to automate data collection** — without begging for engineering help, paying for expensive SaaS tools, or exposing credentials to 3rd party SaaS tools.
We want to empower **every business to become data owners** by importing their data into Spreadsheets or data warehouses.

OWOX Data Marts - Apps Script Edition is a growing library of JavaScript **connectors** that:

- Run inside **YOUR** Google Sheet
- Import data to **YOUR** Google Sheets ot Google BigQuery
- Require **no external platforms** or credentials sharing
- Doesn't require **ANY data engineering resources**
- Are 100% open-source and **customizable**
- **Free forever**: your connector - your control

Whether you're an analyst at an agency, a startup, or in a huge enterprise, this project gives you **full control over your data collection connectors**.

---

We also have **Node.js Community Edition** to avoid the Apps Script limitations already available.
See our [🚀 Quick Start setup docs](../getting-started/quick-start.md).

## 🧰 How It Works

- 🎯 Pick your platform (e.g. Facebook Ads) from [existing integrations](#-available-connectors)
- 🧾 Make a copy of the Template from the [connectors table](#-available-connectors)
- 🔐 Add your API credentials directly to the sheet — **they stay private**
- 🚀 Run the Apps Script to pull your data
- 📅 Schedule it (optional) for daily/weekly refreshes

### 🎥 Webinar Replay: _Own Your Data_

[![Own Your Data — Webinar Thumbnail](https://img.youtube.com/vi/nQYfHX-IjY8/maxresdefault.jpg)](https://www.youtube.com/live/nQYfHX-IjY8?t=66s)

**Own Your Data: How Data Analysts Can Connect Any Data**  
Learn how to collect and automate marketing, financial, and any other data into Google Sheets or BigQuery — with **zero engineering help** and **no SaaS subscriptions**.

▶️ [**Watch the Replay on YouTube**](https://www.youtube.com/live/nQYfHX-IjY8?t=66s)

What you'll learn:

- Why data access is broken (and how to fix it)
- Facebook Ads → Sheets and TikTok Ads → BigQuery — **live demos**
- How to automate reporting across clients without SaaS limits
- How to contribute, customize, and grow the connector library

🎯 **For**: Data analysts at agencies, startups, enterprises, or doing solo  
🛠️ **Includes**: Free templates & walkthroughs  
🎙️ **Hosted by**: [Ievgen Krasovytskyi](https://www.linkedin.com/in/ievgenkrasovytskyi/)

## 🧑‍💻 Contribute or Build Your Own

Want to build a connector?
We'd love your help.
**To contribute to existing integrations or create a new one**:

- 📘 Read the [Contributor guide](../../packages/connectors/CONTRIBUTING.md)
- 📌 Check open [connector requests](https://github.com/OWOX/owox-data-marts/issues)

All you need to get started is basic knowledge of Apps Script and a GitHub login.
No software installation is required on your computer.

Whether you're adding a new platform connector, tweaking one, or improving docs, we'll support and **spotlight you**.

## 🌍 Join the Community

Need help or want to connect with others?

- 💬 [Join our Community](https://github.com/OWOX/owox-data-marts/discussions)
- 🗨️ Ask questions or suggest features

We're building this **with the community**, not just for it.

## 📌 License

OWOX Data Marts is free for internal or client use, not for resale in a competing product.

- **Apps Script Connectors** (`packages/connectors`) are distributed under the [MIT License](../../licenses/MIT.md)

---

⭐ **Like this project?** [Star the repo here »](https://github.com/OWOX/owox-data-marts)
