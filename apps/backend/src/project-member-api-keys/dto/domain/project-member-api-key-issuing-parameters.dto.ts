import type { Role } from '@owox/idp-protocol';

export type ProjectMemberApiKeyIssuingParameters = {
  apiKeyId: string;
  projectId: string;
  userId: string;
  role: Role | null;
  readOnly: boolean;
};
