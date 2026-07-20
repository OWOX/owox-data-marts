import { DataDestinationCredentials } from '../../../data-destination-credentials.type';
import { GoogleChatCredentialsValidator } from './google-chat-credentials-validator';

describe('GoogleChatCredentialsValidator', () => {
  const validator = new GoogleChatCredentialsValidator();

  it('accepts direct webhook credentials', async () => {
    const result = await validator.validate({
      type: 'google-chat-credentials',
      webhookUrl: 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1',
    });

    expect(result.valid).toBe(true);
  });

  it('accepts the existing channel email delivery method', async () => {
    const result = await validator.validate({
      type: 'email-credentials',
      to: ['space@example.com'],
    });

    expect(result.valid).toBe(true);
  });

  it('rejects invalid credentials', async () => {
    const invalidCredentials = {
      type: 'email-credentials',
      to: [],
    } as unknown as DataDestinationCredentials;
    const result = await validator.validate(invalidCredentials);

    expect(result.valid).toBe(false);
  });
});
