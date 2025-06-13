export enum DataStorageType {
  GOOGLE_BIGQUERY = 'GOOGLE_BIGQUERY',
  AWS_ATHENA = 'AWS_ATHENA',
}

export function toHumanReadable(type: DataStorageType): string {
  switch (type) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return 'Google BigQuery';
    case DataStorageType.AWS_ATHENA:
      return 'AWS Athena';
    default:
      return type;
  }
}
