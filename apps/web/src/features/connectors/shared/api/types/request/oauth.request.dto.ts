/**
 * Request DTO for initiating OAuth flow
 */
export interface OAuthInitiateRequestDto {
  dataMartId?: string;
  configItemId?: string;
}

/**
 * Request DTO for OAuth callback
 */
export interface OAuthCallbackRequestDto {
  payload: Record<string, unknown>;
}
