import { z } from 'zod-v4';

export const PROJECT_DESCRIPTION_MAX_LENGTH = 10_000;
export const projectDescriptionSchema = z
  .string()
  .max(PROJECT_DESCRIPTION_MAX_LENGTH)
  .refine(value => value.trim().length > 0, 'Description must not be blank')
  .nullable();
export const projectDescriptionRevisionSchema = z.number().int().nonnegative();
export const projectDescriptionUpdateSchema = z
  .object({
    description: projectDescriptionSchema,
    expectedRevision: projectDescriptionRevisionSchema,
  })
  .strict();
