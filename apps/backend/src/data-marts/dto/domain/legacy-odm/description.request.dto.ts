import { z } from 'zod';

export const DescriptionRequestSchema = z.object({
  description: z.string(),
});

export type DescriptionRequestDto = z.infer<typeof DescriptionRequestSchema>;
