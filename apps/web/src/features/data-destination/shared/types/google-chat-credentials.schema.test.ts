import { describe, expect, it } from 'vitest';
import { googleChatCredentialsSchema } from './google-chat-credentials.schema';

describe('googleChatCredentialsSchema', () => {
  it('keeps webhook delivery free of a webhook URL', () => {
    expect(
      googleChatCredentialsSchema.parse({
        deliveryMethod: 'webhook',
        webhookUrl: 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=k&token=t',
      })
    ).toEqual({ deliveryMethod: 'webhook' });
  });

  it('accepts channel email delivery', () => {
    expect(
      googleChatCredentialsSchema.parse({
        deliveryMethod: 'email',
        to: ['space@example.com'],
      })
    ).toEqual({ deliveryMethod: 'email', to: ['space@example.com'] });
  });

  it('rejects email delivery without recipients', () => {
    expect(googleChatCredentialsSchema.safeParse({ deliveryMethod: 'email', to: [] }).success).toBe(
      false
    );
  });
});
