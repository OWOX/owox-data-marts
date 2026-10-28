import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { destinationCredentialRequirement } from '../../data-destination-types/destination-credential-state';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import { DEFAULT_SHEETS_SCOPES } from '../google-oauth/google-oauth-scopes';
import { planDestinationCredentialConversion } from './destination-credential-conversion-plan';

// Frozen on purpose: migration 1792700000000 writes these into stored bindings, so a change here
// must be a new migration, not an edit of this file.
// The default Sheets scopes, as a literal so a change to the default is noticed here too.
const SIGN_IN = {
  isClientConfigured: () => true,
  getScopes: () => [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'openid',
    'email',
    'profile',
  ],
};
const NO_SIGN_IN = { isClientConfigured: () => false, getScopes: () => [] };

describe('destination conversion snapshot', () => {
  it('pins the requirement a Destination binding stores', () => {
    expect(SIGN_IN.getScopes()).toEqual(DEFAULT_SHEETS_SCOPES);
    expect(destinationCredentialRequirement(DataDestinationType.GOOGLE_SHEETS, SIGN_IN)).toEqual({
      definitionIds: ['google-service-account', 'google-sheets-oauth'],
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    expect(destinationCredentialRequirement(DataDestinationType.GOOGLE_SHEETS, NO_SIGN_IN)).toEqual(
      { definitionIds: ['google-service-account', 'google-sheets-oauth'], scopes: null }
    );
    expect(destinationCredentialRequirement(DataDestinationType.GOOGLE_CHAT, SIGN_IN)).toEqual({
      definitionIds: ['google-chat-webhook'],
      scopes: [],
    });
    expect(destinationCredentialRequirement(DataDestinationType.GOOGLE_CHAT, NO_SIGN_IN)).toEqual({
      definitionIds: ['google-chat-webhook'],
      scopes: [],
    });
  });

  it('pins the definitions the old key types become', () => {
    const webhookUrl = 'https://chat.googleapis.com/v1/spaces/s/messages?key=k&token=t';
    const destination = (id: string, type: DataDestinationType, key: object, keyType: string) => ({
      id,
      projectId: 'project-1',
      title: id,
      type,
      createdAt: new Date('2026-01-01'),
      ownerIds: [],
      contextIds: [],
      key: { type: keyType, credentials: key, identity: null },
    });
    const plan = planDestinationCredentialConversion(
      [
        destination(
          'chat',
          DataDestinationType.GOOGLE_CHAT,
          { type: 'google-chat-credentials', webhookUrl },
          DestinationCredentialType.GOOGLE_CHAT_WEBHOOK
        ),
        destination(
          'key',
          DataDestinationType.GOOGLE_SHEETS,
          { type: 'google-sheets-credentials', serviceAccountKey: JSON.parse(serviceAccountKey()) },
          DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT
        ),
        destination(
          'oauth',
          DataDestinationType.GOOGLE_SHEETS,
          { access_token: 'a', refresh_token: 'r', token_type: 'Bearer' },
          DestinationCredentialType.GOOGLE_OAUTH
        ),
      ],
      { googleSignIn: { clientId: 'client-1', sheetsScopes: [] } }
    );

    expect(plan.credentials.map(({ definitionId }) => definitionId).sort()).toEqual([
      'google-chat-webhook',
      'google-service-account',
      'google-sheets-oauth',
    ]);
    expect(Object.values(DestinationCredentialType).sort()).toEqual([
      'email',
      'google_chat_webhook',
      'google_oauth',
      'google_service_account',
      'looker_studio',
    ]);
  });
});
