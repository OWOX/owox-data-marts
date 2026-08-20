import { z } from 'zod';

const ProjectIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);

export const ExtensionAuthRequestSchema = z.union([
  z
    .object({
      assertion_type: z.literal('ms_entra_access_token'),
      assertion: z.string().min(1),
      project_id: ProjectIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      refresh_token: z.string().min(1),
    })
    .strict(),
]);

export type ExtensionAuthRequest = z.infer<typeof ExtensionAuthRequestSchema>;

export const ExtensionRevokeRequestSchema = z.object({ refresh_token: z.string().min(1) }).strict();

export type ExtensionRevokeRequest = z.infer<typeof ExtensionRevokeRequestSchema>;
