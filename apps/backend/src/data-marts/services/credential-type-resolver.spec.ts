import { DestinationCredentialType } from '../enums/destination-credential-type.enum';
import { resolveDestinationCredentialType } from './credential-type-resolver';

describe('resolveDestinationCredentialType', () => {
  it('stores Google Chat incoming webhooks as their own credential type', () => {
    expect(
      resolveDestinationCredentialType({
        type: 'google-chat-credentials',
        webhookUrl:
          'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1',
      })
    ).toBe(DestinationCredentialType.GOOGLE_CHAT_WEBHOOK);
  });
});
