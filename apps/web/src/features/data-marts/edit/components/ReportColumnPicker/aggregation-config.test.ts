import { describe, it, expect } from 'vitest';
import { applyAggregationDraft, bucketForColumn, timeZoneForColumn } from './aggregation-config';
import type { DateTruncRule } from '../../../shared/types/output-config';

describe('applyAggregationDraft — date-trunc time zone', () => {
  it('writes the draft timeZone into the column rule', () => {
    const next = applyAggregationDraft(
      'date',
      { functions: [], bucket: 'MONTH', timeZone: 'America/New_York' },
      [],
      []
    );
    expect(next.dateTruncConfig).toEqual([
      { column: 'date', unit: 'MONTH', timeZone: 'America/New_York' },
    ]);
  });

  it('omits timeZone when null (no conversion)', () => {
    const next = applyAggregationDraft(
      'date',
      { functions: [], bucket: 'MONTH', timeZone: null },
      [],
      []
    );
    expect(next.dateTruncConfig).toEqual([{ column: 'date', unit: 'MONTH' }]);
  });

  it('dropping the bucket also drops the rule (and its timeZone)', () => {
    const existing: DateTruncRule[] = [{ column: 'date', unit: 'MONTH', timeZone: 'UTC' }];
    const next = applyAggregationDraft(
      'date',
      { functions: ['COUNT'], bucket: null, timeZone: null },
      [],
      existing
    );
    expect(next.dateTruncConfig).toEqual([]);
  });
});

describe('timeZoneForColumn', () => {
  it('returns the column rule time zone or null', () => {
    const config: DateTruncRule[] = [{ column: 'date', unit: 'MONTH', timeZone: 'Europe/Kyiv' }];
    expect(timeZoneForColumn('date', config)).toBe('Europe/Kyiv');
    expect(timeZoneForColumn('other', config)).toBeNull();
  });

  it('returns null when the rule has no time zone', () => {
    expect(bucketForColumn('date', [{ column: 'date', unit: 'MONTH' }])).toBe('MONTH');
    expect(timeZoneForColumn('date', [{ column: 'date', unit: 'MONTH' }])).toBeNull();
  });
});
