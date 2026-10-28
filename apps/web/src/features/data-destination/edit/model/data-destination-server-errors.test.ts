import { describe, expect, it } from 'vitest';
import { DataDestinationType } from '../../shared';
import {
  extractDestinationFieldErrors,
  toDataDestinationFormField,
} from './data-destination-server-errors';

describe('toDataDestinationFormField', () => {
  it.each([DataDestinationType.GOOGLE_SHEETS, DataDestinationType.GOOGLE_CHAT])(
    'maps a refused Credential to the Credential field (%s)',
    type => {
      expect(toDataDestinationFormField(type, 'reusableCredentialId')).toBe('reusableCredentialId');
    }
  );

  it.each(['config.folderId', 'config.folderUrl'])(
    'maps the Google Sheets folder (%s) to the folder URL input',
    field => {
      expect(toDataDestinationFormField(DataDestinationType.GOOGLE_SHEETS, field)).toBe(
        'config.folderUrl'
      );
    }
  );

  it('maps a refused list entry to the list input', () => {
    expect(toDataDestinationFormField(DataDestinationType.EMAIL, 'credentials.to.2')).toBe(
      'credentials.to'
    );
  });

  it('maps a value the form holds under the same path', () => {
    expect(
      toDataDestinationFormField(DataDestinationType.LOOKER_STUDIO, 'credentials.deploymentUrl')
    ).toBe('credentials.deploymentUrl');
  });

  it.each(['credentials.type', 'credentials', 'title', ''])(
    'returns null for %j, which no input holds',
    field => {
      expect(toDataDestinationFormField(DataDestinationType.GOOGLE_SHEETS, field)).toBeNull();
    }
  );
});

describe('extractDestinationFieldErrors', () => {
  it('puts a Drive folder the service account cannot use under the folder input', () => {
    const error = {
      response: {
        status: 400,
        data: { code: 'DESTINATION_FOLDER_ACCESS', message: 'Not in a Shared Drive.' },
      },
    };

    expect(extractDestinationFieldErrors(error)).toEqual([
      { field: 'config.folderUrl', message: 'Not in a Shared Drive.' },
    ]);
  });

  it('passes the per-input list through', () => {
    const fieldErrors = [{ field: 'credentials.to.0', message: 'Invalid email' }];
    const error = { response: { status: 400, data: { errorDetails: { fieldErrors } } } };

    expect(extractDestinationFieldErrors(error)).toEqual(fieldErrors);
  });

  it.each([
    [403, 'You cannot use this Credential.'],
    [400, 'This Credential is disabled.'],
    [400, 'This Credential cannot be used with this Destination type.'],
  ])('puts a refused Credential (%i %s) under the Credential field', (status, message) => {
    const error = { response: { status, data: { statusCode: status, message } } };

    expect(extractDestinationFieldErrors(error)).toEqual([
      { field: 'reusableCredentialId', message },
    ]);
  });

  it('names nothing for any other failure', () => {
    expect(extractDestinationFieldErrors(new Error('Network Error'))).toEqual([]);
  });
});
