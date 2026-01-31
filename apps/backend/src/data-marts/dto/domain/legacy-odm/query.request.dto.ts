import { z } from 'zod';

export const QueryRequestSchema = z.object({
  query: z.string(),
});

export type QueryRequestDto = z.infer<typeof QueryRequestSchema>;
