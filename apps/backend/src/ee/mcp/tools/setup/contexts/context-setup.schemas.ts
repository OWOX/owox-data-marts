import { z } from 'zod-v4';

export const contextResourceSchema = z
  .object({
    id: z.string(),
    type: z.enum(['DATA_MART', 'STORAGE', 'DESTINATION', 'CREDENTIAL']),
    title: z.string().nullable(),
    contextIds: z.array(z.string()),
    canSetContexts: z.boolean(),
    revision: z.number().int().nonnegative(),
    revisionAggregate: z.literal('project_context_configuration'),
  })
  .strict();

export const contextMemberSchema = z
  .object({
    userId: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    role: z.string(),
    administration: z
      .object({
        roleScope: z.enum(['entire_project', 'selected_contexts']),
        contextIds: z.array(z.string()),
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const contextIdInput = z.object({ contextId: z.string().trim().min(1).max(255) }).strict();
export const memberQueryInput = z
  .object({
    query: z.string().trim().min(1).max(255).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const resourceQueryInput = memberQueryInput
  .extend({
    contextId: z.string().trim().min(1).max(255).optional(),
    type: z.enum(['DATA_MART', 'STORAGE', 'DESTINATION', 'CREDENTIAL']).optional(),
  })
  .strict();
