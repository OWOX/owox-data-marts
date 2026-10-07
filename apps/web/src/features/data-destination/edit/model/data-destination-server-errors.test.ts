import { describe, expect, it } from 'vitest';
import { DataDestinationType } from '../../shared';
import {
  extractDestinationFieldErrors,
  toDataDestinationFormField,
} from './data-destination-server-errors';

describe('toDataDestinationFormField', () => {
  it('maps any key of the Google Sheets key file to the Service Account textarea', () => {
    expect(
      toDataDestinationFormField(
        DataDestinationType.GOOGLE_SHEETS,
        'credentials.serviceAccountKey.private_key'
      )
    ).toBe('credentials.serviceAccount');
  });

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
      toDataDestinationFormField(DataDestinationType.GOOGLE_CHAT, 'credentials.webhookUrl')
    ).toBe('credentials.webhookUrl');
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

  it('names nothing for any other failure', () => {
    expect(extractDestinationFieldErrors(new Error('Network Error'))).toEqual([]);
  });
});
