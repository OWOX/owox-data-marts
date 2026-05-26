import type { Role } from '@owox/idp-protocol';

export type ProjectMemberApiKeyMetadata = {
  apiKeyId: string;
  projectId: string;
  userId: string;
  name: string;
  role: Role;
  readOnly: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastAuthenticatedAt: Date | null;
  createdAt: Date;
  modifiedAt: Date;
};
