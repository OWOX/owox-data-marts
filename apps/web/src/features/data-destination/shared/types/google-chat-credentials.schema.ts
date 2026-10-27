import { z } from 'zod';

// Webhook delivery sends through the Destination's Credential, so it holds nothing here.
const googleChatWebhookCredentialsSchema = z.object({
  deliveryMethod: z.literal('webhook'),
});

const googleChatEmailCredentialsSchema = z.object({
  deliveryMethod: z.literal('email'),
  to: z.array(z.string().email()).min(1, 'Enter at least one Google Chat channel email'),
});

export const googleChatCredentialsSchema = z.union([
  googleChatWebhookCredentialsSchema,
  googleChatEmailCredentialsSchema,
]);
