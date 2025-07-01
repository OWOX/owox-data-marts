/**
 * Google Service Account credentials DTO interface
 * Used by both Data Storage and Data Destination modules
 */
export interface GoogleServiceAccountCredentialsDto {
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
