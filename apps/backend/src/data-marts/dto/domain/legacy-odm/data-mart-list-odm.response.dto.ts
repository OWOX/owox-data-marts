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
}, z.date().nullable());

export const DataMartListOdmResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: LegacyOdmDateSchema,
  modifiedAt: LegacyOdmDateSchema,
});

export type DataMartListOdmResponseDto = z.infer<typeof DataMartListOdmResponseSchema>;
