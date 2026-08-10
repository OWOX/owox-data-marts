import { z } from 'zod';

export const GoogleChatCredentialsType = 'google-chat-credentials';

const GOOGLE_CHAT_WEBHOOK_PATH = /^\/v1\/spaces\/[^/]+\/messages$/;

export function isGoogleChatWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'chat.googleapis.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      GOOGLE_CHAT_WEBHOOK_PATH.test(url.pathname) &&
      Boolean(url.searchParams.get('key')) &&
      Boolean(url.searchParams.get('token'))
    );
  } catch {
    return false;
  }
}

export const GoogleChatCredentialsSchema = z.object({
  type: z.literal(GoogleChatCredentialsType),
  webhookUrl: z
    .string()
    .trim()
    .refine(isGoogleChatWebhookUrl, 'A valid Google Chat incoming webhook URL is required'),
});

export type GoogleChatCredentials = z.infer<typeof GoogleChatCredentialsSchema>;
