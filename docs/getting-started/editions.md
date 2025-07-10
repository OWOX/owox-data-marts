# Editions

**OWOX Data Marts** is an open-source, self-service reporting platform designed for Data Analysts. It gives you full control over data connectivity and data enablement — entirely on your terms, with fully free editions available.

🔌 **Data Connectivity** – Easily collect marketing, financial, and CRM data into Google Sheets, BigQuery, AWS Athena, and other destinations. Define your own extraction logic, schema, and scheduling.

🚀 **Data Enablement** – Build and manage reliable Data Marts. Deliver clean, business-ready data to stakeholders via Google Sheets, Looker Studio, or Excel — while retaining full control over data logic and freshness.

---

The tables below outline available features, security, and terms in **Self-Managed editions** of OWOX Data Marts.

Legend:

- ✅ — Available
- ❌ — Not available
- ⚠️ — Limited
- ☁️ — Available as part of the Cloud edition
- ⏳ — Coming soon

---

## Features

|                                                                             | **Community Apps Script** | **Community** | **Agency** | **Enterprise** |
|-----------------------------------------------------------------------------|---------------------------|--------------------------|----------------------|------------------------|
| **Data Connectors:** [available sources](../../README.md#data-sources) [^1] | ✅ | ✅ | ✅ | ✅ |
| **Data Storages** available [^2]                                            | *Google BigQuery*, *Google Sheets* | *Google BigQuery*, *AWS Athena* | *Google BigQuery*, *AWS Athena* | *Google BigQuery*, *AWS Athena* |
| **Data Storages** coming soon                                               | ❌ | *Snowflake*, *AWS Redshift*, *Databricks*, *Azure Synapse* | *Snowflake*, *AWS Redshift*, *Databricks*, *Azure Synapse* | *Snowflake*, *AWS Redshift*, *Databricks*, *Azure Synapse* |
| **Data Enablement** [^3]                                                    | Google Sheets via Export | Google Sheets via Export and Extension[^4], Looker Studio [^5], Excel (OData) ⏳ | Google Sheets via Export and Extension [^4], Looker Studio [^5], Excel (OData) ⏳ | Google Sheets via Export and Extension [^4], Looker Studio [^5], Excel (OData) ⏳ |
| **Data Marts Management** [^6]                                              | ❌ | ✅ | ✅ | ✅ |
| **Relationships** [^7]                                                      | ❌ | ⏳ | ⏳ | ⏳ |
| **Semantic Layer** [^17]                                                    | ❌ | ⏳ | ⏳ | ⏳ |
| **Orchestration** [^8]                                                      | ⚠️ *Apps Script only* | ✅ | ✅ | ✅ |
| **Conversational UI**                                                       | ❌ | ❌ | ❌ | ⏳ |
| **How to start**                                                            | [Download Sheets template](../../README.md#data-sources) | [Install on your desktop](./quick-start.md) | [Upgrade Community Edition](https://www.owox.com/pricing)  | [Contact our team](https://www.owox.com/pricing) |

## Security & Control

|  | **Community Apps Script** | **Community** | **Agency** | **Enterprise** |
|-----------------------------|---------------------------|--------------------------|----------------------|------------------------|
| **Users Management** [^9] | ⚠️ *Limited by Apps Script* | ⏳ | ⏳ | ⏳ |
| **Social Sign-In** [^10] | ❌ | ❌ | ⏳ | ⏳ |
|  **SSO (SAML)** [^11] | ❌ | ❌ | ❌ | ⏳ |
|  **High Availability Cluster** [^12] | ❌ | ❌ | ❌ | ⏳ |
|  **Access Permissions** [^13] | ❌ | ❌ | ❌ | ⏳ |
|  **Multiple Projects** [^14] | ❌ | ❌ | ⏳ | ⏳ |
|  **Monitoring & Logging** [^15] | ❌ | ❌ | ❌ | ⏳ |
|  **Telemetry** [^16] | ❌ | ⚠️⏳ | ⚠️⏳ | ⏳ |
| **How to start** | [Download Sheets template](../../README.md#data-sources) | [Install on your desktop](./quick-start.md) | [Upgrade Community Edition](https://www.owox.com/pricing)  | [Contact our team](https://www.owox.com/pricing) |

## Terms of Service

|  | **Community Apps Script** | **Community** | **Agency** | **Enterprise** |
|-----------------------------|---------------------------|--------------------------|----------------------|------------------------|
| **Platform**  | *Source available (ELv2)* | *Source available (ELv2)* | *Source available (ELv2)* | *ELv2 + Proprietary* |
| **Connectors** | *Open Source (MIT)* | *Open Source (MIT)* | *Open Source (MIT)* | *Open Source (MIT)* |
| **Pricing** | *Free to use* | *Free to use* | *Paid subscription for a limited-feature version* | *Paid subscription for full-featured version* |
| **SLA** | ❌ | ❌ | ✅ | ✅ |
| [**Support Level**](https://support.owox.com/hc/en-us/articles/115000216754-Support-Options) | *Community* | *Community* | *Agency* | *Enterprise* |
| **How to start** | [Download Sheets template](../../README.md#data-sources) | [Install on your desktop](./quick-start.md) | [Upgrade Community Edition](https://www.owox.com/pricing)  | [Contact our team](https://www.owox.com/pricing) |

*This page will be updated regularly as we develop more features and refine editions.*

## 📝 Feature Descriptions

[^1]: **Data Connectivity** — Bring business data into your DWH in minutes — no manual exports, no complex setup.  
[^2]: **Data Storage (SQL-accessible)** — Work with live data in your own data warehouse — stay in control, stay efficient.  
[^3]: **Data Enablement** — Amplify analytics team by giving business users direct, self-service access to governed data.  
[^4]: **Google Sheets Extension** *(coming soon)* — Bring trusted data into Google Sheets — with filters and auto-refresh, without waiting on analysts.  
[^5]: **Looker Studio Connector** *(coming soon)* — Connect Data Marts to Looker Studio so teams can build dashboards on trusted, reusable data — without rewriting logic.  
[^6]: **Data Mart Management** — Think of Data Marts as your company’s internal API for analytics — structured, reusable, and controlled.  
[^7]: **Relationships** *(coming soon)* — Connect your Data Marts into a clear, reusable model — easy to maintain & share, easy for AI to explore.  
[^8]: **Orchestration** — Put your data delivery on autopilot — from source to report — and stay in control with one simple orchestration hub.  
[^9]: **Users Management** *(coming soon)* — Simple multi-user access with identical permissions and email sign-in.  
[^10]: **Social Sign In** *(coming soon)* — Simplify onboarding with secure social login for your team.  
[^11]: **SSO (SAML)** *(coming soon)* — Enable secure, one-click access with your organization’s SSO — no separate passwords to manage.  
[^12]: **High Availability Cluster** *(coming soon)* — Stay resilient at scale with high-availability architecture built for performance.  
[^13]: **Access Permissions (including Contexts)** *(coming soon)* — Give the right people/teams the right access, and block everything else.  
[^14]: **Multiple Projects** *(coming soon)* — Manage multiple business environments under one account — with clean separation and full control.  
[^15]: **Monitoring & Advanced Logging** *(coming soon)* — Stay ahead of failures with complete visibility into data workflows and system performance.  
[^16]: **Telemetry** *(coming soon)* — Gain insight into data usage patterns so you can declutter, govern, and optimize your reporting layer.
[^17]: **Semantic Layer** *(coming soon)* — Create a semantic layer that stores the mapping between the business context and the physical data tables.
