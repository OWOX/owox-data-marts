import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  collectRealFieldNames,
  findUniqueCountClauseViolations,
  hasUniqueCountFieldCandidate,
  mapMcpFiltersToRules,
  mapMcpAggregations,
  mapMcpDateBuckets,
  mapMcpSort,
  queryDataMartInputSchema,
  splitUniqueCountFields,
  McpOperatorEnum,
  SUPPORTED_MCP_OPERATORS,
  UniqueCountFieldUnsupportedClauseError,
  UniqueCountSourceLimitError,
  UnmatchedUniqueCountFieldError,
} from './query-data-mart.input';
import { UNIQUE_COUNT_CONFIG_MAX_SOURCES } from '../../../data-marts/dto/schemas/unique-count-config.schema';
import type { McpUniqueCountSourceDto } from '../../../data-marts/facades/mcp-data-marts.facade';

describe('SUPPORTED_MCP_OPERATORS', () => {
  it('every advertised operator is supported', () => {
    expect(SUPPORTED_MCP_OPERATORS).toEqual(McpOperatorEnum.options);
  });

  it('includes representative supported operators', () => {
    expect(SUPPORTED_MCP_OPERATORS).toContain('eq');
    expect(SUPPORTED_MCP_OPERATORS).toContain('between');
    expect(SUPPORTED_MCP_OPERATORS).toContain('this_month');
    expect(SUPPORTED_MCP_OPERATORS).toContain('in');
    expect(SUPPORTED_MCP_OPERATORS).toContain('not_in');
    expect(SUPPORTED_MCP_OPERATORS).toContain('is_empty');
    expect(SUPPORTED_MCP_OPERATORS).toContain('is_not_empty');
    expect(SUPPORTED_MCP_OPERATORS).toContain('this_week');
    expect(SUPPORTED_MCP_OPERATORS).toContain('last_week');
    expect(SUPPORTED_MCP_OPERATORS).toContain('this_quarter');
    expect(SUPPORTED_MCP_OPERATORS).toContain('last_quarter');
    expect(SUPPORTED_MCP_OPERATORS).toContain('in_next_n_days');
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

  it('translates eq/neq with a boolean value to is_true/is_false (value dropped)', () => {
    const rules = mapMcpFiltersToRules(
      [{ field: 'active', operator: 'eq', value: false }],
      [
        { field: 'active', operator: 'eq', value: true },
        { field: 'active', operator: 'neq', value: true },
        { field: 'active', operator: 'neq', value: false },
      ]
    );
    expect(rules).toEqual([
      { column: 'active', operator: 'is_false', placement: 'pre-join' },
      { column: 'active', operator: 'is_true', placement: 'post-join' },
      { column: 'active', operator: 'is_false', placement: 'post-join' },
      { column: 'active', operator: 'is_true', placement: 'post-join' },
    ]);
  });

  it('keeps eq with the STRING "true" untranslated so type validation can flag it', () => {
    const rules = mapMcpFiltersToRules([], [{ field: 'active', operator: 'eq', value: 'true' }]);
    expect(rules![0]).toMatchObject({ column: 'active', operator: 'eq', value: 'true' });
  });

  it('maps in/not_in with an array of same-type scalars, preserving placement', () => {
    const rules = mapMcpFiltersToRules(
      [{ field: 'channel', operator: 'in', value: ['fb', 'google'] }],
      [{ field: 'amount', operator: 'not_in', value: [1, 2, 3] }]
    );
    expect(rules).toEqual([
      { column: 'channel', operator: 'in', value: ['fb', 'google'], placement: 'pre-join' },
      { column: 'amount', operator: 'not_in', value: [1, 2, 3], placement: 'post-join' },
    ]);
  });

  it('rejects mixed-type and non-finite in lists with a precise error', () => {
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'c', operator: 'in', value: ['draft', 5] }])
    ).toThrow(/same type/);
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'c', operator: 'in', value: [1, Infinity] }])
    ).toThrow(/finite numbers/);
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'c', operator: 'in', value: [Number.NaN] }])
    ).toThrow(/finite numbers/);
  });

  it('rejects boolean in-list values and steers to eq/neq true|false', () => {
    // No column category permits in/not_in on booleans; a boolean list on any other
    // column type would die only in the warehouse.
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'c', operator: 'in', value: [true, false] }])
    ).toThrow(/strings or numbers.*'eq'\/'neq'/);
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'c', operator: 'not_in', value: [true] }])
    ).toThrow(/strings or numbers/);
  });

  it('rejects between with mismatched bound types', () => {
    expect(() =>
      mapMcpFiltersToRules(
        [],
        [{ field: 'amount', operator: 'between', value: { from: '2026-01-01', to: 100 } }]
      )
    ).toThrow(/same type/);
  });

  it('rejects a relative-day count above the schema cap (3650)', () => {
    for (const operator of ['in_last_n_days', 'in_next_n_days'] as const) {
      expect(() => mapMcpFiltersToRules([], [{ field: 'd', operator, value: 9999 }])).toThrow(
        /up to 3650/
      );
    }
    const rules = mapMcpFiltersToRules(
      [],
      [{ field: 'd', operator: 'in_last_n_days', value: 3650 }]
    );
    expect(rules![0]).toMatchObject({ value: { kind: 'last_n_days', n: 3650 } });
  });

  it('rejects in with an empty array, a non-array, or non-scalar entries', () => {
    expect(() => mapMcpFiltersToRules([], [{ field: 'c', operator: 'in', value: [] }])).toThrow(
      /non-empty array/
    );
    expect(() => mapMcpFiltersToRules([], [{ field: 'c', operator: 'in', value: 'fb' }])).toThrow(
      /non-empty array/
    );
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'c', operator: 'not_in', value: [{ v: 1 }] }])
    ).toThrow(/strings or finite numbers/);
  });

  it('rejects an in list longer than the cap', () => {
    const long = Array.from({ length: 501 }, (_, i) => i);
    expect(() => mapMcpFiltersToRules([], [{ field: 'c', operator: 'in', value: long }])).toThrow(
      /too long/
    );
  });

  it('maps is_empty/is_not_empty as no-value operators', () => {
    const rules = mapMcpFiltersToRules([], [{ field: 'note', operator: 'is_empty' }]);
    expect(rules![0]).toMatchObject({ column: 'note', operator: 'is_empty' });
  });

  it('maps the calendar presets to relative_date kinds', () => {
    const rules = mapMcpFiltersToRules(
      [],
      [
        { field: 'd', operator: 'this_week' },
        { field: 'd', operator: 'last_week' },
        { field: 'd', operator: 'this_quarter' },
        { field: 'd', operator: 'last_quarter' },
      ]
    );
    expect(rules!.map(r => (r as { value: { kind: string } }).value.kind)).toEqual([
      'this_week',
      'last_week',
      'this_quarter',
      'last_quarter',
    ]);
    expect(rules!.every(r => r.operator === 'relative_date')).toBe(true);
  });

  it('maps in_next_n_days to relative_date next_n_days and validates n', () => {
    const rules = mapMcpFiltersToRules([], [{ field: 'd', operator: 'in_next_n_days', value: 14 }]);
    expect(rules![0]).toMatchObject({
      operator: 'relative_date',
      value: { kind: 'next_n_days', n: 14 },
    });
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'd', operator: 'in_next_n_days', value: 0 }])
    ).toThrow(/positive integer/);
    expect(() =>
      mapMcpFiltersToRules([], [{ field: 'd', operator: 'in_next_n_days', value: 'abc' }])
    ).toThrow(/positive integer/);
  });

  it('rejects boolean/array day counts instead of coercing them (Number(true)=1, Number([7])=7)', () => {
    for (const operator of ['in_last_n_days', 'in_next_n_days'] as const) {
      expect(() => mapMcpFiltersToRules([], [{ field: 'd', operator, value: true }])).toThrow(
        /positive integer/
      );
      expect(() => mapMcpFiltersToRules([], [{ field: 'd', operator, value: [7] }])).toThrow(
        /positive integer/
      );
    }
    // A numeric string stays accepted — a common client habit.
    const rules = mapMcpFiltersToRules(
      [],
      [{ field: 'd', operator: 'in_last_n_days', value: '7' }]
    );
    expect(rules![0]).toMatchObject({ value: { kind: 'last_n_days', n: 7 } });
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

describe('mapMcpSort', () => {
  it('maps field/direction to the internal column/direction shape', () => {
    expect(mapMcpSort([{ field: 'revenue', direction: 'desc' }])).toEqual([
      { column: 'revenue', direction: 'desc' },
    ]);
  });

  it('preserves the order of multiple sort rules', () => {
    expect(
      mapMcpSort([
        { field: 'date', direction: 'asc' },
        { field: 'revenue', direction: 'desc' },
      ])
    ).toEqual([
      { column: 'date', direction: 'asc' },
      { column: 'revenue', direction: 'desc' },
    ]);
  });

  it('returns null for an empty or absent list', () => {
    expect(mapMcpSort([])).toBeNull();
    expect(mapMcpSort()).toBeNull();
  });
});

describe('queryDataMartInputSchema sort validation', () => {
  it('rejects an invalid sort direction at schema parse', () => {
    expect(() =>
      queryDataMartInputSchema.parse({
        data_mart_id: 'dm1',
        fields: ['f1'],
        sort: [{ field: 'f1', direction: 'ascending' }],
      })
    ).toThrow();
  });

  it('accepts valid sort rules', () => {
    const result = queryDataMartInputSchema.parse({
      data_mart_id: 'dm1',
      fields: ['f1'],
      sort: [{ field: 'f1', direction: 'desc' }],
    });
    expect(result.sort?.[0]).toEqual({ field: 'f1', direction: 'desc' });
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

describe('collectRealFieldNames / splitUniqueCountFields (#6792)', () => {
  const sources = [
    { aliasPath: 'orders', name: 'orders__unique_count', displayName: 'Orders Unique Count' },
  ];

  it('collects native fields with their nested `parent.child` paths plus joined field names', () => {
    const names = collectRealFieldNames({
      fields: [
        { name: 'order_date' },
        {
          name: 'customer',
          fields: [{ name: 'id' }, { name: 'address', fields: [{ name: 'zip' }] }],
        },
      ],
      joinedFields: [{ name: 'orders__status' }],
      uniqueCountSources: [],
    });

    expect([...names].sort()).toEqual([
      'customer',
      'customer.address',
      'customer.address.zip',
      'customer.id',
      'order_date',
      'orders__status',
    ]);
  });

  // `getDataMartDetails` appends the pseudo-fields to `joinedFields` so the model can see them.
  // Reading that list back as "real fields" makes every advertised Unique Count shadow itself, and
  // the split then hands the name through as an ordinary column the query engine does not have.
  it('does not count an advertised pseudo-field as a real field of the data mart', () => {
    const names = collectRealFieldNames({
      fields: [{ name: 'customer_email' }],
      joinedFields: [{ name: 'orders__status' }, { name: 'orders__unique_count' }],
      uniqueCountSources: sources,
    });

    expect(names.has('orders__unique_count')).toBe(false);
    expect([...names].sort()).toEqual(['customer_email', 'orders__status']);
  });

  it('still maps the pseudo-field when the details payload advertises it in joinedFields too', () => {
    const details = {
      fields: [{ name: 'customer_email' }],
      joinedFields: [{ name: 'orders__unique_count' }],
      uniqueCountSources: sources,
    };

    const split = splitUniqueCountFields(
      ['customer_email', 'orders__unique_count'],
      details.uniqueCountSources,
      collectRealFieldNames(details)
    );

    expect(split).toEqual({
      columns: ['customer_email'],
      uniqueCountConfig: ['orders'],
      matchedNames: ['orders__unique_count'],
    });
  });

  it('passes a real field through as a column even when a pseudo-field claims the same name', () => {
    const split = splitUniqueCountFields(
      ['orders__unique_count'],
      sources,
      new Set(['orders__unique_count'])
    );

    expect(split).toEqual({ columns: ['orders__unique_count'], matchedNames: [] });
  });

  it('still maps an offered pseudo-field no real field owns', () => {
    const split = splitUniqueCountFields(
      ['channel', 'orders__unique_count'],
      sources,
      new Set(['channel'])
    );

    expect(split).toEqual({
      columns: ['channel'],
      uniqueCountConfig: ['orders'],
      matchedNames: ['orders__unique_count'],
    });
  });

  it('rejects a name that is neither a real field nor an offered pseudo-field', () => {
    expect(() => splitUniqueCountFields(['bogus__unique_count'], sources, new Set())).toThrow(
      UnmatchedUniqueCountFieldError
    );
  });

  // Reachable only if the producer regresses — and answering with whichever source came last would
  // count the wrong Data Mart with nothing to show for it.
  it('refuses to resolve a name two sources claim, rather than picking one', () => {
    expect(() =>
      splitUniqueCountFields(
        ['a_b__unique_count'],
        [
          { aliasPath: 'a_b', name: 'a_b__unique_count', displayName: 'Flat Unique Count' },
          { aliasPath: 'a.b', name: 'a_b__unique_count', displayName: 'Nested Unique Count' },
        ],
        new Set()
      )
    ).toThrow(/offered by two sources/);
  });

  it('routes the human-readable display name to the error that names the real one', () => {
    expect(() => splitUniqueCountFields(['Orders Unique Count'], sources, new Set())).toThrow(
      /orders__unique_count/
    );
  });

  it('leaves a real field whose name ends like a display name alone', () => {
    const split = splitUniqueCountFields(
      ['Orders Unique Count'],
      sources,
      new Set(['Orders Unique Count'])
    );
    expect(split).toEqual({ columns: ['Orders Unique Count'], matchedNames: [] });
  });

  it('splits several pseudo-fields at once, preserving the order of both lists', () => {
    const split = splitUniqueCountFields(
      ['orders__unique_count', 'channel', 'items__unique_count', 'date'],
      [
        ...sources,
        {
          aliasPath: 'orders.items',
          name: 'items__unique_count',
          displayName: 'Items Unique Count',
        },
      ],
      new Set(['channel', 'date'])
    );

    expect(split).toEqual({
      columns: ['channel', 'date'],
      uniqueCountConfig: ['orders', 'orders.items'],
      matchedNames: ['orders__unique_count', 'items__unique_count'],
    });
  });

  // The REST DTOs cap `uniqueCountConfig` through UniqueCountConfigRequestSchema. This path
  // synthesises the same value out of `fields`, which carries no cap of its own, so without an
  // explicit check the limit simply does not apply to MCP callers (#6792).
  describe('the report-wide source cap', () => {
    function offeredSources(count: number): McpUniqueCountSourceDto[] {
      return Array.from({ length: count }, (_, i) => ({
        aliasPath: `s${i}`,
        name: `s${i}__unique_count`,
        displayName: `S${i} Unique Count`,
      }));
    }

    it('accepts exactly the cap', () => {
      const offered = offeredSources(UNIQUE_COUNT_CONFIG_MAX_SOURCES);
      const split = splitUniqueCountFields(
        offered.map(s => s.name),
        offered,
        new Set()
      );

      expect(split.uniqueCountConfig).toHaveLength(UNIQUE_COUNT_CONFIG_MAX_SOURCES);
    });

    it('rejects one source over the cap', () => {
      const offered = offeredSources(UNIQUE_COUNT_CONFIG_MAX_SOURCES + 1);

      expect(() =>
        splitUniqueCountFields(
          offered.map(s => s.name),
          offered,
          new Set()
        )
      ).toThrow(UniqueCountSourceLimitError);
    });

    // `fields` has no `.max()`, so repeating ONE offered pseudo-field is enough to synthesise an
    // over-cap list — the cheapest way past the limit, and the reason the check reads the
    // synthesised value rather than the number of sources the data mart offers.
    it('rejects a single source repeated past the cap', () => {
      const offered = offeredSources(1);
      const repeated = Array.from(
        { length: UNIQUE_COUNT_CONFIG_MAX_SOURCES + 1 },
        () => offered[0].name
      );

      expect(() => splitUniqueCountFields(repeated, offered, new Set())).toThrow(
        UniqueCountSourceLimitError
      );
    });
  });

  it('omits uniqueCountConfig entirely when no pseudo-field was selected', () => {
    const split = splitUniqueCountFields(['channel'], sources, new Set(['channel']));

    expect(split).toEqual({ columns: ['channel'], matchedNames: [] });
    expect(split).not.toHaveProperty('uniqueCountConfig');
  });

  it('names every unmatched candidate, not just the first', () => {
    expect(() =>
      splitUniqueCountFields(['a__unique_count', 'b__unique_count'], sources, new Set())
    ).toThrow(/a__unique_count, b__unique_count/);
  });

  // A plain unknown field is NOT this error's business — it must fall through to the query
  // validator, which knows the real schema and can name the closest match.
  it('passes an unknown field that does not look like a pseudo-field through as a column', () => {
    expect(splitUniqueCountFields(['typo_field'], sources, new Set())).toEqual({
      columns: ['typo_field'],
      matchedNames: [],
    });
  });
});

describe('hasUniqueCountFieldCandidate (#6792)', () => {
  it('is true when any field ends in the pseudo-field suffix', () => {
    expect(hasUniqueCountFieldCandidate(['orders__unique_count'])).toBe(true);
    expect(hasUniqueCountFieldCandidate(['channel', 'orders.items__unique_count'])).toBe(true);
  });

  it('is false for a selection with no candidate, so the extra schema lookup is skipped', () => {
    expect(hasUniqueCountFieldCandidate([])).toBe(false);
    expect(hasUniqueCountFieldCandidate(['channel', 'revenue'])).toBe(false);
  });

  // The suffix carries its own `__` separator: a column literally called `unique_count` is an
  // ordinary field and must not trigger the lookup.
  it('is false for the bare token without the `__` separator', () => {
    expect(hasUniqueCountFieldCandidate(['unique_count'])).toBe(false);
  });
});

describe('findUniqueCountClauseViolations (#6792)', () => {
  it('returns nothing when no pseudo-field was matched at all', () => {
    expect(
      findUniqueCountClauseViolations([], { filters: [{ field: 'orders__unique_count' }] })
    ).toEqual([]);
  });

  it('returns nothing when the clauses name only ordinary fields', () => {
    expect(
      findUniqueCountClauseViolations(['orders__unique_count'], {
        filters: [{ field: 'channel' }],
        sort: undefined,
      } as never)
    ).toEqual([]);
  });

  it('collects every clause that names one pseudo-field', () => {
    expect(
      findUniqueCountClauseViolations(['orders__unique_count'], {
        filters: [{ field: 'orders__unique_count' }],
        aggregations: [{ field: 'orders__unique_count' }],
      })
    ).toEqual([{ field: 'orders__unique_count', clauses: ['filters', 'aggregations'] }]);
  });

  it('reports one entry per offending pseudo-field', () => {
    expect(
      findUniqueCountClauseViolations(['orders__unique_count', 'items__unique_count'], {
        slices: [{ field: 'orders__unique_count' }],
        date_buckets: [{ field: 'items__unique_count' }],
      })
    ).toEqual([
      { field: 'orders__unique_count', clauses: ['slices'] },
      { field: 'items__unique_count', clauses: ['date_buckets'] },
    ]);
  });
});

describe('UniqueCountFieldUnsupportedClauseError (#6792)', () => {
  it('says "that clause" for a single field in a single clause', () => {
    const err = new UniqueCountFieldUnsupportedClauseError([
      { field: 'orders__unique_count', clauses: ['filters'] },
    ]);

    expect(err.message).toContain("'orders__unique_count' in filters");
    expect(err.message).toContain('remove it from that clause instead');
    expect(err.message).not.toContain('those clauses');
  });

  it('says "those clauses" when one field is named in more than one clause', () => {
    const err = new UniqueCountFieldUnsupportedClauseError([
      { field: 'orders__unique_count', clauses: ['filters', 'aggregations'] },
    ]);

    expect(err.message).toContain("'orders__unique_count' in filters, aggregations");
    expect(err.message).toContain('remove it from those clauses instead');
  });

  it('says "those clauses" when two fields are each named in a clause', () => {
    const err = new UniqueCountFieldUnsupportedClauseError([
      { field: 'orders__unique_count', clauses: ['filters'] },
      { field: 'items__unique_count', clauses: ['slices'] },
    ]);

    expect(err.message).toContain("('orders__unique_count', 'items__unique_count')");
    expect(err.message).toContain('remove it from those clauses instead');
  });

  it('steers to dropping the clause, never to re-adding the field to "fields"', () => {
    const err = new UniqueCountFieldUnsupportedClauseError([
      { field: 'orders__unique_count', clauses: ['filters'] },
    ]);

    expect(err.name).toBe('UniqueCountFieldUnsupportedClauseError');
    expect(err.message).toContain('It is already correctly in "fields"');
  });
});
