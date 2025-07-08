## 🏷️ OWOX Data Marts — Free, Open-Source Connectors for Data Analysts

Collect any marketing, financial, or CRM data into Google Sheets or BigQuery — for free.  
No vendors. No lock-in. No permissions sharing with 3-rd parties.
Just JavaScript + full control for you.

[🌐 Website](https://www.owox.com?utm_source=github&utm_medium=referral&utm_campaign=readme) | [💬 Join Community](https://github.com/OWOX/owox-data-marts/discussions) | [🆘 Create an Issue](https://github.com/OWOX/owox-data-marts/issues)
![JavaScript Open-Source Connectors](packages/connectors/res/main-cover.png)

## ✨ Why We Built This

We believe every **data analyst should have the power to automate their data collection & reporting** — without begging for engineering help, paying for expensive SaaS tools, or exposing credentials to vendors.
We want to empower **every business to become data owners** by importing their data into Spreadsheets or data warehouses.

OWOX Data Marts is a growing library of JavaScript-based **connectors** that:

- Pull data from **any APIs** like Facebook, TikTok, LinkedIn, etc.
- Run inside **YOUR** Google Sheet (via Apps Script)
- Require **no external platforms** or credentials sharing
- Doesn't require **ANY data engineering resources**
- Are 100% open-source and **customizable**
- **Free forever**: your connector - your control

Whether you're an analyst at an agency, a startup, or in a huge enterprise, this project gives you **full control over your data collection connectors**.

## 🔌 Available Connectors

### Data Sources

| Name                          | Status            | Links                                                                                                                                                                                                                                 |
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

### Data Storage Options

| Name            | Status    | Links                                                                                                       |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| Google Sheets   | 🟢 Public | [Issues](https://github.com/OWOX/owox-data-marts/issues?q=is%3Aissue%20state%3Aopen%20label%3AGoogleSheets) |
| Google BigQuery | 🟢 Public | [Issues](https://github.com/OWOX/owox-data-marts/issues?q=state%3Aopen%20%20label%3AGoogleBigQuery)         |

If you find an integration missing, you can share your use case and request it [here](https://github.com/OWOX/owox-data-marts/discussions)

## 🧰 How It Works

- 🎯 Pick your platform (e.g. Facebook Ads) from [existing integrations](packages/connectors/src/Sources)
- 🧾 Make a copy of the Template from the [table above]
- 🔐 Add your API credentials directly to the sheet — **they stay private**
- 🚀 Run the Apps Script to pull your data
- 📅 Schedule it (optional) for daily/weekly refreshes

If you experience any **issues** or want to report a bug, please open an [issue](https://github.com/OWOX/owox-data-marts/issues).

**To become a part of the Core team**, please start by submitting a pull request to the Core part of the product. Understanding TypeScript, Git, and software development is required.

**To get support**, please [visit Q&A](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) first.

## 🎥 Watch the Webinar - *Own Your Data*

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

- 📘 Read the [Contributor guide](packages/connectors/CONTRIBUTING.md)
- 📌 Check open [connector requests](https://github.com/OWOX/owox-data-marts/issues)

All you need to get started is basic knowledge of Apps Script and a GitHub login.
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

## 🚀 Running the App Locally and in Production

Node.js version 22.16.0 or higher is required. To run the full application (backend + frontend), use the following commands:

### 🛠 Development Mode

Run both the NestJS backend and the Vite frontend in watch mode:

```bash
npm run dev
```

This command uses npm-run-all to launch both services concurrently. It’s ideal for local development and live editing.

## 🌐 Serve Production Build

Start the NestJS server that serves static frontend files:

```bash
npm run serve
```

## 📖 Documentation

- [Lint-staged Workflow](docs/lint-staged-workflow.md) - Code quality and formatting workflow
- [Monorepo Structure](docs/monorepo-structure.md) - Project architecture and organization
- [Migrations Guide](apps/backend/src/migrations/README.md) - Database migration workflow

---

⭐ **Like this project?** [Star the repo here »](https://github.com/OWOX/owox-data-marts)
