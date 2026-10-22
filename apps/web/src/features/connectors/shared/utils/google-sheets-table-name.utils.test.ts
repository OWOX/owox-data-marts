import { describe, expect, it } from 'vitest';
import { suggestGoogleSheetsTableName } from './google-sheets-table-name.utils';

describe('suggestGoogleSheetsTableName', () => {
  it('turns the sheet name into a snake_case identifier', () => {
    expect(suggestGoogleSheetsTableName('Product Engineering')).toBe('product_engineering');
    expect(suggestGoogleSheetsTableName('  Q4 Targets (draft) ')).toBe('q4_targets_draft');
  });

  it('strips diacritics and collapses separators', () => {
    expect(suggestGoogleSheetsTableName('Plán – Výroba / 2026')).toBe('plan_vyroba_2026');
    expect(suggestGoogleSheetsTableName('Straße Łódź')).toBe('strasse_lodz');
    expect(suggestGoogleSheetsTableName('Plan ð 1 ı')).toBe('plan_d_1_i');
  });

  it('keeps the identifier valid when the sheet name starts with a digit', () => {
    expect(suggestGoogleSheetsTableName('2026 Plan')).toBe('sheet_2026_plan');
  });

  it('keeps only the digits of a non-Latin name', () => {
    expect(suggestGoogleSheetsTableName('Лист1')).toBe('sheet_1');
  });

  it('falls back to google_sheets when nothing usable is left', () => {
    expect(suggestGoogleSheetsTableName('План')).toBe('google_sheets');
    expect(suggestGoogleSheetsTableName('***')).toBe('google_sheets');
    expect(suggestGoogleSheetsTableName(undefined)).toBe('google_sheets');
  });
});
