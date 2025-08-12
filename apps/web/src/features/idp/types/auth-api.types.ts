export type Role = 'admin' | 'editor' | 'viewer';

/**
 * Access token response
 */
export interface AccessTokenResponse {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Token introspection response - matches Payload from IdP Protocol
 */
export interface TokenPayload {
  userId: string;
  projectId: string;
  email?: string;
  fullName?: string;
  avatar?: string;
  roles?: Role[];
  projectTitle?: string;
}

/**
 * Auth error response structure
 */
export interface AuthError {
  message: string;
  code?: string;
  statusCode?: number;
}
