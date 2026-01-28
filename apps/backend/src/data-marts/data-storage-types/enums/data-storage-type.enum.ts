export enum DataStorageType {
  GOOGLE_BIGQUERY = 'GOOGLE_BIGQUERY',
  AWS_ATHENA = 'AWS_ATHENA',
  SNOWFLAKE = 'SNOWFLAKE',
  AWS_REDSHIFT = 'AWS_REDSHIFT',
  DATABRICKS = 'DATABRICKS',
}

export function toHumanReadable(type: DataStorageType): string {
  switch (type) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return 'Google BigQuery';
    case DataStorageType.AWS_ATHENA:
      return 'AWS Athena';
    case DataStorageType.SNOWFLAKE:
      return 'Snowflake';
    case DataStorageType.AWS_REDSHIFT:
      return 'AWS Redshift';
    case DataStorageType.DATABRICKS:
      return 'Databricks';
    default:
      return type;
  }
}
