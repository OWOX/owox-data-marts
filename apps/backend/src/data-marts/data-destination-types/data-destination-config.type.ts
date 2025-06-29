import { GoogleSheetsConfigSchema } from './google-sheets/schemas/google-sheets-config.schema';
import { z } from 'zod';

export const DataDestinationConfigSchema = z.discriminatedUnion('type', [GoogleSheetsConfigSchema]);

export type DataDestinationConfig = z.infer<typeof DataDestinationConfigSchema>;
