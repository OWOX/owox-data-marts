# OWOX Data Marts concepts
**OWOX Data Marts** is an open-source self-service analytics platform. It gives you full control over data connectivity and data enablement.

## Core concepts
* **Data Source** — a system that holds data that the end user wants to manipulate.g., Facebook Ads, Salesforce, Google Analytics, Google Sheets, MS Excel, Google BigQuery, Amazon Athena
* **Data Storage** — A special kind of Data Source  that provides an SQL interface for querying and caching data e.g., Google BigQuery, Clickhouse, Amazon Redshift, Snowflake
* **Data Mart** — a specialized subset of Data Storage  defined with SQL/table/sharded tables/view and metadata. Usually serves the analytical needs as a base for building Reports on top of it. e.g. metadata: description, creator, relation to other data marts
* **Data Destination** — a system where the end-user manipulates data e.g., Google Sheets, MS Excel, Looker Studio, MS Power BI

