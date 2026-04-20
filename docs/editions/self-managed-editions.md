# Self-Managed Editions

The tables below outline available features, security, and terms in **Self-Managed editions** of OWOX Data Marts.

Legend:

- ✅ — Available
- ❌ — Not available
- ⚠️ — Limited
- ⏳ — Coming soon

---

## Features

|                                                                             | **Community**                                                                                                                           | **Agency**                                                                                                                                                  | **Enterprise**                                                                                                                         |
| --------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------: |
| **Ideal for**                                                                 | _Self-service reporting with full data autonomy_ | _Self-service reporting with full data autonomy across unlimited clients_ | _Self-service reporting with full data autonomy, built your way_ |
| **Data Connectors:** [available sources](../../README.md#data-sources) [^1] | ✅                                                                                                                                      | ✅                                                                                                                                                          | ✅                                                                                                                                     |
| **Data Storages** [^2]                                                      | ![Google BigQuery](../res/bigquery.svg) ![AWS Athena](../res/athena.svg) ![Databricks](../res/databricks.svg) ![Snowflake](../res/snowflake.svg) ![Amazon Redshift](../res/redshift.svg)                                                                |  ![Google BigQuery](../res/bigquery.svg) ![AWS Athena](../res/athena.svg) ![Databricks](../res/databricks.svg) ![Snowflake](../res/snowflake.svg) ![Amazon Redshift](../res/redshift.svg)                                                                              | ![Google BigQuery](../res/bigquery.svg) ![AWS Athena](../res/athena.svg) ![Databricks](../res/databricks.svg) ![Azure Synapse](../res/synapse.svg) ![Snowflake](../res/snowflake.svg) ![Amazon Redshift](../res/redshift.svg)                                                               |
| **Data Destinations** [^3]                                                  | ![Google Sheets](../res/g-sheets.svg) ![Looker Studio](../res/looker.svg)                                                               | ![Google Sheets](../res/g-sheets.svg) ![Looker Studio](../res/looker.svg)                                                                                   | ![Google Sheets](../res/g-sheets.svg) ![Looker Studio](../res/looker.svg) ![MS Excel](../res/ms-excel.svg) ![Power BI](../res/power-bi.svg) ![Tableau](../res/tableau.svg) ![Email](../res/email.svg) ![Slack](../res/slack.svg) ![Teams](../res/teams.svg) ![Google Chat](../res/google_chat.svg)                                                            |
| **Data Marts Management** [^4]                                              | ✅                                                                                                                                      | ✅                                                                                                                                                          | ✅                                                                                                                                     |
| **AI Insights** [^5]                                                            | ❌                                                                                                                                      | ❌                                                                                                                                                          | ✅                                                                                                                                     |
| **Conversational AI** [^6]                                                       | ❌                                                                                                                                      | ❌                                                                                                                                                          | ✅                                                                                                                                     |
| **How to start**                                                            | [Install on your desktop](../getting-started/quick-start.md)                                                                            | [Upgrade Community Edition](https://www.owox.com/pricing)                                                                                                   | [Contact our team](https://www.owox.com/pricing)                                                                                       |

## Security & Control

|                                     | **Community**                                                | **Agency**                                                | **Enterprise**                                   |
| ----------------------------------- | :------------------------------------------------------------: | :---------------------------------------------------------: | :------------------------------------------------: |
| **Users Management** [^7]           | ✅                                                           | ✅                                                        | ✅                                               |
| **Social Sign-In** [^8]             | ❌                                                           | ⏳                                                        | ✅                                               |
| **SSO (SAML)** [^9]                 | ❌                                                           | ❌                                                        | ✅                                               |
| **High Availability Cluster** [^10] | ❌                                                           | ❌                                                        | ✅                                               |
| **Access Permissions** [^11]        | ❌                                                           | ❌                                                        | ✅                                               |
| **Multiple Projects** [^12]         | ❌                                                           | ⏳                                                        | ✅                                               |
| **Monitoring & Logging** [^13]      | ❌                                                           | ❌                                                        | ✅                                               |
| **Telemetry** [^14]                 | ⏳                                                         | ⏳                                                      | ✅                                               |
| **How to start**                    | [Install on your desktop](../getting-started/quick-start.md) | [Upgrade Community Edition](https://www.owox.com/pricing) | [Contact our team](https://www.owox.com/pricing) |

## Terms of Service

|                                                                                              | **Community**                                                | **Agency**                                                | **Enterprise**                                   |
| -------------------------------------------------------------------------------------------- | :------------------------------------------------------------: | :---------------------------------------------------------: | :------------------------------------------------: |
| **Platform**                                                                                 | _Source available (ELv2)_                                    | _Source available (ELv2)_                                 | _ELv2 + Proprietary_                             |
| **Connectors**                                                                               | _Open Source (MIT)_                                          | _Open Source (MIT)_                                       | _Open Source (MIT)_                              |
| **Pricing**                                                                                  | _Free to use_                                                | _Paid subscription for a limited-feature version_         | _Paid subscription for full-featured version_    |
| **SLA**                                                                                      | ❌                                                           | ✅                                                        | ✅                                               |
| [**Support Level**](https://support.owox.com/hc/en-us/articles/115000216754-Support-Options) | _Community_                                                  | _Agency_                                                  | _Enterprise_                                     |
| **How to start**                                                                             | [Install on your desktop](../getting-started/quick-start.md) | [Upgrade Community Edition](https://www.owox.com/pricing) | [Contact our team](https://www.owox.com/pricing) |

_This page will be updated regularly as we develop more features and refine editions._

## 📝 Feature Descriptions

[^1]: **Data Connectivity** — Bring business data into your DWH in minutes — no manual exports, no complex setup.

[^2]: **Data Storage (SQL-accessible)** — Work with live data in your own data warehouse — stay in control, stay efficient.

[^3]: **Data Enablement** — Amplify analytics team by giving business users direct, self-service access to governed data.

    - **Google Sheets Extension** _(available in Cloud edition)_ — Empower business users with self-service access to trusted Data Marts. They can filter, schedule, and refresh data directly within the Google Sheets interface, gaining independence while analysts maintain full governance.
    - **Google Sheets Export** — Automate data delivery by pushing Data Mart results to spreadsheets via flexible triggers. Designed for analysts, this feature provides granular control over data flow and schedules directly from the OWOX Data Marts interface.
    - **Looker Studio Connector** — Connect Data Marts to Looker Studio so teams can build dashboards on trusted, reusable data — without rewriting logic.
    - **Open Data Protocol (OData)** _(coming soon)_ — Seamlessly connect your preferred tools to trusted data using OData protocol, empowering business users with flexible, secure access.

[^4]: **Data Mart Management** — Think of Data Marts as your company’s internal API for analytics — structured, reusable, and controlled.

[^5]: **Insights** — Get AI-powered [Insights](../getting-started/setup-guide/insights.md) that turn raw Data Mart output into recurring, narrative-style reports. Deliver them directly to your stakeholders where they work — Slack, MS Teams, Google Chat, or Email — without writing new queries every time, while maintaining 100% control over the results.

[^6]: **Conversational AI** — Chat with your data in corporate messenger

[^7]: **Users Management** — Simple multi-user access with identical permissions and email sign-in.

[^8]: **Social Sign In** — Simplify onboarding with secure social login for your team.

[^9]: **SSO (SAML)** _(coming soon)_ — Enable secure, one-click access with your organization’s SSO — no separate passwords to manage.

[^10]: **High Availability Cluster** _(coming soon)_ — Stay resilient at scale with high-availability architecture built for performance.

[^11]: **Access Permissions (including Contexts)** — Give the right people/teams the right access, and block everything else.

[^12]: **Multiple Projects** _(coming soon)_ — Manage multiple business environments under one account — with clean separation and full control.

[^13]: **Monitoring & Advanced Logging** _(coming soon)_ — Stay ahead of failures with complete visibility into data workflows and system performance.

[^14]: **Telemetry** _(coming soon)_ — Gain insight into data usage patterns so you can declutter, govern, and optimize your reporting layer.
