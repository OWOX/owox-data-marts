import {
  GoogleChatCredentialsSchema,
  isGoogleChatWebhookUrl,
} from './google-chat-credentials.schema';

describe('GoogleChatCredentialsSchema', () => {
  const validUrl = 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1';

  it('accepts a Google Chat incoming webhook URL', () => {
    expect(
      GoogleChatCredentialsSchema.parse({
        type: 'google-chat-credentials',
        webhookUrl: validUrl,
      })
    ).toEqual({
      type: 'google-chat-credentials',
      webhookUrl: validUrl,
    });
  });

  it.each([
    'http://chat.googleapis.com/v1/spaces/space-1/messages?key=key&token=token',
    'https://example.com/v1/spaces/space-1/messages?key=key&token=token',
    'https://chat.googleapis.com:444/v1/spaces/space-1/messages?key=key&token=token',
    'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key',
    'https://chat.googleapis.com/v1/users/user-1/messages?key=key&token=token',
    'not-a-url',
  ])('rejects an unsafe or malformed URL: %s', webhookUrl => {
    expect(isGoogleChatWebhookUrl(webhookUrl)).toBe(false);
  });
});
