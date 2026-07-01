import { z } from 'zod';

export const UniqueCountConfigSchema = z.boolean().nullable();

export type UniqueCountConfig = z.infer<typeof UniqueCountConfigSchema>;
