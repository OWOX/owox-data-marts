export interface BaseDataStorageCredentials {
  name?: string;
}

export interface GoogleBigQueryCredentials extends BaseDataStorageCredentials {
  projectId: string;
  serviceAccount: string;
  location: string;
}

export interface AwsAthenaCredentials extends BaseDataStorageCredentials {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type DataStorageCredentials = GoogleBigQueryCredentials | AwsAthenaCredentials;

export function isGoogleBigQueryCredentials(
  credentials: DataStorageCredentials
): credentials is GoogleBigQueryCredentials {
  return 'serviceAccount' in credentials && 'projectId' in credentials && 'location' in credentials;
}

export function isAwsAthenaCredentials(
  credentials: DataStorageCredentials
): credentials is AwsAthenaCredentials {
  return 'accessKeyId' in credentials && 'secretAccessKey' in credentials;
}
