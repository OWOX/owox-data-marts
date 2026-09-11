import { describe, expect, it } from 'vitest';
import {
  areDynamicOptionDependenciesReady,
  getDynamicOptionsDependencyKey,
  hasDynamicOptions,
} from './dynamic-options.utils';

describe('dynamic options utils', () => {
  it('detects the DYNAMIC_OPTIONS attribute', () => {
    expect(hasDynamicOptions({ name: 'SheetName', attributes: ['DYNAMIC_OPTIONS'] })).toBe(true);
    expect(hasDynamicOptions({ name: 'SheetName', attributes: ['ADVANCED'] })).toBe(false);
    expect(hasDynamicOptions({ name: 'SheetName' })).toBe(false);
  });

  it('is ready only when every dependency carries a value', () => {
    const dependsOn = ['AuthType', 'SpreadsheetId'];

    expect(areDynamicOptionDependenciesReady({}, dependsOn)).toBe(false);
    expect(areDynamicOptionDependenciesReady({ SpreadsheetId: 'sheet-1' }, dependsOn)).toBe(false);
    expect(
      areDynamicOptionDependenciesReady(
        { AuthType: { oauth2: {} }, SpreadsheetId: 'sheet-1' },
        dependsOn
      )
    ).toBe(false);
    expect(
      areDynamicOptionDependenciesReady(
        { AuthType: { oauth2: { _source_credential_id: 'cred-1' } }, SpreadsheetId: '   ' },
        dependsOn
      )
    ).toBe(false);
    expect(
      areDynamicOptionDependenciesReady(
        { AuthType: { oauth2: { _source_credential_id: 'cred-1' } }, SpreadsheetId: 'sheet-1' },
        dependsOn
      )
    ).toBe(true);
    expect(
      areDynamicOptionDependenciesReady(
        {
          AuthType: { service_account: { ServiceAccountKey: '**********' } },
          SpreadsheetId: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
        },
        dependsOn
      )
    ).toBe(true);
  });

  it('treats a field without dependencies as always ready', () => {
    expect(areDynamicOptionDependenciesReady({}, undefined)).toBe(true);
    expect(areDynamicOptionDependenciesReady({}, [])).toBe(true);
  });

  it('changes the dependency key only when a dependency changes', () => {
    const dependsOn = ['SpreadsheetId'];
    const base = getDynamicOptionsDependencyKey({ SpreadsheetId: 'a', HeaderRow: 1 }, dependsOn);

    expect(getDynamicOptionsDependencyKey({ SpreadsheetId: 'a', HeaderRow: 5 }, dependsOn)).toBe(
      base
    );
    expect(
      getDynamicOptionsDependencyKey({ SpreadsheetId: 'b', HeaderRow: 1 }, dependsOn)
    ).not.toBe(base);
  });
});
