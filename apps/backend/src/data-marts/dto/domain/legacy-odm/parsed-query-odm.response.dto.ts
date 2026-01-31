import { z } from 'zod';

export const ParsedQueryOdmResponseSchema = z.object({
  parsedQuery: z.string().nullable(),
});

export type ParsedQueryOdmResponseDto = z.infer<typeof ParsedQueryOdmResponseSchema>;
