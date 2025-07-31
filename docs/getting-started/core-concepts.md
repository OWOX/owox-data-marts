# Core Concepts

Welcome to **OWOX Data Marts** – a structured, controlled, and reliable way to control, organize, and share business-ready data from data teams to business users.
The OWOX team, with over 20 years of experience developing data products, stays on 3 core beliefs:

- **Control** over reporting for data analysts
- **Freedom** for business users to timely access data
- **Trusted** data for across reports & dashboards

This guide will help you better understand our beliefs, values & save time during implementation.

![Core Concepts](../res/core-concepts.svg)

## Entities

OWOX Data Marts has a lot of terms inside, but here are the basic ones:

- [**Data Mart**](#data-mart) is a business-ready artifact defined by analysts and shared with business users for reporting.
- [**Sources**](#source) are the platforms like Facebook or TikTok Ads, QuickBooks, from which raw data is collected via connectors.
- [**Storage**](#storage) is a data warehouse (e.g., BigQuery, Athena) where all data is stored & processed.
- [**Destination**](#destination) is a BI tool where business users access data (e.g., Google Sheets, Looker Studio).
- [**Reports**](#report) are specific spreadsheet tabs where data is exported to.
- [**Triggers**](#trigger) automated data delivery on a schedule.
- [**Run**](#run-types) is a single manual or an automated data load action.

### Data Mart

![Data Marts](../res/screens/data-marts-table.png)

An OWOX Data Mart is the foundational entity in OWOX Data Marts. It's a controlled, ready-to-share artifact designed for analytics and reporting. 

It’s crafted by data analysts and can be defined using: 

- [SQL](setup-guide/sql-data-mart.md)
- [Tables](setup-guide/table-data-mart.md)
- [Views](setup-guide/view-data-mart.md)
- [Patterns](setup-guide/pattern-data-mart.md)
- [Connectors to platforms’ API](setup-guide/connector-data-mart.md)

and handed off to business users so they can run, filter, and schedule reports – without breaking YOUR logic and asking for help, pinging in Slack, or creating another JIRA ticket.

Unlike raw data inside your data warehouse, each Data Mart is:

- **Documented** with a description, business outcome, and output schema with friendly metric names
- **Reusable** across BI tools: Google Sheets, Looker Studio, Excel, and more
- **Trustworthy** - no more asking “Whose report is right?”
- **Modeled** (optional) by setting up relationships with other data marts

> ☝️ Think of it as a **source of truth for a specific business question**, like:

- “_How did our customer acquisition cost change over time?_”
- “_What’s our ROAS by campaign and channel?_”
- “_Which features drive subscription renewals?_”

**Connector-defined** Data Marts import data from external **Sources** (e.g., Facebook Ads, Google Sheets) into a **Storage**.
All other types of Data Marts query data directly from the **Storage**.

> ☝️ **Data Marts** empower Data Analysts to control and hand off business-ready data.

### Source

**Source** is a service that holds data you want to manipulate—for example, Facebook Ads, TikTok Ads, Google Analytics, Salesforce, Google Sheets, etc. You can find [the available connectors here](https://docs.owox.com/#data-sources).

> ☝️ By managing a Data Mart’s **Sources**, a Data Analyst controls the origin of the data.

### Storage

![Storages](../res/screens/storages-table.png)

[**Storage**](../storages/manage-storages.md) is your project’s data warehouse (DWH) — a SQL-compatible system where all your data lives, such as:

- Google BigQuery
- AWS Athena
- Databricks
- Snowflake
- etc

Each project must have at least one **Storage**, which stores and processes all your data.
You can configure multiple **Storages**, but each **Data Mart** must be linked to exactly one.

> ☝️ By specifying a Data Mart’s **Storage**, a Data Analyst ensures data ownership and controls where the data is stored and processed.

### Destination

![Destinations](../res/screens/destinations-table.png)

A [**Destination**](../destinations/manage-destinations.md) is an interface or application used by business users to access the data. Supported destinations include:

- [Google Sheets](../destinations/supported-destinations/google-spreadsheets.md)
- Looker Studio
- OData (compatible with Excel, Tableau, Power BI, etc)

Each **Data Mart** can be linked to multiple **Destinations**.

- All destinations except Google Sheets operate in **pull mode** — they query **Storage** when a user or tool requests the data.  
- Google Sheets uses **push mode** — data is exported from the **Data Mart** into a **Report** in Google Sheets via manual or scheduled runs.

> ☝️ **Destinations** allow Data Analysts to control and monitor which services business users consume data in.

### Report

A *Report* defines a specific sheet within a Google Sheets document where the Data Mart’s data is exported.
Different Google Sheets Reports of the same Data Mart may have different scheduled triggers.

### Trigger

**Triggers** automate data movement on a schedule. There are 2 types of triggers in OWOX Data Marts:

- [Report Triggers](setup-guide/report-triggers.md)
- [Connector Triggers](setup-guide/connector-triggers.md)

> ☝️ **Triggers** allow Data Analysts to control data freshness and save time.

### Run Types

- **Connector Run** – import data from a **Source** into **Storage**.  
- **Report Runs** – push or pull data (stored in **Storage**) to a **Destination**.
