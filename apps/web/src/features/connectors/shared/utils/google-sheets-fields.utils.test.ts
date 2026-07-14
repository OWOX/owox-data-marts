import { describe, expect, it } from 'vitest';
import { SECRET_MASK } from '../../../../shared/constants/secrets';
import {
  getAvailableGoogleSheetsSelectedFields,
  hasValidGoogleSheetsServiceAccountConfiguration,
  isValidGoogleSheetsServiceAccountKey,
  reconcileGoogleSheetsPreviewSelection,
  resolveGoogleSheetsPreviewSelection,
  shouldImportAllGoogleSheetsColumns,
  withGoogleSheetsImportAllColumns,
} from './google-sheets-fields.utils';

const availableFields = ['_owox_row_number', '_owox_imported_at', 'Campaign', 'Spend'];

describe('Google Sheets field configuration', () => {
  it('keeps only currently available fields in the active schema', () => {
    expect(
      getAvailableGoogleSheetsSelectedFields(
        ['_owox_row_number', 'Campaign', 'TemporarilyMissing'],
        availableFields
      )
    ).toEqual(['_owox_row_number', 'Campaign']);
  });

  it('resolves the live selection without a deleted configured column', () => {
    expect(
      resolveGoogleSheetsPreviewSelection(
        {
          ImportAllColumns: false,
          SelectedColumns: '_owox_row_number,Campaign,TemporarilyMissing',
        },
        ['_owox_row_number', 'Campaign', 'TemporarilyMissing'],
        availableFields,
        availableFields
      )
    ).toEqual(['_owox_row_number', 'Campaign']);
  });

  it('sets ImportAllColumns when every user column is selected', () => {
    expect(
      withGoogleSheetsImportAllColumns(
        { SpreadsheetId: 'sheet-id' },
        ['_owox_row_number', 'Campaign', 'Spend'],
        availableFields
      )
    ).toEqual({
      SpreadsheetId: 'sheet-id',
      ImportAllColumns: true,
      SelectedColumns: '_owox_row_number,Campaign,Spend',
    });
  });

  it('clears ImportAllColumns for a user-column subset', () => {
    expect(shouldImportAllGoogleSheetsColumns(['Campaign'], availableFields)).toBe(false);
  });

  it('does not require either technical field for ImportAllColumns', () => {
    expect(shouldImportAllGoogleSheetsColumns(['Campaign', 'Spend'], availableFields)).toBe(true);
  });

  it('keeps an empty intersection empty when prior fields disappeared', () => {
    expect(
      reconcileGoogleSheetsPreviewSelection(['Old Column'], availableFields, availableFields)
    ).toEqual([]);
  });

  it('uses preview defaults only when there was no prior selection', () => {
    expect(reconcileGoogleSheetsPreviewSelection([], availableFields, availableFields)).toEqual(
      availableFields
    );
  });

  it('selects newly available user fields while preserving all-columns mode', () => {
    expect(
      reconcileGoogleSheetsPreviewSelection(
        ['_owox_row_number', 'Campaign'],
        availableFields,
        ['_owox_row_number', 'Campaign', 'Spend'],
        true
      )
    ).toEqual(['_owox_row_number', 'Campaign', 'Spend']);
  });

  it('auto-selects the imported-at technical field when it is a preview default', () => {
    expect(
      reconcileGoogleSheetsPreviewSelection(
        ['_owox_row_number', 'Campaign'],
        availableFields,
        availableFields,
        true
      )
    ).toContain('_owox_imported_at');
  });

  it('keeps explicit subset mode when an excluded current column disappears', () => {
    expect(
      withGoogleSheetsImportAllColumns(
        {
          ImportAllColumns: false,
          SelectedColumns: '_owox_row_number,Campaign',
        },
        ['_owox_row_number', 'Campaign'],
        ['_owox_row_number', '_owox_imported_at', 'Campaign']
      )
    ).toEqual({
      ImportAllColumns: false,
      SelectedColumns: '_owox_row_number,Campaign',
    });
  });

  it('retains temporarily unavailable requested fields on a no-op subset save', () => {
    expect(
      withGoogleSheetsImportAllColumns(
        {
          ImportAllColumns: false,
          SelectedColumns: '_owox_row_number,Campaign,TemporarilyMissing',
        },
        ['_owox_row_number', 'Campaign'],
        ['_owox_row_number', '_owox_imported_at', 'Campaign']
      )
    ).toEqual({
      ImportAllColumns: false,
      SelectedColumns: '_owox_row_number,Campaign,TemporarilyMissing',
    });
  });

  it('enables all-columns mode when the user explicitly selects every available column', () => {
    expect(
      withGoogleSheetsImportAllColumns(
        {
          ImportAllColumns: false,
          SelectedColumns: '_owox_row_number,Campaign',
        },
        ['_owox_row_number', 'Campaign', 'Spend'],
        availableFields
      )
    ).toMatchObject({ ImportAllColumns: true });
  });
});

describe('Google Sheets service-account validation', () => {
  it('accepts a service-account key with required credentials', () => {
    expect(
      isValidGoogleSheetsServiceAccountKey(
        JSON.stringify({ client_email: 'reader@example.test', private_key: 'private-key' })
      )
    ).toBe(true);
  });

  it('rejects malformed or incomplete JSON', () => {
    expect(isValidGoogleSheetsServiceAccountKey('{')).toBe(false);
    expect(
      isValidGoogleSheetsServiceAccountKey(JSON.stringify({ client_email: 'reader@test' }))
    ).toBe(false);
  });

  it('accepts a masked saved key and leaves OAuth configurations unaffected', () => {
    expect(isValidGoogleSheetsServiceAccountKey(SECRET_MASK)).toBe(true);
    expect(
      hasValidGoogleSheetsServiceAccountConfiguration({
        AuthType: { oauth: { _source_credential_id: 'credential-id' } },
      })
    ).toBe(true);
  });

  it('rejects an invalid selected service-account configuration', () => {
    expect(
      hasValidGoogleSheetsServiceAccountConfiguration({
        AuthType: { service_account: { ServiceAccountKey: '{}' } },
      })
    ).toBe(false);
  });
});
