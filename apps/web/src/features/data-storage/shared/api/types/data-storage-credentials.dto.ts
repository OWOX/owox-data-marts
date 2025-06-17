/**
 * AWS Athena credentials DTO interface
 */
export interface AwsAthenaCredentialsDto {
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Google BigQuery credentials DTO interface based on Service Account structure
 */
export interface GoogleBigQueryCredentialsDto {
  type?: string; // Typically "service_account"
  project_id?: string;
  private_key_id?: string;
  private_key?: string; // "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  client_email?: string; // service-account@project-id.iam.gserviceaccount.com
  client_id?: string;
  auth_uri?: string; // https://accounts.google.com/o/oauth2/auth
  token_uri?: string; // https://oauth2.googleapis.com/token
  auth_provider_x509_cert_url?: string; // https://www.googleapis.com/oauth2/v1/certs
  client_x509_cert_url?: string; // URL to cert for service account
  [key: string]: unknown; // Allow for additional fields we may not know about
}

/**
 * Combined type for data storage credentials
 */
export type DataStorageCredentialsDto = GoogleBigQueryCredentialsDto | AwsAthenaCredentialsDto;
