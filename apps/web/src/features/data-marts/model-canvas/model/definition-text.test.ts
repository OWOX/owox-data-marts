import { describe, expect, it } from 'vitest';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import { extractDefinitionText } from './definition-text';

describe('extractDefinitionText', () => {
  it('returns the physical reference or SQL text per definition type', () => {
    expect(
      extractDefinitionText(DataMartDefinitionType.TABLE, {
        fullyQualifiedName: 'project.dataset.orders',
      })
    ).toBe('project.dataset.orders');
    expect(
      extractDefinitionText(DataMartDefinitionType.VIEW, {
        fullyQualifiedName: 'project.dataset.orders_view',
      })
    ).toBe('project.dataset.orders_view');
    expect(
      extractDefinitionText(DataMartDefinitionType.TABLE_PATTERN, {
        pattern: 'project.dataset.events_*',
      })
    ).toBe('project.dataset.events_*');
    expect(
      extractDefinitionText(DataMartDefinitionType.SQL, {
        sqlQuery: 'SELECT 1',
      })
    ).toBe('SELECT 1');
  });

  it('excludes connector definitions and tolerates missing data', () => {
    expect(
      extractDefinitionText(DataMartDefinitionType.CONNECTOR, {
        fullyQualifiedName: 'ignored',
      })
    ).toBeNull();
    expect(extractDefinitionText(null, { sqlQuery: 'SELECT 1' })).toBeNull();
    expect(extractDefinitionText(DataMartDefinitionType.SQL, null)).toBeNull();
    // A mismatched shape (wrong dto for the type) degrades to null, not a crash.
    expect(
      extractDefinitionText(DataMartDefinitionType.TABLE, { sqlQuery: 'SELECT 1' })
    ).toBeNull();
  });
});
