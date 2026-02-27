/**
 * Identity information extracted from credentials for display purposes.
 * Stored as JSON in the `identity` column of credential tables.
 *
 * For OAuth: Google user info (email, name, picture)
 * For Service Account: client_email from the SA key
 * For Snowflake: username
 * For AWS IAM: accessKeyId
 * For others: null
 */
export interface CredentialIdentity {
  email?: string;
  name?: string;
  picture?: string;
  clientEmail?: string;
  username?: string;
  accessKeyId?: string;
}
