import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import {
  checkDestinationCredentialFields,
  type DestinationCredentialFields,
} from './destination-credential-fields';

const STALE = 'This page is out of date. Reload it.';
const EMAIL = { type: 'email-credentials' as const, to: ['team@example.com'] as [string] };
const WEBHOOK = {
  type: 'google-chat-credentials',
  webhookUrl: 'https://chat.googleapis.com/v1/spaces/s/messages?key=k&token=t',
} as const;
const SERVICE_ACCOUNT = {
  type: 'google-sheets-credentials',
  serviceAccountKey: { type: 'service_account', client_email: 'sa@p.iam.gserviceaccount.com' },
} as const;

function check(type: DataDestinationType, fields: Partial<DestinationCredentialFields>) {
  return () =>
    checkDestinationCredentialFields(type, {
      sentOldCredentialFields: false,
      isPluginCall: false,
      ...fields,
    } as DestinationCredentialFields);
}

describe('checkDestinationCredentialFields', () => {
  it.each(Object.values(DataDestinationType))(
    'tells a %s request with credentialId or sourceDestinationId to reload the page',
    type => {
      expect(check(type, { sentOldCredentialFields: true })).toThrow(
        new BadRequestException(STALE)
      );
    }
  );

  it('tells a Google Sheets request with a service account key to reload the page', () => {
    expect(
      check(DataDestinationType.GOOGLE_SHEETS, { credentials: SERVICE_ACCOUNT as never })
    ).toThrow(new BadRequestException(STALE));
  });

  it('tells a Google Chat request with a webhook URL to reload the page', () => {
    expect(check(DataDestinationType.GOOGLE_CHAT, { credentials: WEBHOOK })).toThrow(
      new BadRequestException(STALE)
    );
  });

  it('treats the keyless Google Sheets credentials an older page sends as absent', () => {
    expect(
      check(DataDestinationType.GOOGLE_SHEETS, {
        credentials: { type: 'google-sheets-credentials' },
        reusableCredentialId: 'credential-1',
      })()
    ).toBeUndefined();
  });

  it('returns Google Chat email recipients to store', () => {
    expect(check(DataDestinationType.GOOGLE_CHAT, { credentials: EMAIL })()).toEqual(EMAIL);
  });

  it('refuses a plugin that sends reusableCredentialId before anything else', () => {
    expect(
      check(DataDestinationType.GOOGLE_SHEETS, {
        reusableCredentialId: 'credential-1',
        isPluginCall: true,
        sentOldCredentialFields: true,
      })
    ).toThrow(new ForbiddenException("Plugins cannot change a Destination's Credential."));
  });

  it('refuses a null reusableCredentialId', () => {
    expect(check(DataDestinationType.GOOGLE_SHEETS, { reusableCredentialId: null })).toThrow(
      new BadRequestException('reusableCredentialId cannot be null.')
    );
  });

  it('refuses reusableCredentialId sent with credentials', () => {
    expect(
      check(DataDestinationType.GOOGLE_CHAT, {
        reusableCredentialId: 'credential-1',
        credentials: EMAIL,
      })
    ).toThrow(new BadRequestException('Send reusableCredentialId without credentials.'));
  });

  it.each([
    DataDestinationType.LOOKER_STUDIO,
    DataDestinationType.EMAIL,
    DataDestinationType.EXCEL,
  ])('refuses reusableCredentialId on a %s Destination', type => {
    expect(check(type, { reusableCredentialId: 'credential-1' })).toThrow(BadRequestException);
  });

  it('refuses credentials on a type that holds none', () => {
    expect(
      check(DataDestinationType.EXCEL, { credentials: { type: 'google-sheets-credentials' } })
    ).toThrow(new BadRequestException('Microsoft Excel destinations do not use credentials'));
  });
});
