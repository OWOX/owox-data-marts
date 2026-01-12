---
'owox': minor
---

# Refactor: Standardize Data Types Across Connectors

Introduced centralized data type definitions and standardized type handling across all storage connectors and API references.

- Created `Constants/DataTypes.js` with standardized type definitions (STRING, BOOLEAN, INTEGER, NUMBER, DATE, DATETIME, TIME, TIMESTAMP, ARRAY, OBJECT)
- Updated all storage connectors (AWS Athena, AWS Redshift, Google BigQuery, Snowflake) to use standardized `DATA_TYPES` constants for type mapping
- Refactored field definitions across all source connectors (Facebook Marketing, Google Ads, LinkedIn Ads, Microsoft Ads, Reddit Ads, TikTok Ads, X Ads, Shopify, GitHub, etc.) to use consistent data type references
- Changed `AbstractStorage.getColumnType()` to throw an error if not implemented, enforcing proper implementation in child classes
- Eliminated storage-specific type constants (e.g., `GoogleBigQueryType`) from API reference files where they were inappropriately used
