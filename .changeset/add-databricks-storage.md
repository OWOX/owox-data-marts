---
'owox': minor
---

# Add Databricks storage type with Personal Access Token authentication

This change adds support for Databricks as a new storage type in OWOX Data Marts platform. Users can now connect to Databricks SQL warehouses using Personal Access Token authentication.

**Backend:**

- Added Databricks authentication method (Personal Access Token)
- Implemented Databricks API adapter using @databricks/sql driver
- Created 11 service implementations (access validator, query builder, report reader, etc.)
- Added support for Databricks SQL data types (STRING, INT, BIGINT, DOUBLE, DECIMAL, TIMESTAMP, etc.)
- Integrated Databricks reader state for resumable report reading
- Added Databricks support to Looker Studio connector and Google Sheets export

**Frontend:**

- Added Databricks connection form with host, HTTP path, and token fields
- Created field descriptions with step-by-step setup instructions
- Implemented Databricks schema table with full field type support
- Added Databricks field type selector to schema editor
- Updated data storage type status from COMING_SOON to ACTIVE

**Connectors:**

- Implemented DatabricksStorage class for connector data marts
- Added support for MERGE operations using Delta Lake
- Included automatic table and schema creation
- Added catalog and schema configuration at connector level (not storage level)

**Configuration Notes:**

- Catalog and schema are specified at the connector/data mart level using fully qualified names (catalog.schema.table)
- Storage configuration only requires host, HTTP path, and Personal Access Token
- Supports Unity Catalog for data governance
- All tables use Delta Lake format with ACID transactions
