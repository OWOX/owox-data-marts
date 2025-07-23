import { User } from './models.js';

/**
 * Data Transfer Objects (DTOs) for API communication
 */

export interface SignInCredentials {
  email?: string;
  password?: string;
  provider?: 'google' | 'microsoft';
  providerToken?: string;
}

export interface CreateUserDto {
  email: string;
  password?: string;
  name?: string;
  emailVerified?: boolean;
  projectId?: string;
  roles?: string[];
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  emailVerified?: boolean;
  metadata?: Record<string, any>;
  roles?: string[];
}

export interface CreateProjectDto {
  name: string;
  metadata?: Record<string, any>;
}

export interface AuthResult {
  user: User;
  tokens: IdpTokens; // IDP-specific tokens (Better Auth, Auth0, etc.)
  isNewUser?: boolean;
}

/**
 * IDP-specific tokens interface - each provider implements this differently
 * Contains the native tokens returned by the IDP (not protocol-standardized tokens)
 */
export interface IdpTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string; // OIDC
  tokenType?: string;
  expiresIn?: number;
  [key: string]: any; // Allow provider-specific fields
}

export interface MagicLink {
  url: string;
  token: string;
  expiresAt: Date;
}
