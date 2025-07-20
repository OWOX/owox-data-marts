# Core Concepts

**OWOX Data Marts** is a solution developed by the OWOX team, drawing on over 20 years of experience in data analytics and business consulting. Its primary goal is to help organizations embrace self-service analytics by providing both control for data analysts and freedom for business users.

This guide will help you unlock the product’s full value and save time during implementation.

---
## Entities
### Data Mart

A **Data Mart** is the foundational entity in OWOX Data Marts. It can be defined in various ways, for example:

- With a **SQL query**
- By referencing an existing **table**
- Using a community **connector**
- etc

**Connector-defined** Data Marts import data from external **Sources** (e.g., Facebook Ads, Google Sheets) into a **Storage**.
All other types of Data Marts query data directly from the **Storage**.

---
### Storage

**Storage** refers to your SQL-compatible data warehouse, such as:

- Google BigQuery
- AWS Athena
- Snowflake
- etc

All your data is stored and processed in your **Storage**.  
You can configure multiple storages, but each **Data Mart** must be linked to exactly one **Storage**.

---
### Source

---
### Destination

A **Destination** is an interface or application used by business users to access the data. Supported destinations include:

- Google Sheets
- Looker Studio
- OData (compatible with Excel, Tableau, Power BI, etc)

Each **Data Mart** can be linked to multiple **Destinations**.

- All destinations except Google Sheets operate in **pull mode** — they query **Storage** when a user or tool requests the data.  
- Google Sheets uses **push mode** — data is exported from the **Data Mart** into a **Report** in Google Sheets via manual or scheduled runs.

---
### Trigger

Automation controls data movement on a scheduled basis through **Triggers**.

Triggers manage two types of runs:
- **Connector Runs** – Import data from a **Source** into **Storage**.  
- **Report Runs** – Push or pull a **Data Mart's** data (stored in **Storage**) to a **Destination**.

---
## Use Cases
