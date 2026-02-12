import { z } from 'zod';

const LegacyOdmDateSchema = z.preprocess(value => {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  return value;
}, z.date());

export const DataMartsDetailsOdmResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  query: z.string(),
  projectId: z.string(),
  gcpProjectId: z.string(),
  description: z.string().nullable(),
  createdAt: LegacyOdmDateSchema,
  modifiedAt: LegacyOdmDateSchema,
});

export type DataMartsDetailsOdmResponseDto = z.infer<typeof DataMartsDetailsOdmResponseSchema>;
