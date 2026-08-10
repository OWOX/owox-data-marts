import { describe, expect, it } from 'vitest';
import { googleChatCredentialsSchema } from './google-chat-credentials.schema';

describe('googleChatCredentialsSchema', () => {
  const webhookUrl =
    'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1';

  it('accepts a new incoming webhook', () => {
    expect(googleChatCredentialsSchema.parse({ deliveryMethod: 'webhook', webhookUrl })).toEqual({
      deliveryMethod: 'webhook',
      webhookUrl,
    });
  });

  it('accepts a hidden existing webhook', () => {
    expect(
      googleChatCredentialsSchema.parse({ deliveryMethod: 'webhook', configured: true })
    ).toEqual({ deliveryMethod: 'webhook', configured: true });
  });

  it('accepts channel email delivery', () => {
    expect(
      googleChatCredentialsSchema.parse({
        deliveryMethod: 'email',
        to: ['space@example.com'],
      })
    ).toEqual({ deliveryMethod: 'email', to: ['space@example.com'] });
  });

  it('rejects incomplete credentials for the selected delivery method', () => {
    expect(
      googleChatCredentialsSchema.safeParse({
        deliveryMethod: 'webhook',
        webhookUrl: 'https://example.com/webhook',
      }).success
    ).toBe(false);
    expect(googleChatCredentialsSchema.safeParse({ deliveryMethod: 'email', to: [] }).success).toBe(
      false
    );
  });
});
