import { DataDestinationType } from './enums/data-destination-type.enum';
import {
  destinationTypesForDefinition,
  toDestinationAdapterCredentials,
} from './destination-credential-definitions';

describe('destination credential definitions', () => {
  it.each([
    ['google-service-account', [DataDestinationType.GOOGLE_SHEETS]],
    ['google-sheets-oauth', [DataDestinationType.GOOGLE_SHEETS]],
    ['google-chat-webhook', [DataDestinationType.GOOGLE_CHAT]],
    ['openai', []],
  ])('maps %s to the Destination types that accept it', (id, types) => {
    expect(destinationTypesForDefinition(id)).toEqual(types);
  });

  it('turns a service account Credential into the Google Sheets shape', () => {
    const key = { type: 'service_account', client_email: 'sa@p.iam.gserviceaccount.com' };

    expect(
      toDestinationAdapterCredentials(
        'google-service-account',
        { value: JSON.stringify(key) },
        null
      )
    ).toEqual({ type: 'google-sheets-credentials', serviceAccountKey: key });
  });

  it('turns a webhook Credential into the Google Chat shape', () => {
    const webhookUrl = 'https://chat.googleapis.com/v1/spaces/A/messages?key=k&token=t';

    expect(
      toDestinationAdapterCredentials('google-chat-webhook', { fields: { webhookUrl } }, null)
    ).toEqual({ type: 'google-chat-credentials', webhookUrl });
  });

  it('has no adapter shape for the Google account', () => {
    expect(() =>
      toDestinationAdapterCredentials('google-sheets-oauth', { value: 'x' }, null)
    ).toThrow('has no Destination adapter shape');
  });
});
