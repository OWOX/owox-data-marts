export enum DataStorageType {
  GOOGLE_BIGQUERY = 'GOOGLE_BIGQUERY',
  AWS_ATHENA = 'AWS_ATHENA',
  SNOWFLAKE = 'SNOWFLAKE',
  AWS_REDSHIFT = 'AWS_REDSHIFT',
  DATABRICKS = 'DATABRICKS',
  LEGACY_GOOGLE_BIGQUERY = 'LEGACY_GOOGLE_BIGQUERY',
  DUCKDB = 'DUCKDB',
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
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return 'Legacy Google BigQuery';
    case DataStorageType.DUCKDB:
      return 'DuckDB';
    default:
      return type;
  }
}

/** A DuckDB storage is a local file with no credential row; every other storage needs one. */
export function usesStoredCredentials(type: DataStorageType): boolean {
  return type !== DataStorageType.DUCKDB;
}

/**
 * Whether `INTEGER / INTEGER` truncates on this storage instead of promoting to a float — measured
 * per dialect. A truncating storage rounds a ratio per row, so recomputing it from group totals
 * moves the number: rows (5,2) and (1,3) show 2 and 0 while `SUM(a)/SUM(b)` is 1.
 *
 * Exhaustive rather than a set, so a new storage cannot be added without stating an answer: the
 * branches differ by a wrong number rather than by an error.
 */
const INTEGER_DIVISION_TRUNCATES: Record<DataStorageType, boolean> = {
  [DataStorageType.GOOGLE_BIGQUERY]: false,
  [DataStorageType.LEGACY_GOOGLE_BIGQUERY]: false,
  [DataStorageType.SNOWFLAKE]: false,
  [DataStorageType.DATABRICKS]: false,
  [DataStorageType.AWS_ATHENA]: true,
  [DataStorageType.AWS_REDSHIFT]: true,
  [DataStorageType.DUCKDB]: false,
};

/** An unclassified or absent storage answers "truncates": the unsafe side is the silent one. */
export function integerDivisionTruncates(type: DataStorageType | undefined): boolean {
  if (type === undefined) return true;
  return INTEGER_DIVISION_TRUNCATES[type] ?? true;
}
