export type CredentialSetupStatus = 'pending' | 'completed' | 'cancelled' | 'expired';

export interface StartCredentialSetupInput {
  definitionId?: string;
  credentialId?: string;
  title?: string;
}

/** This request contains only metadata that links browser setup to its result. It never contains provider secrets. */
export interface CredentialSetupDto {
  id: string;
  mode: 'create' | 'update';
  status: CredentialSetupStatus;
  definitionId: string | null;
  credentialId: string | null;
  title: string | null;
  createdAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
}
