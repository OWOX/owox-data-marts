/**
 * The roles that are supported by the IDP.
 */
export type Role = 'admin' | 'editor' | 'viewer';

/**
 * Standardized token payload that all IDP implementations must return when introspecting their native tokens.
 */
export interface Payload {
  userId: string;
  projectId: string;

  email?: string;
  fullName?: string;
  roles?: Role[];

  projectTitle?: string;
}

/**
 * Authentication result from IDP callback
 */
export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
}
