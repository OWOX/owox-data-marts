import { ApiService } from '../../../services/api-service';

export interface OAuthSettings {
  available: boolean;
  authorizationEndpoint?: string;
  clientId?: string;
  redirectUri?: string;
  availableScopes?: string[];
}

export interface OAuthAuthorizationUrl {
  authorizationUrl: string;
  state: string;
}

export interface OAuthExchangeResult {
  credentialId: string;
  user: {
    id: string;
    email: string;
    name?: string;
    picture?: string;
  };
}

export interface OAuthStatus {
  isValid: boolean;
  credentialId?: string;
  user?: {
    email: string;
    name?: string;
    picture?: string;
  };
}

class StorageOAuthApiService extends ApiService {
  constructor() {
    super('/data-storages');
  }

  getSettings(): Promise<OAuthSettings> {
    return this.get<OAuthSettings>('/oauth/settings');
  }

  generateAuthUrl(storageId: string, redirectUri: string): Promise<OAuthAuthorizationUrl> {
    return this.post<OAuthAuthorizationUrl>(`/${storageId}/oauth/authorize`, { redirectUri });
  }

  exchangeOAuthCode(code: string, state: string): Promise<OAuthExchangeResult> {
    return this.post<OAuthExchangeResult>('/oauth/exchange', { code, state });
  }

  getOAuthStatus(storageId: string): Promise<OAuthStatus> {
    return this.get<OAuthStatus>(`/${storageId}/oauth/status`);
  }
}

class DestinationOAuthApiService extends ApiService {
  constructor() {
    super('/data-destinations');
  }

  getSettings(): Promise<OAuthSettings> {
    return this.get<OAuthSettings>('/oauth/settings');
  }

  generateAuthUrl(destinationId: string, redirectUri: string): Promise<OAuthAuthorizationUrl> {
    return this.post<OAuthAuthorizationUrl>(`/${destinationId}/oauth/authorize`, { redirectUri });
  }

  generateStandaloneAuthUrl(redirectUri: string): Promise<OAuthAuthorizationUrl> {
    return this.post<OAuthAuthorizationUrl>('/oauth/authorize', { redirectUri });
  }

  exchangeOAuthCode(code: string, state: string): Promise<OAuthExchangeResult> {
    return this.post<OAuthExchangeResult>('/oauth/exchange', { code, state });
  }

  getOAuthStatus(destinationId: string): Promise<OAuthStatus> {
    return this.get<OAuthStatus>(`/${destinationId}/oauth/status`);
  }

  getCredentialStatus(credentialId: string): Promise<OAuthStatus> {
    return this.get<OAuthStatus>(`/oauth/credential-status/${credentialId}`);
  }
}

export const storageOAuthApi = new StorageOAuthApiService();
export const destinationOAuthApi = new DestinationOAuthApiService();
