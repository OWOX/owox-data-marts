import { RoleEnum } from '@owox/idp-protocol';
import { z } from 'zod';

const ApiKeyIdSchema = z.string().regex(/^pmk_[A-Za-z0-9_-]{22}$/);

export const ProjectMemberApiKeyAuthFlowRequestSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  role: RoleEnum.nullable(),
  readOnly: z.boolean(),
  apiKeyId: ApiKeyIdSchema,
});

export type ProjectMemberApiKeyAuthFlowRequest = z.infer<
  typeof ProjectMemberApiKeyAuthFlowRequestSchema
>;
