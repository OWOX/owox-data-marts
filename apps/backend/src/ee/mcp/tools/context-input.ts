import { z } from 'zod-v4';
export const contextIdsSchema = z
  .array(z.string().trim().min(1))
  .max(100)
  .optional()
  .transform(ids => (ids?.length ? [...new Set(ids)] : undefined))
  .describe(
    'Optional context IDs from list_contexts in the connected project. Match any selected context. Omit or pass [] for no filter; existing resource access controls always apply.'
  );
export const makeContextSummariesSchema = () =>
  z.array(z.object({ id: z.string(), name: z.string() }));
