import {
  resolveFieldGovernance,
  supportedAggregationsForType,
} from './field-aggregation-governance';

describe('resolveFieldGovernance — default allowed aggregations (no explicit overrides)', () => {
  // Defaults = the subset ON by default (2026-06-29 meeting, point 3).
  it('number → metric with [SUM, AVG, MIN, MAX]', () => {
    expect(resolveFieldGovernance('INTEGER')).toEqual({
      role: 'metric',
      allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
    });
  });

  it('treats FLOAT/NUMERIC as number metrics', () => {
    expect(resolveFieldGovernance('NUMERIC').role).toBe('metric');
    expect(resolveFieldGovernance('FLOAT').allowedAggregations).toEqual([
      'SUM',
      'AVG',
      'MIN',
      'MAX',
    ]);
  });

  it('date/time → dimension with [MIN, MAX]', () => {
    expect(resolveFieldGovernance('DATE')).toEqual({
      role: 'dimension',
      allowedAggregations: ['MIN', 'MAX'],
    });
    expect(resolveFieldGovernance('TIMESTAMP').allowedAggregations).toEqual(['MIN', 'MAX']);
    expect(resolveFieldGovernance('TIME').allowedAggregations).toEqual(['MIN', 'MAX']);
  });

  it('string → dimension with [COUNT, COUNT_DISTINCT]', () => {
    expect(resolveFieldGovernance('STRING')).toEqual({
      role: 'dimension',
      allowedAggregations: ['COUNT', 'COUNT_DISTINCT'],
    });
  });

  it('boolean / unknown → dimension with [COUNT, COUNT_DISTINCT]', () => {
    expect(resolveFieldGovernance('BOOLEAN').allowedAggregations).toEqual([
      'COUNT',
      'COUNT_DISTINCT',
    ]);
    expect(resolveFieldGovernance('GEOGRAPHY').allowedAggregations).toEqual([
      'COUNT',
      'COUNT_DISTINCT',
    ]);
  });

  it('no type defaults to a percentile or plain COUNT for non-numeric, nor SUM/AVG for non-numeric', () => {
    for (const type of ['STRING', 'DATE', 'BOOLEAN']) {
      const allowed = resolveFieldGovernance(type).allowedAggregations;
      expect(allowed).not.toContain('P50');
      expect(allowed).not.toContain('SUM');
      expect(allowed).not.toContain('AVG');
    }
    // Numeric default has no plain COUNT / COUNT_DISTINCT / percentiles.
    const num = resolveFieldGovernance('INTEGER').allowedAggregations;
    expect(num).not.toContain('COUNT');
    expect(num).not.toContain('COUNT_DISTINCT');
    expect(num).not.toContain('P50');
  });

  it('ANY_VALUE is never a default for any category (supported but off by default)', () => {
    for (const type of ['INTEGER', 'STRING', 'DATE', 'BOOLEAN', 'JSON']) {
      expect(resolveFieldGovernance(type).allowedAggregations).not.toContain('ANY_VALUE');
    }
  });
});

describe('supportedAggregationsForType — the full menu a field type permits (point 2)', () => {
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

  it('date/time supports MIN/MAX/ANY_VALUE/COUNT/COUNT_DISTINCT/STRING_AGG (no SUM/AVG/percentiles)', () => {
    const expected = ['MIN', 'MAX', 'ANY_VALUE', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'];
    expect(supportedAggregationsForType('DATE')).toEqual(expected);
    expect(supportedAggregationsForType('TIMESTAMP')).toEqual(expected);
    expect(supportedAggregationsForType('TIME')).toEqual(expected);
    for (const t of ['DATE', 'STRING']) {
      expect(supportedAggregationsForType(t)).not.toContain('P50');
      expect(supportedAggregationsForType(t)).not.toContain('SUM');
    }
  });

  it('string supports MIN/MAX/ANY_VALUE/COUNT/COUNT_DISTINCT/STRING_AGG', () => {
    expect(supportedAggregationsForType('STRING')).toEqual([
      'MIN',
      'MAX',
      'ANY_VALUE',
      'COUNT',
      'COUNT_DISTINCT',
      'STRING_AGG',
    ]);
  });

  it('boolean / unknown support COUNT/COUNT_DISTINCT/ANY_VALUE', () => {
    expect(supportedAggregationsForType('BOOLEAN')).toEqual([
      'COUNT',
      'COUNT_DISTINCT',
      'ANY_VALUE',
    ]);
    expect(supportedAggregationsForType('GEOGRAPHY')).toEqual([
      'COUNT',
      'COUNT_DISTINCT',
      'ANY_VALUE',
    ]);
  });

  it('every default is a subset of the supported set (invariant)', () => {
    for (const type of [
      'INTEGER',
      'FLOAT',
      'STRING',
      'DATE',
      'TIMESTAMP',
      'TIME',
      'BOOLEAN',
      'JSON',
    ]) {
      const supported = new Set(supportedAggregationsForType(type));
      for (const fn of resolveFieldGovernance(type).allowedAggregations) {
        expect(supported.has(fn)).toBe(true);
      }
    }
  });
});

describe('resolveFieldGovernance — explicit overrides', () => {
  it('explicit role wins over type-derived role', () => {
    expect(resolveFieldGovernance('INTEGER', { aggregationRole: 'dimension' }).role).toBe(
      'dimension'
    );
    expect(resolveFieldGovernance('STRING', { aggregationRole: 'metric' }).role).toBe('metric');
  });

  it('explicit allowedAggregations list wins over defaults', () => {
    expect(
      resolveFieldGovernance('INTEGER', { allowedAggregations: ['SUM'] }).allowedAggregations
    ).toEqual(['SUM']);
  });

  it('explicit empty allowedAggregations array means no functions allowed', () => {
    expect(
      resolveFieldGovernance('INTEGER', { allowedAggregations: [] }).allowedAggregations
    ).toEqual([]);
  });

  it('role override and allowed override are independent (only one set)', () => {
    const onlyRole = resolveFieldGovernance('STRING', { aggregationRole: 'metric' });
    expect(onlyRole.role).toBe('metric');
    expect(onlyRole.allowedAggregations).toEqual(['COUNT', 'COUNT_DISTINCT']);

    const onlyAllowed = resolveFieldGovernance('STRING', { allowedAggregations: ['COUNT'] });
    expect(onlyAllowed.role).toBe('dimension');
    expect(onlyAllowed.allowedAggregations).toEqual(['COUNT']);
  });

  // An override may only NARROW within the type's supported set — it can never authorize a
  // function the type cannot run (else a STRING_AGG/percentile on a NUMERIC column reaches
  // the renderer and the warehouse rejects the SQL).
  it('intersects an override with the type supported set — STRING_AGG on a numeric field is dropped', () => {
    expect(
      resolveFieldGovernance('INTEGER', { allowedAggregations: ['STRING_AGG'] }).allowedAggregations
    ).toEqual([]);
    expect(
      resolveFieldGovernance('NUMERIC', { allowedAggregations: ['SUM', 'P50', 'STRING_AGG'] })
        .allowedAggregations
    ).toEqual(['SUM', 'P50']);
  });

  it('drops a SUM/AVG override on a non-numeric field', () => {
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
