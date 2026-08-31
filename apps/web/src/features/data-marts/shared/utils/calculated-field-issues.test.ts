import { describe, expect, it } from 'vitest';
import { describeMissingReferences, resolveCalculatedFieldIssues } from './calculated-field-issues';

describe('describeMissingReferences', () => {
  it('says nothing when nothing is missing', () => {
    expect(describeMissingReferences([])).toBeUndefined();
  });

  // "gone from the Data Mart" stopped being true: the backend's verdict is transitive,
  // so a name here can be a calculated field that is present and merely uncomputable.
  it('names one missing field in the singular', () => {
    expect(describeMissingReferences(['clicks'])).toBe(
      'This calculated field reads `clicks`, which is missing from the Data Mart, or broken.'
    );
  });

  it('names several in the plural', () => {
    expect(describeMissingReferences(['clicks', 'impressions'])).toBe(
      'This calculated field reads `clicks`, `impressions`, which are missing from the Data Mart, or broken.'
    );
  });
});

describe('resolveCalculatedFieldIssues', () => {
  const broken = [{ field: 'ctr', missing: ['clicks'] }];
  const withFormula = (name: string, formula: string) => ({ name, calculated: { formula } });

  it('keeps a metric whose formula is still the one the backend judged', () => {
    const saved = [withFormula('ctr', 'SUM({{ref field="clicks"}})')];
    const resolved = resolveCalculatedFieldIssues(broken, saved, saved);

    expect([...resolved]).toEqual([['ctr', ['clicks']]]);
  });

  it('drops the verdict once the analyst edits that formula', () => {
    const resolved = resolveCalculatedFieldIssues(
      broken,
      [withFormula('ctr', 'SUM({{ref field="clicks"}})')],
      [withFormula('ctr', 'SUM({{ref field="taps"}})')]
    );

    expect(resolved.size).toBe(0);
  });

  it('says nothing about a metric that is not saved yet', () => {
    const resolved = resolveCalculatedFieldIssues(
      broken,
      [],
      [withFormula('ctr', 'SUM({{ref field="clicks"}})')]
    );

    expect(resolved.size).toBe(0);
  });

  it('says nothing about a metric the analyst removed from the live schema', () => {
    const resolved = resolveCalculatedFieldIssues(
      broken,
      [withFormula('ctr', 'SUM({{ref field="clicks"}})')],
      []
    );

    expect(resolved.size).toBe(0);
  });

  it('is empty when the payload carries no verdict at all (older response)', () => {
    const saved = [withFormula('ctr', 'SUM({{ref field="clicks"}})')];

    expect(resolveCalculatedFieldIssues(undefined, saved, saved).size).toBe(0);
  });

  it('ignores an ordinary field that happens to share the metric name', () => {
    const resolved = resolveCalculatedFieldIssues(broken, [{ name: 'ctr' }], [{ name: 'ctr' }]);

    expect(resolved.size).toBe(0);
  });
});
