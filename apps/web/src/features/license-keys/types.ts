import type { UserProjection } from '../../shared/types';

export interface LicenseKey {
  licenseKeyId: string;
  name: string;
  origin: string;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
  createdByUser: UserProjection | null;
}

export interface CreateLicenseKeyRequest {
  name: string;
  origin: string;
}

export interface CreateLicenseKeyResponse extends LicenseKey {
  licenseKey: string;
}

export interface UpdateLicenseKeyRequest {
  name: string;
}
