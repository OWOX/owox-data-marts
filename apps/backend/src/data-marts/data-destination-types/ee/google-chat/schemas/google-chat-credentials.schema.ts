import { z } from 'zod';
import { isGoogleChatWebhookUrl } from '../../../google-chat-webhook-url';

export const GoogleChatCredentialsType = 'google-chat-credentials';

export const GoogleChatCredentialsSchema = z.object({
  type: z.literal(GoogleChatCredentialsType),
  webhookUrl: z
    .string()
    .trim()
    .refine(isGoogleChatWebhookUrl, 'A valid Google Chat incoming webhook URL is required'),
});

export type GoogleChatCredentials = z.infer<typeof GoogleChatCredentialsSchema>;
