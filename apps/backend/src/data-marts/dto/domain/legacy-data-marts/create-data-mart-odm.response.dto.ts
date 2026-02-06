import { z } from 'zod';

export const CreateDataMartOdmResponseSchema = z.object({
  id: z.string(),
});

export type CreateDataMartOdmResponseDto = z.infer<typeof CreateDataMartOdmResponseSchema>;
