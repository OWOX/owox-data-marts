import { z } from 'zod';

export const ParsedQueryOdmResponseSchema = z.object({
  parsedQuery: z.string().nullable(),
  error: z
    .object({
      reason: z.string(),
      message: z.string(),
      variableName: z.string().nullable(),
      attributes: z.array(z.string()).nullable(),
      params: z.array(z.string()).nullable(),
    })
    .nullable(),
});

export type ParsedQueryOdmResponseDto = z.infer<typeof ParsedQueryOdmResponseSchema>;
