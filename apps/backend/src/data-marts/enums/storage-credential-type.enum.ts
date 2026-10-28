// The type of old storage key rows; migration 1792600000000 imports it through the conversion plan.
export enum StorageCredentialType {
  GOOGLE_SERVICE_ACCOUNT = 'google_service_account',
  GOOGLE_OAUTH = 'google_oauth',
  AWS_IAM = 'aws_iam',
  SNOWFLAKE_PASSWORD = 'snowflake_password',
  SNOWFLAKE_KEY_PAIR = 'snowflake_key_pair',
  DATABRICKS_PAT = 'databricks_pat',
}
