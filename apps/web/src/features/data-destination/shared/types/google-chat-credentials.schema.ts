import { z } from 'zod';

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

const googleChatWebhookCredentialsSchema = z
  .object({
    deliveryMethod: z.literal('webhook'),
    webhookUrl: z.string().trim().optional(),
    configured: z.boolean().optional(),
  })
  .superRefine((credentials, context) => {
    if (credentials.webhookUrl && isGoogleChatWebhookUrl(credentials.webhookUrl)) return;
    if (credentials.configured && !credentials.webhookUrl) return;

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['webhookUrl'],
      message: 'Enter a valid Google Chat incoming webhook URL',
    });
  });

const googleChatEmailCredentialsSchema = z.object({
  deliveryMethod: z.literal('email'),
  to: z.array(z.string().email()).min(1, 'Enter at least one Google Chat channel email'),
});

export const googleChatCredentialsSchema = z.union([
  googleChatWebhookCredentialsSchema,
  googleChatEmailCredentialsSchema,
]);
