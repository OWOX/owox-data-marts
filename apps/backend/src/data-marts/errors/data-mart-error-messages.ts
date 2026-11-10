export const DATA_MART_ERROR_MESSAGES = {
  ALREADY_PUBLISHED: 'Data Mart is already published',
  DEFINITION_NOT_FOUND: 'Data Mart has no definition',
  LEGACY_STORAGE_REQUIRES_SQL:
    'Only SQL definition type is supported for Legacy Google BigQuery data storages.',
  CONNECTOR_TYPE_CHANGE_NOT_ALLOWED:
    'Input source type cannot be changed to or from a connector. Create a separate Data Mart instead.',
  CONFIGURATION_OUT_OF_DATE: 'This page is out of date. Reload it.',
  CREDENTIAL_REQUIRED: 'Select a Credential for each configuration.',
  MCP_CONNECTOR_CONFIGURATION_INVALID:
    'Use only declared non-secret connector fields and saved Credential IDs',
  MCP_CONNECTOR_CREDENTIAL_REFERENCE_INVALID: 'Select credentials with credential_id',
  CREDENTIAL_AUTH_TYPE_CHANGE_NOT_ALLOWED:
    "This configuration uses a Credential, so its authentication type can't be changed.",
  MANUAL_RUN_REQUIRES_CONNECTOR:
    'Only data marts with connector definition type can be run manually',
  MANUAL_RUN_REQUIRES_PUBLISHED: 'Only published data marts can be run manually',
  CREATE_TRIGGER_REQUIRES_PUBLISHED:
    'Cannot create a trigger for a data mart that is not published',
  UPDATE_TRIGGER_REQUIRES_PUBLISHED:
    'Cannot update a trigger for a data mart that is not published',
  INVALID_SCHEDULE: 'Invalid cron expression or timezone',
  RELATIONSHIP_SELF_REFERENCE: 'A data mart cannot have a relationship with itself',
  RELATIONSHIP_STORAGE_MISMATCH: 'Source and target data marts must belong to the same storage',
  PREVIEW_SCHEMA_REQUIRED:
    'This Data Mart has no visible fields in its Output Schema yet. Refresh the schema, then preview again.',
  PREVIEW_LIMIT_INVALID: 'Invalid preview limit',
  BIGQUERY_IDENTIFIER_INVALID: 'Invalid identifier format. Expected: project.dataset.table',
  BIGQUERY_CONNECTOR_IDENTIFIER_INVALID:
    'Invalid identifier format. Expected: dataset.table, without the project. The connector writes to the Storage project. Use only letters, digits, and underscores in the dataset name.',
  ATHENA_IDENTIFIER_INVALID:
    'Invalid identifier format. Expected: database.table or catalog.database.table',
  ATHENA_CONNECTOR_IDENTIFIER_INVALID:
    'Invalid identifier format. Expected: database.table, without the catalog.',
  DATABRICKS_IDENTIFIER_INVALID: 'Invalid identifier format. Expected: catalog.schema.table',
  DATABRICKS_CONNECTOR_IDENTIFIER_INVALID:
    'Invalid identifier format. Expected: schema.table or catalog.schema.table',
  SNOWFLAKE_IDENTIFIER_INVALID: 'Invalid identifier format. Expected: database.schema.table',
  REDSHIFT_IDENTIFIER_INVALID:
    'Invalid identifier format. Expected: schema.table or database.schema.table',
} as const;

export const DATA_MART_RUN_ERROR_MESSAGES = {
  CONCURRENCY_LIMIT_REACHED:
    'The run was not started because the maximum number of concurrent runs for this project was reached. Please wait for the current runs to finish and try again.',
  CONNECTOR_DEFINITION_CHANGED:
    'Data Mart definition changed while connector source fields were updating',
} as const;
