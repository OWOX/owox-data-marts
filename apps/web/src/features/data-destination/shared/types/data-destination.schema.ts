import { z } from 'zod';
import { DataDestinationType } from '../enums';
import { lookerStudioCredentialsSchema } from './looker-studio-credentials.schema.ts';
import { emailCredentialsSchema } from './email-credentials.schema.ts';
import { isValidGoogleDriveFolderUrl } from '../utils/drive-folder-url.utils.ts';
import { googleChatCredentialsSchema } from './google-chat-credentials.schema.ts';

// Base schema for all data destinations
const baseDataDestinationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.nativeEnum(DataDestinationType),
});

const SELECT_CREDENTIAL = 'Select a Credential';

// The key is a Credential (Google Service Account or Sheets Google account) the form selects.
const googleSheetsDestinationSchema = baseDataDestinationSchema.extend({
  type: z.literal(DataDestinationType.GOOGLE_SHEETS),
  credentials: z.object({}).optional(),
  // Required, checked below together with Google Chat webhook delivery.
  reusableCredentialId: z.string().optional(),
  // Optional destination-level config: Drive folder (by URL) for auto-created Sheets.
  config: z
    .object({
      folderId: z.string().optional(),
      folderUrl: z.string().optional(),
    })
    .refine(c => !c.folderUrl?.trim() || isValidGoogleDriveFolderUrl(c.folderUrl), {
      message: 'Enter a valid Google Drive folder URL',
      path: ['folderUrl'],
    })
    .optional(),
});

// Using the shared schema for Looker Studio credentials
const lookerStudioDestinationSchema = baseDataDestinationSchema.extend({
  type: z.literal(DataDestinationType.LOOKER_STUDIO),
  credentials: lookerStudioCredentialsSchema.optional(),
});

// Excel carries no credentials; the add-in resolves the destination and there is nothing
// type-specific to fill in. Only the shared fields apply.
const excelDestinationSchema = baseDataDestinationSchema.extend({
  type: z.literal(DataDestinationType.EXCEL),
  // Always empty, but declared so the field stays present across the union — every mapper
  // and the form itself read `credentials` off the shared form-data type.
  credentials: z.object({}).optional(),
});

// schema for email based destinations
const emailLikeBase = baseDataDestinationSchema.extend({
  credentials: emailCredentialsSchema.optional(),
});

const emailDestinationSchema = emailLikeBase.extend({
  type: z.literal(DataDestinationType.EMAIL),
});

const slackDestinationSchema = emailLikeBase.extend({
  type: z.literal(DataDestinationType.SLACK),
});

const msTeamsDestinationSchema = emailLikeBase.extend({
  type: z.literal(DataDestinationType.MS_TEAMS),
});

const googleChatDestinationSchema = baseDataDestinationSchema.extend({
  type: z.literal(DataDestinationType.GOOGLE_CHAT),
  credentials: googleChatCredentialsSchema,
  // Required for webhook delivery only, checked below: a union member cannot refine itself.
  reusableCredentialId: z.string().optional(),
});

// Combined schema with conditional validation based on type
export const dataDestinationSchema = z
  .discriminatedUnion('type', [
    googleSheetsDestinationSchema,
    lookerStudioDestinationSchema,
    excelDestinationSchema,
    emailDestinationSchema,
    slackDestinationSchema,
    msTeamsDestinationSchema,
    googleChatDestinationSchema,
  ])
  .superRefine((data, context) => {
    const usesCredential =
      data.type === DataDestinationType.GOOGLE_SHEETS ||
      (data.type === DataDestinationType.GOOGLE_CHAT &&
        data.credentials.deliveryMethod === 'webhook');
    if (usesCredential && !data.reusableCredentialId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reusableCredentialId'],
        message: SELECT_CREDENTIAL,
      });
    }
  });

// Type for the form data
export type DataDestinationFormData = z.infer<typeof dataDestinationSchema>;
export type GoogleSheetsDestinationFormData = z.infer<typeof googleSheetsDestinationSchema>;
export type LookerStudioDestinationFormData = z.infer<typeof lookerStudioDestinationSchema>;
