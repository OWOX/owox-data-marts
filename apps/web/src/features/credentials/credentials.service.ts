import { ApiService } from '../../services';
import type {
  CreateCredentialRequest,
  Credential,
  CredentialDefinition,
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

  remove(id: string): Promise<void> {
    return this.delete(`/${id}`);
  }
}

export const credentialsService = new CredentialsService();
