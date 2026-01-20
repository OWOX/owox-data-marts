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
- Added Databricks storage configuration in connector execution service
- Fixed schema type to use 'databricks-data-mart-schema' instead of storage type enum
- Added support for retrieving column comments and primary key constraints from Databricks tables
- Fixed table schema retrieval to properly handle fully qualified table names (catalog.schema.table)

**Frontend:**

- Added Databricks connection form with host, HTTP path, and token fields
- Created field descriptions with step-by-step setup instructions
- Implemented Databricks schema table with full field type support
- Added Databricks field type selector to schema editor
- Updated data storage type status from COMING_SOON to ACTIVE
- Fixed storage configuration display in Data Mart and Connector views
- Added Target Setup step for Databricks connectors with catalog, schema, and table fields
- Added Databricks display name to connector definition helpers

**Connectors:**

- Implemented DatabricksStorage class for connector data marts
- Added support for MERGE operations using Delta Lake
- Included automatic table and schema creation
- Added catalog and schema configuration at connector level (not storage level)
- Added @databricks/sql package import and global exposure in connector-runner
- Implemented obfuscateSpecialCharacters method for SQL string escaping
- Fixed unique key generation to use inherited getUniqueKeyByRecordFields method
- Added automatic buffer flush after saveData to ensure all data is persisted
- Added automatic detection and creation of new columns from incoming data
- Enhanced error handling with detailed logging for table/schema/catalog checks
- Added automatic PRIMARY KEY constraint creation using connector's uniqueKeys

**Configuration Notes:**

- Catalog and schema are specified at the connector/data mart level using fully qualified names (catalog.schema.table)
- Storage configuration only requires host, HTTP path, and Personal Access Token
- Supports Unity Catalog for data governance
- All tables use Delta Lake format with ACID transactions
