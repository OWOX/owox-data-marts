import type { AxiosRequestConfig } from 'axios';
import { ApiService } from '../../services';
import type {
  CreateCredentialRequest,
  Credential,
  CredentialDefinition,
  GoogleOAuthExchangeRequest,
  UnavailableCredential,
  UpdateCredentialRequest,
} from './types';
import { isUnavailableCredential } from './types';

class CredentialsService extends ApiService {
  constructor() {
    super('/credentials');
  }

  /** Splits the rows once, so every other consumer only ever sees available Credentials. */
  async list(): Promise<{ credentials: Credential[]; unavailable: UnavailableCredential[] }> {
    const rows = await this.get<(Credential | UnavailableCredential)[]>('');
    return {
      credentials: rows.filter((row): row is Credential => !isUnavailableCredential(row)),
      unavailable: rows.filter(isUnavailableCredential),
    };
  }

  getById(id: string): Promise<Credential> {
    return this.get<Credential>(`/${id}`);
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

  getGoogleOAuthSettings(): Promise<{
    available: boolean;
    /** Absent on an older backend. */
    clients?: { storage: boolean; destination: boolean };
  }> {
    return this.get('/oauth/google/settings');
  }

  authorizeGoogleOAuth(
    body: {
      redirectUri: string;
      credentialId?: string;
      definitionId?: string;
    },
    skipErrorToast = false
  ): Promise<{ authorizationUrl: string }> {
    return this.post<{ authorizationUrl: string }>(
      '/oauth/google/authorize',
      body,
      skipErrorToast ? ({ skipErrorToast } as AxiosRequestConfig) : undefined
    );
  }

  exchangeGoogleOAuth(
    body: GoogleOAuthExchangeRequest,
    skipErrorToast = false
  ): Promise<Credential> {
    return this.post<Credential>(
      '/oauth/google/exchange',
      body,
      skipErrorToast ? ({ skipErrorToast } as AxiosRequestConfig) : undefined
    );
  }

  remove(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }
}

export const credentialsService = new CredentialsService();
