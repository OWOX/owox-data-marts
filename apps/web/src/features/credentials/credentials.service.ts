import { ApiService } from '../../services';
import type {
  CreateCredentialRequest,
  Credential,
  CredentialDefinition,
  GoogleOAuthExchangeRequest,
  UpdateCredentialRequest,
} from './types';

class CredentialsService extends ApiService {
  constructor() {
    super('/credentials');
  }

  list(): Promise<Credential[]> {
    return this.get<Credential[]>('');
  }

  listDefinitions(): Promise<CredentialDefinition[]> {
    return this.get<CredentialDefinition[]>('/definitions');
  }

  addGithubDefinition(repository: string): Promise<CredentialDefinition> {
    return this.post<CredentialDefinition>('/definitions/github', { repository });
  }

  create(input: CreateCredentialRequest): Promise<Credential> {
    return this.post<Credential>('', input);
  }

  update(id: string, input: UpdateCredentialRequest): Promise<Credential> {
    return this.put<Credential>(`/${id}`, input);
  }

  validate(id: string): Promise<Credential> {
    return this.post<Credential>(`/${id}/validate`);
  }

  consentDefinition(id: string): Promise<Credential> {
    return this.post<Credential>(`/${id}/definition-consent`);
  }

  getGoogleOAuthSettings(): Promise<{ available: boolean }> {
    return this.get<{ available: boolean }>('/oauth/google/settings');
  }

  authorizeGoogleOAuth(body: {
    redirectUri: string;
    credentialId?: string;
    definitionId?: string;
  }): Promise<{ authorizationUrl: string }> {
    return this.post<{ authorizationUrl: string }>('/oauth/google/authorize', body);
  }

  exchangeGoogleOAuth(body: GoogleOAuthExchangeRequest): Promise<Credential> {
    return this.post<Credential>('/oauth/google/exchange', body);
  }

  remove(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }
}

export const credentialsService = new CredentialsService();
