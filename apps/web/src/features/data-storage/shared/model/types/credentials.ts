export interface GoogleBigQueryCredentials {
  serviceAccount: string; // JSON string containing service account details
}

export interface AwsAthenaCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export enum SnowflakeAuthMethod {
  PASSWORD = 'PASSWORD',
  KEY_PAIR = 'KEY_PAIR',
}

export interface SnowflakePasswordCredentials {
  authMethod: SnowflakeAuthMethod.PASSWORD;
  username: string;
  password: string;
}

export interface SnowflakeKeyPairCredentials {
  authMethod: SnowflakeAuthMethod.KEY_PAIR;
  username: string;
  privateKey: string;
  privateKeyPassphrase?: string;
}

export type SnowflakeCredentials = SnowflakePasswordCredentials | SnowflakeKeyPairCredentials;

export type DataStorageCredentials = GoogleBigQueryCredentials | AwsAthenaCredentials | SnowflakeCredentials;

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

export function isSnowflakeCredentials(
  credentials: DataStorageCredentials
): credentials is SnowflakeCredentials {
  return 'authMethod' in credentials && 'username' in credentials;
}
