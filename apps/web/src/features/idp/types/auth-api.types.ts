import type { OnboardingAnswer, Role } from './user.types.js';

/**
 * Access token response
 */
export interface AccessTokenResponse {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Current user API response.
 *
 * This is assembled from the access token payload plus additional UI context.
 */
export interface CurrentUserResponse {
  userId: string;
  projectId: string;
  email?: string;
  fullName?: string;
  avatar?: string;
  roles?: Role[];
  projectTitle?: string;
  onboarding?: OnboardingAnswer[];
  mcpServerUrl?: string;
}

/**
 * Auth error response structure
 */
export interface AuthError {
  message: string;
  code?: string;
  statusCode?: number;
}
