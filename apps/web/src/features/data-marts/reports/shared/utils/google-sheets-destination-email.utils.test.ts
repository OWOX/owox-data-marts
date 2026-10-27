import { describe, expect, it } from 'vitest';
import { DataDestinationType, type DataDestination } from '../../../../data-destination';
import { getGoogleSheetsDestinationEmail } from './google-sheets-destination-email.utils';

const destination = (
  type: DataDestinationType,
  reusableCredential: DataDestination['reusableCredential']
) => ({ id: 'd1', type, credentials: {}, reusableCredential }) as DataDestination;

describe('getGoogleSheetsDestinationEmail', () => {
  it('names the identity of a Credential the member can see', () => {
    expect(
      getGoogleSheetsDestinationEmail(
        destination(DataDestinationType.GOOGLE_SHEETS, {
          access: 'visible',
          id: 'c1',
          title: 'Docs writer',
          definitionId: 'google-service-account',
          providerName: 'Google Service Account',
          identity: 'docs@acme.iam.gserviceaccount.com',
          state: 'ready',
        })
      )
    ).toBe('docs@acme.iam.gserviceaccount.com');
  });

  it('names the address of a Credential the member cannot see', () => {
    expect(
      getGoogleSheetsDestinationEmail(
        destination(DataDestinationType.GOOGLE_SHEETS, {
          access: 'restricted',
          state: 'ready',
          identity: 'docs@acme.iam.gserviceaccount.com',
        })
      )
    ).toBe('docs@acme.iam.gserviceaccount.com');
  });

  it('names the address of a Destination still on its own key', () => {
    expect(
      getGoogleSheetsDestinationEmail(
        destination(DataDestinationType.GOOGLE_SHEETS, {
          access: 'pending',
          state: 'ready',
          identity: 'ann@example.com',
        })
      )
    ).toBe('ann@example.com');
  });

  it('names nothing for a Google Chat Destination', () => {
    expect(
      getGoogleSheetsDestinationEmail(
        destination(DataDestinationType.GOOGLE_CHAT, {
          access: 'restricted',
          state: 'ready',
          identity: 'space@example.com',
        })
      )
    ).toBeUndefined();
  });
});
