import { z } from 'zod';

export const CreateDataMartOdmRequestSchema = z.object({
  title: z.string(),
  gcpProjectId: z.string(),
  query: z.string(),
});

export type CreateDataMartOdmRequestDto = z.infer<typeof CreateDataMartOdmRequestSchema>;
