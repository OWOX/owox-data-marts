/**
 * Response DTO for OAuth initiation
 */
export interface OAuthInitiateResponseDto {
  authorizationUrl: string;
  state: string;
}

/**
 * User information from OAuth provider
 */
export interface OAuthUserInfoDto {
  id: string;
  name?: string;
  email?: string;
  picture?: string;
}

/**
 * Account information (e.g., ad account, business account)
 */
export interface OAuthAccountDto {
  id: string;
  name: string;
  type?: string;
}

/**
 * Response DTO for OAuth callback
 */
export interface OAuthCallbackResponseDto {
  success: boolean;
  credentialId: string;
  user: OAuthUserInfoDto;
  additional: Record<string, unknown>;
}

/**
 * Response DTO for OAuth status check
 */
export interface OAuthStatusResponseDto {
  valid: boolean;
  expiresAt?: string;
  user?: OAuthUserInfoDto;
  additional?: Record<string, unknown>;
}

/**
 * Response DTO for OAuth settings (UI variables)
 */
export interface OAuthSettingsResponseDto {
  vars: Record<string, unknown>;
  isEnabled: boolean;
}
