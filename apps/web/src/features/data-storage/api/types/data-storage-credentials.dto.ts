export interface DataStorageCredentialsDto {
  // Google BigQuery credentials
  serviceAccount?: string; // JSON as string for a service account

  // AWS Athena credentials
  accessKeyId?: string;
  secretAccessKey?: string;
}
