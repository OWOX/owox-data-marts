import { z } from 'zod';

/**
 * Configuration schema for OWOX Legacy storage.
 * Similar to BigQuery but without location requirement.
 */
export const OwoxLegacyConfigSchema = z.object({
    projectId: z.string().min(1, 'projectId is required'),
});

export type OwoxLegacyConfig = z.infer<typeof OwoxLegacyConfigSchema>;
