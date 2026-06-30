import { describe, it, expect } from 'vitest';
import {
  resolveFieldGovernance,
  resolveColumnAllowedAggregations,
  supportedAggregationsForType,
} from './aggregation-governance';

describe('resolveFieldGovernance — type-derived defaults (on-by-default subset)', () => {
  it('number types are metrics with [SUM, AVG, MIN, MAX]', () => {
    for (const t of ['INTEGER', 'INT', 'BIGINT', 'FLOAT', 'NUMERIC', 'DECIMAL', 'DOUBLE']) {
      const { role, allowedAggregations } = resolveFieldGovernance(t);
      expect(role).toBe('metric');
      expect(allowedAggregations).toEqual(['SUM', 'AVG', 'MIN', 'MAX']);
    }
  });

  it('string types are dimensions with [COUNT, COUNT_DISTINCT]', () => {
    for (const t of ['STRING', 'VARCHAR', 'TEXT', 'CHAR', 'BPCHAR']) {
      const { role, allowedAggregations } = resolveFieldGovernance(t);
      expect(role).toBe('dimension');
      expect(allowedAggregations).toEqual(['COUNT', 'COUNT_DISTINCT']);
    }
  });

  it('date/timestamp types are dimensions with [MIN, MAX]', () => {
    for (const t of ['DATE', 'DATETIME', 'TIMESTAMP', 'TIMESTAMP_NTZ', 'TIMESTAMPTZ']) {
      const { role, allowedAggregations } = resolveFieldGovernance(t);
      expect(role).toBe('dimension');
      expect(allowedAggregations).toEqual(['MIN', 'MAX']);
    }
  });

  it('time-of-day types are dimensions with [MIN, MAX]', () => {
    for (const t of ['TIME', 'TIME WITH TIME ZONE', 'TIMETZ']) {
      const { role, allowedAggregations } = resolveFieldGovernance(t);
      expect(role).toBe('dimension');
      expect(allowedAggregations).toEqual(['MIN', 'MAX']);
    }
  });

  it('boolean types are dimensions with COUNT/COUNT_DISTINCT only', () => {
    for (const t of ['BOOLEAN', 'BOOL']) {
      const { role, allowedAggregations } = resolveFieldGovernance(t);
      expect(role).toBe('dimension');
      expect(allowedAggregations).toEqual(['COUNT', 'COUNT_DISTINCT']);
    }
  });

  it('unknown/complex types fall back to dimension with COUNT only (no COUNT_DISTINCT)', () => {
    // Non-groupable types: COUNT_DISTINCT fails at run time / is rejected by the backend
    // validator, so it is not offered — only COUNT.
    for (const t of ['ARRAY', 'STRUCT', 'JSON', 'GEOGRAPHY']) {
      const { role, allowedAggregations } = resolveFieldGovernance(t);
      expect(role).toBe('dimension');
      expect(allowedAggregations).toEqual(['COUNT']);
    }
  });
});

describe('resolveFieldGovernance — explicit overrides win', () => {
  it('an explicit role overrides the type-derived default', () => {
    const { role } = resolveFieldGovernance('INTEGER', { aggregationRole: 'dimension' });
    expect(role).toBe('dimension');
  });

  it('an explicit allowedAggregations list overrides the type-derived default', () => {
    const { allowedAggregations } = resolveFieldGovernance('INTEGER', {
      allowedAggregations: ['SUM'],
    });
    expect(allowedAggregations).toEqual(['SUM']);
  });

  it('an explicit EMPTY allowedAggregations array is an override (field cannot be aggregated)', () => {
    const { allowedAggregations } = resolveFieldGovernance('INTEGER', {
      allowedAggregations: [],
    });
    expect(allowedAggregations).toEqual([]);
  });

  it('returns a fresh array — callers cannot mutate the shared default', () => {
    const a = resolveFieldGovernance('INTEGER').allowedAggregations;
    a.push('STRING_AGG');
    const b = resolveFieldGovernance('INTEGER').allowedAggregations;
    expect(b).not.toContain('STRING_AGG');
  });

  // An override may only NARROW within the type's supported set — it can never authorize a
  // function the type cannot run, mirroring the backend governance resolver.
  it('intersects an override with the type supported set — STRING_AGG on a numeric field is dropped', () => {
    expect(
      resolveFieldGovernance('INTEGER', { allowedAggregations: ['STRING_AGG'] }).allowedAggregations
    ).toEqual([]);
    expect(
      resolveFieldGovernance('NUMERIC', { allowedAggregations: ['SUM', 'P50', 'STRING_AGG'] })
        .allowedAggregations
    ).toEqual(['SUM', 'P50']);
  });

  it('drops a SUM override on a non-numeric field', () => {
    expect(
      resolveFieldGovernance('STRING', { allowedAggregations: ['SUM', 'COUNT'] })
        .allowedAggregations
    ).toEqual(['COUNT']);
  });

  it('keeps an explicit empty override as "none allowed"', () => {
    expect(
      resolveFieldGovernance('INTEGER', { allowedAggregations: [] }).allowedAggregations
    ).toEqual([]);
  });
});

describe('resolveColumnAllowedAggregations', () => {
  it('native field (no postJoinAggregations) uses type-derived defaults', () => {
    const result = resolveColumnAllowedAggregations({ type: 'INTEGER' });
    expect(result).toEqual(['SUM', 'AVG', 'MIN', 'MAX']);
  });

  it('native field with explicit allowedAggregations uses the override (not postJoinAggregations)', () => {
    const result = resolveColumnAllowedAggregations({
      type: 'INTEGER',
      allowedAggregations: ['SUM', 'AVG'],
    });
    expect(result).toEqual(['SUM', 'AVG']);
  });

  it('joined field with postJoinAggregations uses postJoinAggregations, ignoring type defaults', () => {
    // STRING default is COUNT/COUNT_DISTINCT — but postJoinAggregations restricts to COUNT only
    const result = resolveColumnAllowedAggregations({
      type: 'STRING',
      postJoinAggregations: ['COUNT'],
    });
    expect(result).toEqual(['COUNT']);
  });

  it('joined field with postJoinAggregations restricts INTEGER field to COUNT only', () => {
    // INTEGER default is SUM/AVG/MIN/MAX — postJoinAggregations overrides this
    const result = resolveColumnAllowedAggregations({
      type: 'INTEGER',
      postJoinAggregations: ['COUNT'],
    });
    expect(result).toEqual(['COUNT']);
  });

  it('joined field with empty postJoinAggregations yields empty allowed set', () => {
    const result = resolveColumnAllowedAggregations({ type: 'INTEGER', postJoinAggregations: [] });
    expect(result).toEqual([]);
  });

  it('joined field with postJoinAggregations ignores explicit allowedAggregations', () => {
    // postJoinAggregations takes precedence over type-level allowedAggregations for joined fields
    const result = resolveColumnAllowedAggregations({
      type: 'INTEGER',
      allowedAggregations: ['SUM', 'AVG'],
      postJoinAggregations: ['COUNT'],
    });
    expect(result).toEqual(['COUNT']);
  });

  it('returns a fresh array for postJoinAggregations — callers cannot mutate the input', () => {
    const a = resolveColumnAllowedAggregations({
      type: 'STRING',
      postJoinAggregations: ['COUNT'],
    });
    a.push('STRING_AGG');
    const b = resolveColumnAllowedAggregations({
      type: 'STRING',
      postJoinAggregations: ['COUNT'],
    });
    expect(b).not.toContain('STRING_AGG');
    expect(b).toEqual(['COUNT']);
  });
});

describe('supportedAggregationsForType — the full menu a field type permits', () => {
  it('number supports SUM/AVG/MIN/MAX/ANY_VALUE + percentiles (no COUNT/COUNT_DISTINCT/STRING_AGG)', () => {
    expect(supportedAggregationsForType('INTEGER')).toEqual([
      'SUM',
      'AVG',
      'MIN',
      'MAX',
      'ANY_VALUE',
      'P25',
      'P50',
      'P75',
      'P95',
    ]);
  });

  it('date and string support MIN/MAX/ANY_VALUE/COUNT/COUNT_DISTINCT/STRING_AGG (no SUM/percentiles)', () => {
    const expected = ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'];
    expect(supportedAggregationsForType('DATE')).toEqual(expected);
    expect(supportedAggregationsForType('STRING')).toEqual(expected);
    for (const t of ['DATE', 'STRING']) {
      expect(supportedAggregationsForType(t)).not.toContain('P50');
      expect(supportedAggregationsForType(t)).not.toContain('SUM');
    }
  });

  it('boolean supports COUNT/COUNT_DISTINCT/ANY_VALUE', () => {
    expect(supportedAggregationsForType('BOOLEAN')).toEqual([
      'COUNT',
      'COUNT_DISTINCT',
      'ANY_VALUE',
    ]);
  });

  // `other` (non-groupable) excludes COUNT_DISTINCT — only COUNT/ANY_VALUE.
  it('unknown / other supports COUNT/ANY_VALUE only', () => {
    expect(supportedAggregationsForType('JSON')).toEqual(['COUNT', 'ANY_VALUE']);
  });

  it('every default is a subset of the supported set', () => {
    for (const t of ['INTEGER', 'STRING', 'DATE', 'TIME', 'BOOLEAN', 'JSON']) {
      const supported = new Set(supportedAggregationsForType(t));
      for (const fn of resolveFieldGovernance(t).allowedAggregations) {
        expect(supported.has(fn)).toBe(true);
      }
    }
  });
});
