import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  mapMcpFiltersToRules,
  mapMcpAggregations,
  mapMcpDateBuckets,
  queryDataMartInputSchema,
  SUPPORTED_MCP_OPERATORS,
  UNSUPPORTED_MCP_OPERATORS,
} from './query-data-mart.input';

describe('SUPPORTED_MCP_OPERATORS', () => {
  it('excludes all 4 unsupported operators', () => {
    for (const op of UNSUPPORTED_MCP_OPERATORS) {
      expect(SUPPORTED_MCP_OPERATORS).not.toContain(op);
    }
  });

  it('includes representative supported operators', () => {
    expect(SUPPORTED_MCP_OPERATORS).toContain('eq');
    expect(SUPPORTED_MCP_OPERATORS).toContain('between');
    expect(SUPPORTED_MCP_OPERATORS).toContain('this_month');
  });
});

describe('mapMcpFiltersToRules', () => {
  it('maps slices to pre-join and filters to post-join, mapping operators', () => {
    const rules = mapMcpFiltersToRules(
      [{ field: 'date', operator: 'in_last_n_days', value: 7 }],
      [{ field: 'channel', operator: 'eq', value: 'fb' }]
    );
    expect(rules).toEqual([
      {
        column: 'date',
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 7 },
        placement: 'pre-join',
      },
      { column: 'channel', operator: 'eq', value: 'fb', placement: 'post-join' },
    ]);
  });

  it('maps before/after to lt/gt', () => {
    const rules = mapMcpFiltersToRules(
      [{ field: 'd', operator: 'before', value: '2026-01-01' }],
      []
    );
    expect(rules![0]).toMatchObject({
      column: 'd',
      operator: 'lt',
      value: '2026-01-01',
      placement: 'pre-join',
    });
  });

  it('rejects unsupported operators', () => {
    expect(() => mapMcpFiltersToRules([], [{ field: 'c', operator: 'this_week' }])).toThrow(
      /unsupported_operator/
    );
  });

  it('rejects in_last_n_days with NaN value', () => {
    expect(() =>
      mapMcpFiltersToRules([{ field: 'd', operator: 'in_last_n_days', value: 'abc' }], [])
    ).toThrow(/positive integer/);
  });

  it('rejects in_last_n_days with zero or negative value', () => {
    expect(() =>
      mapMcpFiltersToRules([{ field: 'd', operator: 'in_last_n_days', value: 0 }], [])
    ).toThrow(/positive integer/);
    expect(() =>
      mapMcpFiltersToRules([{ field: 'd', operator: 'in_last_n_days', value: -5 }], [])
    ).toThrow(/positive integer/);
  });

  it('accepts in_last_n_days with a positive integer', () => {
    const rules = mapMcpFiltersToRules([{ field: 'd', operator: 'in_last_n_days', value: 30 }], []);
    expect(rules![0]).toMatchObject({
      operator: 'relative_date',
      value: { kind: 'last_n_days', n: 30 },
    });
  });

  it('rejects between with a non-object value', () => {
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'amount', operator: 'between', value: '10,20' }])
    ).toThrow(/from.*to/i);
  });

  it('rejects between with an object missing from or to', () => {
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'amount', operator: 'between', value: { from: 10 } }])
    ).toThrow(/from.*to/i);
  });

  it('accepts between with a valid {from, to} object', () => {
    const rules = mapMcpFiltersToRules(
      [],
      [{ field: 'amount', operator: 'between', value: { from: 10, to: 20 } }]
    );
    expect(rules![0]).toMatchObject({ operator: 'between', value: { from: 10, to: 20 } });
  });
});

describe('mapMcpAggregations', () => {
  it('maps aggregations and validates the function', () => {
    expect(mapMcpAggregations([{ field: 'sessionId', function: 'COUNT_DISTINCT' }])).toEqual([
      { column: 'sessionId', function: 'COUNT_DISTINCT' },
    ]);
  });

  it('rejects an unknown function', () => {
    expect(() => mapMcpAggregations([{ field: 'x', function: 'BOGUS' }])).toThrow();
  });
});

describe('mapMcpDateBuckets', () => {
  it('maps a single bucket with no time_zone', () => {
    expect(mapMcpDateBuckets([{ field: 'order_date', unit: 'MONTH' }])).toEqual([
      { column: 'order_date', unit: 'MONTH' },
    ]);
  });

  it('passes time_zone through as timeZone', () => {
    expect(
      mapMcpDateBuckets([{ field: 'order_date', unit: 'WEEK', time_zone: 'America/New_York' }])
    ).toEqual([{ column: 'order_date', unit: 'WEEK', timeZone: 'America/New_York' }]);
  });

  it('maps multiple buckets preserving order', () => {
    const result = mapMcpDateBuckets([
      { field: 'order_date', unit: 'MONTH' },
      { field: 'ship_date', unit: 'QUARTER', time_zone: 'UTC' },
    ]);
    expect(result).toEqual([
      { column: 'order_date', unit: 'MONTH' },
      { column: 'ship_date', unit: 'QUARTER', timeZone: 'UTC' },
    ]);
  });

  it('returns null for an empty array', () => {
    expect(mapMcpDateBuckets([])).toBeNull();
  });

  it('returns null when called with no argument', () => {
    expect(mapMcpDateBuckets()).toBeNull();
  });

  it('rejects an unknown unit', () => {
    expect(() => mapMcpDateBuckets([{ field: 'order_date', unit: 'DECADE' }])).toThrow(
      /unsupported_date_bucket/
    );
  });

  it('surfaces UnsupportedDateBucketError via instanceof', () => {
    let caught: unknown;
    try {
      mapMcpDateBuckets([{ field: 'order_date', unit: 'DECADE' }]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('UnsupportedDateBucketError');
  });
});

describe('queryDataMartInputSchema enum validation', () => {
  it('rejects invalid aggregation function at schema parse', () => {
    expect(() =>
      queryDataMartInputSchema.parse({
        data_mart_id: 'dm1',
        fields: ['f1'],
        aggregations: [{ field: 'f1', function: 'MEDIAN' }],
      })
    ).toThrow();
  });

  it('rejects invalid date bucket unit at schema parse', () => {
    expect(() =>
      queryDataMartInputSchema.parse({
        data_mart_id: 'dm1',
        fields: ['f1'],
        date_buckets: [{ field: 'd', unit: 'HOUR' }],
      })
    ).toThrow();
  });

  it('accepts valid aggregation function', () => {
    const result = queryDataMartInputSchema.parse({
      data_mart_id: 'dm1',
      fields: ['f1'],
      aggregations: [{ field: 'f1', function: 'SUM' }],
    });
    expect(result.aggregations?.[0]?.function).toBe('SUM');
  });

  it('accepts valid date bucket unit', () => {
    const result = queryDataMartInputSchema.parse({
      data_mart_id: 'dm1',
      fields: ['f1'],
      date_buckets: [{ field: 'd', unit: 'MONTH' }],
    });
    expect(result.date_buckets?.[0]?.unit).toBe('MONTH');
  });
});

describe('queryDataMartInputSchema filter value typing', () => {
  it('accepts a between filter with an object {from, to} value', () => {
    const parsed = queryDataMartInputSchema.parse({
      data_mart_id: 'dm1',
      fields: ['amount'],
      filters: [{ field: 'amount', operator: 'between', value: { from: 10, to: 20 } }],
    });
    expect(parsed.filters?.[0]?.value).toEqual({ from: 10, to: 20 });
  });

  it('accepts scalar and array filter values', () => {
    const parsed = queryDataMartInputSchema.parse({
      data_mart_id: 'dm1',
      fields: ['channel'],
      slices: [{ field: 'channel', operator: 'eq', value: 'fb' }],
      filters: [{ field: 'ids', operator: 'in', value: [1, 2, 3] }],
    });
    expect(parsed.slices?.[0]?.value).toBe('fb');
    expect(parsed.filters?.[0]?.value).toEqual([1, 2, 3]);
  });
});

// Guards the OpenAI tool-verification contract. The MCP SDK's v3 path
// (server/zod-json-schema-compat.js) converts with zodToJsonSchema at strictUnions + input pipe and
// the default $refStrategy 'root'; if slices/filters ever share a schema instance again, a $ref
// reappears and OpenAI collapses `filters` to any[] ("Unclear Arguments").
describe('query_data_mart tool JSON Schema (OpenAI verification)', () => {
  const json = zodToJsonSchema(queryDataMartInputSchema, {
    strictUnions: true,
    pipeStrategy: 'input',
  }) as {
    properties: Record<string, { items: { type?: string; properties: Record<string, unknown> } }>;
  };

  const collectRefs = (node: unknown, path = ''): string[] => {
    if (!node || typeof node !== 'object') return [];
    const out: string[] = [];
    const record = node as Record<string, unknown>;
    if (typeof record.$ref === 'string') out.push(`${path} -> ${record.$ref}`);
    for (const [k, v] of Object.entries(record)) out.push(...collectRefs(v, `${path}/${k}`));
    return out;
  };

  it('emits no $ref anywhere (OpenAI does not resolve internal $ref)', () => {
    expect(collectRefs(json)).toEqual([]);
  });

  it('inlines filters.items as a concrete object with field/operator/value', () => {
    const items = json.properties.filters.items;
    expect(items.type).toBe('object');
    expect(Object.keys(items.properties)).toEqual(['field', 'operator', 'value']);
  });

  it('advertises a typed value union for slices and filters, not an empty {}', () => {
    for (const key of ['slices', 'filters']) {
      const value = json.properties[key].items.properties.value as { anyOf?: unknown[] };
      expect(value).not.toEqual({});
      expect(Array.isArray(value.anyOf)).toBe(true);
    }
  });
});
