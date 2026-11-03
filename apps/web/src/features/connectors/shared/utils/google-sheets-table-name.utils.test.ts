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

  it('transliterates a Cyrillic name', () => {
    expect(suggestGoogleSheetsTableName('Лист1')).toBe('lyst1');
    expect(suggestGoogleSheetsTableName('План')).toBe('plan');
  });

  it('falls back to google_sheets when nothing usable is left', () => {
    expect(suggestGoogleSheetsTableName('***')).toBe('google_sheets');
    expect(suggestGoogleSheetsTableName(undefined)).toBe('google_sheets');
  });

  it('transliterates Ukrainian and Russian Cyrillic', () => {
    expect(suggestGoogleSheetsTableName('Дата Софт поточні витрати')).toBe(
      'data_soft_potochni_vytraty'
    );
    expect(suggestGoogleSheetsTableName('Йогурт')).toBe('iohurt');
    expect(suggestGoogleSheetsTableName('Щоденний звіт')).toBe('shchodennyi_zvit');
    expect(suggestGoogleSheetsTableName('Объём')).toBe('obem');
  });

  it('transliterates a decomposed Cyrillic name as its composed form', () => {
    expect(suggestGoogleSheetsTableName('Йогурт'.normalize('NFD'))).toBe('iohurt');
    expect(suggestGoogleSheetsTableName('Їжа'.normalize('NFD'))).toBe('izha');
  });

  it('drops an apostrophe only inside a Cyrillic word', () => {
    expect(suggestGoogleSheetsTableName("п'ять")).toBe('piat');
    expect(suggestGoogleSheetsTableName('м’ясо')).toBe('miaso');
    expect(suggestGoogleSheetsTableName("O'Brien Plan")).toBe('o_brien_plan');
    expect(suggestGoogleSheetsTableName("'План'")).toBe('plan');
  });

  it('joins the document and the sheet', () => {
    expect(suggestGoogleSheetsTableName('Plan', 'Дата Софт поточні витрати')).toBe(
      'data_soft_potochni_vytraty_plan'
    );
    expect(suggestGoogleSheetsTableName('Plan', '2026 Budget')).toBe('sheet_2026_budget_plan');
    expect(suggestGoogleSheetsTableName('***', 'Budget')).toBe('budget');
    expect(suggestGoogleSheetsTableName('Plan', '')).toBe('plan');
  });

  it('caps the name at 100 characters, cutting the document first', () => {
    const name = suggestGoogleSheetsTableName('Plan', 'Д'.repeat(120));
    expect(name).toHaveLength(100);
    expect(name.endsWith('_plan')).toBe(true);
    expect(suggestGoogleSheetsTableName('a'.repeat(99) + ' b', 'Doc')).toBe('a'.repeat(99));
    expect(suggestGoogleSheetsTableName('x'.repeat(120))).toHaveLength(100);
  });
});
