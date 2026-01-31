import { z } from 'zod';

export const TitleRequestSchema = z.object({
  title: z.string(),
});

export type TitleRequestDto = z.infer<typeof TitleRequestSchema>;
