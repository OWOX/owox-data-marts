/**
 * Identity information extracted from credentials for display purposes.
 * Mirrors the backend CredentialIdentity type.
 */
export interface CredentialIdentity {
  email?: string;
  name?: string;
  picture?: string;
  clientEmail?: string;
  username?: string;
  accessKeyId?: string;
}
