import type { AxiosRequestConfig } from 'axios';
import { ApiService } from '../../services';
import type { CredentialSetup } from './types';

// The setup page shows errors beside the form or the retry button.
const requestConfig = { skipErrorToast: true } as AxiosRequestConfig;

class CredentialSetupService extends ApiService {
  constructor() {
    super('/credential-setup');
  }

  getById(id: string): Promise<CredentialSetup> {
    return this.get(`/${id}`, undefined, requestConfig);
  }

  complete(id: string, credentialId: string): Promise<CredentialSetup> {
    return this.post(`/${id}/complete`, { credentialId }, requestConfig);
  }

  cancel(id: string): Promise<CredentialSetup> {
    return this.post(`/${id}/cancel`, {}, requestConfig);
  }
}

export const credentialSetupService = new CredentialSetupService();
