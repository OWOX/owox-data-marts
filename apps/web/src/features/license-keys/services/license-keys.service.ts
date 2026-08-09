import type {
  CreateLicenseKeyRequest,
  CreateLicenseKeyResponse,
  LicenseKey,
  UpdateLicenseKeyRequest,
} from '../types';

import { ApiService } from '../../../services';

class LicenseKeysService extends ApiService {
  constructor() {
    super('/license-keys');
  }

  async getKeys(): Promise<LicenseKey[]> {
    return this.get<LicenseKey[]>('');
  }

  async createKey(payload: CreateLicenseKeyRequest): Promise<CreateLicenseKeyResponse> {
    return this.post<CreateLicenseKeyResponse>('', payload);
  }

  async updateKey(licenseKeyId: string, payload: UpdateLicenseKeyRequest): Promise<LicenseKey> {
    return this.patch<LicenseKey>(`/${licenseKeyId}`, payload);
  }

  async revokeKey(licenseKeyId: string): Promise<void> {
    return this.delete(`/${licenseKeyId}`);
  }
}

export const licenseKeysService = new LicenseKeysService();
