import { z } from 'zod';
import { DataDestinationType } from '../enums';
import { googleServiceAccountSchema } from '../../../../shared';

// Base schema for all data destinations
const baseDataDestinationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.nativeEnum(DataDestinationType),
});

// Using the shared schema for Google Service Account credentials
const googleSheetsDestinationSchema = baseDataDestinationSchema.extend({
  type: z.literal(DataDestinationType.GOOGLE_SHEETS),
  credentials: googleServiceAccountSchema,
});

// Combined schema with conditional validation based on type
export const dataDestinationSchema = z.discriminatedUnion('type', [googleSheetsDestinationSchema]);

// Type for the form data
export type DataDestinationFormData = z.infer<typeof dataDestinationSchema>;
export type GoogleSheetsDestinationFormData = z.infer<typeof googleSheetsDestinationSchema>;
