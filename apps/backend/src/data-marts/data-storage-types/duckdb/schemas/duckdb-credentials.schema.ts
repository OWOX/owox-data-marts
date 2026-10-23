import { z } from 'zod';

// Computed by DataStorageCredentialsResolver from the storage id; never stored or returned by the API.
export const DuckDbCredentialsSchema = z.object({ databasePath: z.string() });
export type DuckDbCredentials = z.infer<typeof DuckDbCredentialsSchema>;
