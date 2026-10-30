/**
 * Request DTO for initiating OAuth flow
 */
export interface OAuthInitiateRequestDto {
  dataMartId?: string;
  configItemId?: string;
}

/** The Credential an OAuth exchange creates, or with `id` reconnects. */
export interface OAuthExchangeCredentialTarget {
  id?: string;
  title?: string;
  contextIds?: string[];
  ownerIds?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
}

/**
 * Request DTO for OAuth callback
 */
export interface OAuthCallbackRequestDto {
  payload: Record<string, unknown>;
}
