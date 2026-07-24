import { describe, expect, it } from 'vitest';
import { SECRET_MASK } from '../../../../shared/constants/secrets';
import {
  getAvailableGoogleSheetsSelectedFields,
  hasValidGoogleSheetsServiceAccountConfiguration,
  isValidGoogleSheetsServiceAccountKey,
  resolveGoogleSheetsPreviewSelection,
  shouldImportAllGoogleSheetsColumns,
  withGoogleSheetsImportAllColumns,
} from './google-sheets-fields.utils';

const availableFields = ['_owox_row_number', '_owox_imported_at', 'Campaign', 'Spend'];

describe('Google Sheets field configuration', () => {
  it('reconciles stale selections and technical fields', () => {
    expect(
      getAvailableGoogleSheetsSelectedFields(['Campaign', 'TemporarilyMissing'], availableFields)
    ).toEqual(['Campaign']);
    expect(
      resolveGoogleSheetsPreviewSelection(
        { ImportAllColumns: false },
        ['_owox_row_number', '_owox_imported_at', 'Campaign'],
        availableFields,
        availableFields
      )
    ).toEqual(['_owox_row_number', '_owox_imported_at', 'Campaign']);
    expect(
      resolveGoogleSheetsPreviewSelection(
        { ImportAllColumns: true },
        ['_owox_row_number', 'Campaign', 'Spend'],
        availableFields,
        availableFields
      )
    ).toEqual(['_owox_row_number', 'Campaign', 'Spend']);
  });

  it('persists explicit subset mode and detects an explicit select-all change', () => {
    expect(shouldImportAllGoogleSheetsColumns(['Campaign'], availableFields)).toBe(false);
    expect(shouldImportAllGoogleSheetsColumns(['Campaign', 'Spend'], availableFields)).toBe(true);
    expect(
      withGoogleSheetsImportAllColumns(
        { ImportAllColumns: false },
        ['_owox_row_number', 'Campaign'],
        ['_owox_row_number', '_owox_imported_at', 'Campaign'],
        ['_owox_row_number', 'Campaign']
      )
    ).toEqual({ ImportAllColumns: false });
    expect(
      withGoogleSheetsImportAllColumns(
        { ImportAllColumns: false },
        ['_owox_row_number', 'Campaign', 'Spend'],
        availableFields,
        ['_owox_row_number', 'Campaign']
      )
    ).toEqual({ ImportAllColumns: true });
  });
});

describe('Google Sheets service-account validation', () => {
  it('accepts complete and saved keys but rejects malformed or incomplete JSON', () => {
    expect(
      isValidGoogleSheetsServiceAccountKey(
        JSON.stringify({ client_email: 'reader@example.test', private_key: 'private-key' })
      )
    ).toBe(true);
    expect(isValidGoogleSheetsServiceAccountKey(SECRET_MASK)).toBe(true);
    expect(isValidGoogleSheetsServiceAccountKey('{')).toBe(false);
    expect(isValidGoogleSheetsServiceAccountKey('{"client_email":"reader@test"}')).toBe(false);
    expect(
      hasValidGoogleSheetsServiceAccountConfiguration({
        AuthType: { service_account: { ServiceAccountKey: '{}' } },
      })
    ).toBe(false);
  });
});
