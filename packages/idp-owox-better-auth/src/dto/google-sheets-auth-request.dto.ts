import { z } from 'zod';

export const GoogleSheetsExtensionAuthRequestSchema = z
  .object({
    google_id_token: z.string().min(1).optional(),
    refresh_token: z.string().min(1).optional(),
    project_id: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
  })
  .refine(data => data.google_id_token || data.refresh_token, {
    message: 'Either google_id_token or refresh_token is required',
  });

export type GoogleSheetsExtensionAuthRequest = z.infer<
  typeof GoogleSheetsExtensionAuthRequestSchema
>;
