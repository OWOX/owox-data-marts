export interface GoogleBigQueryCredentials {
  serviceAccount: string; // JSON string containing service account details
}

export interface AwsAthenaCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export type DataStorageCredentials = GoogleBigQueryCredentials | AwsAthenaCredentials;

export function isGoogleBigQueryCredentials(
  credentials: DataStorageCredentials
): credentials is GoogleBigQueryCredentials {
  return 'serviceAccount' in credentials;
}

export function isAwsAthenaCredentials(
  credentials: DataStorageCredentials
): credentials is AwsAthenaCredentials {
  return 'accessKeyId' in credentials && 'secretAccessKey' in credentials;
}
