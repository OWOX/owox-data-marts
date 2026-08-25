import {
  isConnected,
  classifyJoinedUniqueCountAvailability,
  collectFormulaReferenceableFields,
  collectPrimaryKeyRowIdentity,
  collectSchemaFieldPathDescriptors,
  createBaseFieldSchemaForType,
  getMainUniqueCountKeyFields,
  hasUsablePrimaryKey,
} from './data-mart-schema.utils';
import { isCalculatedField } from '../calculated-fields/calculated-field.utils';
import { CALCULATED_FIELD_LEVELS } from '../calculated-fields/formula-level';
import { DataMartSchemaFieldStatus } from './enums/data-mart-schema-field-status.enum';
import type { DataMartSchemaField } from './data-mart-schema.type';
import { z } from 'zod';

describe('isConnected', () => {
  const field = (status: DataMartSchemaFieldStatus): DataMartSchemaField =>
    ({ name: 'f', type: 'STRING', status }) as unknown as DataMartSchemaField;

  it('treats CONNECTED as present in the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.CONNECTED))).toBe(true);
  });

  it('treats CONNECTED_WITH_DEFINITION_MISMATCH as present in the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH))).toBe(
      true
    );
  });

  it('treats DISCONNECTED as gone from the source', () => {
    expect(isConnected(field(DataMartSchemaFieldStatus.DISCONNECTED))).toBe(false);
  });
});

describe('createBaseFieldSchemaForType — aggregation governance fields', () => {
  const schema = createBaseFieldSchemaForType(z.string());
  const base = {
    name: 'amount',
    type: 'INTEGER',
    status: DataMartSchemaFieldStatus.CONNECTED,
  };

  it('accepts a field without aggregationRole / allowedAggregations (optional)', () => {
    const result = schema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts a field with aggregationRole and allowedAggregations', () => {
    const result = schema.safeParse({
      ...base,
      aggregationRole: 'metric',
      allowedAggregations: ['SUM', 'AVG', 'P50'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aggregationRole).toBe('metric');
      expect(result.data.allowedAggregations).toEqual(['SUM', 'AVG', 'P50']);
    }
  });

  it('accepts an explicit empty allowedAggregations array (override = no functions)', () => {
    const result = schema.safeParse({ ...base, allowedAggregations: [] });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid aggregationRole', () => {
    const result = schema.safeParse({ ...base, aggregationRole: 'measure' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown aggregation function', () => {
    const result = schema.safeParse({ ...base, allowedAggregations: ['NOPE'] });
    expect(result.success).toBe(false);
  });
});

describe('getMainUniqueCountKeyFields', () => {
  const connected = DataMartSchemaFieldStatus.CONNECTED;

  const mkField = (
    name: string,
    isPrimaryKey: boolean,
    extra: Partial<DataMartSchemaField> = {}
  ): DataMartSchemaField =>
    ({
      name,
      type: 'STRING',
      status: connected,
      isPrimaryKey,
      ...extra,
    }) as unknown as DataMartSchemaField;

  it('returns empty array when no fields are primary keys', () => {
    const fields: DataMartSchemaField[] = [mkField('id', false), mkField('name', false)];
    expect(getMainUniqueCountKeyFields(fields)).toEqual([]);
  });

  it('returns a single primary-key field', () => {
    const fields: DataMartSchemaField[] = [mkField('id', true), mkField('name', false)];
    const result = getMainUniqueCountKeyFields(fields);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('id');
  });

  it('returns all fields that are primary keys (composite PK)', () => {
    const fields: DataMartSchemaField[] = [
      mkField('user_id', true),
      mkField('event_id', true),
      mkField('timestamp', false),
    ];
    const result = getMainUniqueCountKeyFields(fields);
    expect(result).toHaveLength(2);
    expect(result.map(f => f.name)).toEqual(['user_id', 'event_id']);
  });

  it('finds a nested primary key and keeps its full dotted path (not just the leaf)', () => {
    const nested = mkField('inner_pk', true);
    const container = {
      ...mkField('category', false),
      fields: [nested],
    } as unknown as DataMartSchemaField;
    const fields: DataMartSchemaField[] = [mkField('top_non_pk', false), container];
    const result = getMainUniqueCountKeyFields(fields);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('category.inner_pk');
  });

  // Counting is not projecting: hidden takes a column off the reporting menu, not out of the
  // source, and the metric never puts it in the output.
  it('KEEPS a primary-key field hidden for reporting', () => {
    const fields: DataMartSchemaField[] = [
      mkField('id', true, { isHiddenForReporting: true }),
      mkField('event_id', true),
    ];
    expect(getMainUniqueCountKeyFields(fields).map(f => f.name)).toEqual(['id', 'event_id']);
  });

  it('keeps a hidden key even when it is the only one', () => {
    const fields: DataMartSchemaField[] = [mkField('id', true, { isHiddenForReporting: true })];
    expect(getMainUniqueCountKeyFields(fields).map(f => f.name)).toEqual(['id']);
  });

  // Counting by the REST of a composite key merges rows the key itself keeps distinct — a silent
  // undercount, which is worse than withholding the metric.
  it('withholds the WHOLE key when one component is DISCONNECTED', () => {
    const fields: DataMartSchemaField[] = [
      mkField('id', true, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      mkField('event_id', true),
    ];
    expect(getMainUniqueCountKeyFields(fields)).toEqual([]);
  });

  it('withholds the key when its container is disconnected, however deep', () => {
    const container = {
      ...mkField('category', false, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      fields: [mkField('inner_pk', true)],
    } as unknown as DataMartSchemaField;
    expect(getMainUniqueCountKeyFields([container])).toEqual([]);
  });

  it('returns empty array when fields list is empty', () => {
    expect(getMainUniqueCountKeyFields([])).toEqual([]);
  });
});

describe('hasUsablePrimaryKey', () => {
  const connected = DataMartSchemaFieldStatus.CONNECTED;

  const mkField = (
    name: string,
    isPrimaryKey: boolean,
    extra: Partial<DataMartSchemaField> = {}
  ): DataMartSchemaField =>
    ({
      name,
      type: 'STRING',
      status: connected,
      isPrimaryKey,
      ...extra,
    }) as unknown as DataMartSchemaField;

  it('is true for a plain connected primary-key field', () => {
    expect(hasUsablePrimaryKey([mkField('id', true), mkField('name', false)])).toBe(true);
  });

  it('is true when the ONLY primary key is hidden for reporting (still a valid dedup/join key)', () => {
    expect(hasUsablePrimaryKey([mkField('id', true, { isHiddenForReporting: true })])).toBe(true);
  });

  it('is false when the only primary key is DISCONNECTED (its column is gone from the source)', () => {
    expect(
      hasUsablePrimaryKey([mkField('id', true, { status: DataMartSchemaFieldStatus.DISCONNECTED })])
    ).toBe(false);
  });

  it('is false when there is no primary-key field', () => {
    expect(hasUsablePrimaryKey([mkField('id', false), mkField('name', false)])).toBe(false);
  });

  it('is false for an empty fields list', () => {
    expect(hasUsablePrimaryKey([])).toBe(false);
  });

  it('finds a nested primary key inside a hidden container', () => {
    const container = {
      ...mkField('category', false, { isHiddenForReporting: true }),
      fields: [mkField('inner_pk', true)],
    } as unknown as DataMartSchemaField;
    expect(hasUsablePrimaryKey([mkField('top_non_pk', false), container])).toBe(true);
  });
});

describe('collectPrimaryKeyRowIdentity', () => {
  const connected = DataMartSchemaFieldStatus.CONNECTED;
  const mkField = (
    name: string,
    isPrimaryKey: boolean,
    extra: Partial<DataMartSchemaField> = {}
  ): DataMartSchemaField =>
    ({
      name,
      type: 'STRING',
      status: connected,
      isPrimaryKey,
      ...extra,
    }) as unknown as DataMartSchemaField;

  it('returns the declared key columns in schema order', () => {
    expect(
      collectPrimaryKeyRowIdentity([
        mkField('date', true),
        mkField('cost', false),
        mkField('campaign_id', true),
      ])
    ).toEqual(['date', 'campaign_id']);
  });

  it('keeps a component hidden for reporting — hidden means off the menu, not gone', () => {
    expect(
      collectPrimaryKeyRowIdentity([
        mkField('date', true),
        mkField('campaign_id', true, { isHiddenForReporting: true }),
      ])
    ).toEqual(['date', 'campaign_id']);
  });

  it('returns nothing when one component is gone from the source', () => {
    expect(
      collectPrimaryKeyRowIdentity([
        mkField('date', true),
        mkField('campaign_id', true, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      ])
    ).toEqual([]);
  });

  it('returns nothing when a component is nested', () => {
    const container = {
      ...mkField('meta', false),
      fields: [mkField('inner_id', true)],
    } as unknown as DataMartSchemaField;
    expect(collectPrimaryKeyRowIdentity([mkField('date', true), container])).toEqual([]);
  });

  it('sees a component buried in a DISCONNECTED subtree and disqualifies the key', () => {
    const container = {
      ...mkField('meta', false, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      fields: [mkField('inner_id', true)],
    } as unknown as DataMartSchemaField;
    expect(collectPrimaryKeyRowIdentity([mkField('date', true), container])).toEqual([]);
  });

  it('returns nothing when no key is declared', () => {
    expect(collectPrimaryKeyRowIdentity([mkField('date', false)])).toEqual([]);
    expect(collectPrimaryKeyRowIdentity([])).toEqual([]);
  });
});

describe('classifyJoinedUniqueCountAvailability', () => {
  const connected = DataMartSchemaFieldStatus.CONNECTED;
  const mkField = (
    name: string,
    isPrimaryKey: boolean,
    extra: Partial<DataMartSchemaField> = {}
  ): DataMartSchemaField =>
    ({
      name,
      type: 'STRING',
      status: connected,
      isPrimaryKey,
      ...extra,
    }) as unknown as DataMartSchemaField;

  it('is available for a plain top-level primary key', () => {
    expect(classifyJoinedUniqueCountAvailability([mkField('id', true)])).toBe('available');
  });

  it('is available for a primary key hidden for reporting — hidden means off the menu, not absent', () => {
    expect(
      classifyJoinedUniqueCountAvailability([mkField('id', true, { isHiddenForReporting: true })])
    ).toBe('available');
  });

  it('is no-primary-key when no field is declared as a primary key anywhere', () => {
    expect(
      classifyJoinedUniqueCountAvailability([mkField('id', false), mkField('name', false)])
    ).toBe('no-primary-key');
    expect(classifyJoinedUniqueCountAvailability([])).toBe('no-primary-key');
  });

  it('is disconnected-primary-key when the declared key is DISCONNECTED, never no-primary-key', () => {
    expect(
      classifyJoinedUniqueCountAvailability([
        mkField('id', true, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      ])
    ).toBe('disconnected-primary-key');
  });

  it('is disconnected-primary-key when one component of a composite key is DISCONNECTED', () => {
    expect(
      classifyJoinedUniqueCountAvailability([
        mkField('date', true),
        mkField('campaign_id', true, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      ])
    ).toBe('disconnected-primary-key');
  });

  it('is nested-primary-key when the declared key lives inside a nested container', () => {
    const container = {
      ...mkField('meta', false),
      fields: [mkField('inner_id', true)],
    } as unknown as DataMartSchemaField;
    expect(classifyJoinedUniqueCountAvailability([mkField('top_non_pk', false), container])).toBe(
      'nested-primary-key'
    );
  });

  // Naming only the nesting sent the user to un-nest the key, after which the metric was STILL
  // withheld — for a cause they were never told about.
  it('names both causes when the nested key also sits in a DISCONNECTED subtree', () => {
    const container = {
      ...mkField('meta', false, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      fields: [mkField('inner_id', true)],
    } as unknown as DataMartSchemaField;
    expect(classifyJoinedUniqueCountAvailability([container])).toBe(
      'nested-and-disconnected-primary-key'
    );
  });

  it('names both causes for a composite key with one hidden, one disconnected, and one nested component', () => {
    const nestedContainer = {
      ...mkField('meta', false),
      fields: [mkField('inner_id', true)],
    } as unknown as DataMartSchemaField;
    const fields: DataMartSchemaField[] = [
      mkField('hidden_id', true, { isHiddenForReporting: true }),
      mkField('gone_id', true, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      nestedContainer,
    ];
    expect(classifyJoinedUniqueCountAvailability(fields)).toBe(
      'nested-and-disconnected-primary-key'
    );
  });

  it('stays nested-primary-key when every declared component is still connected', () => {
    const container = {
      ...mkField('meta', false),
      fields: [mkField('inner_id', true)],
    } as unknown as DataMartSchemaField;
    expect(classifyJoinedUniqueCountAvailability([mkField('date', true), container])).toBe(
      'nested-primary-key'
    );
  });

  it('is available for a composite key with one hidden and one plain connected component', () => {
    const fields: DataMartSchemaField[] = [
      mkField('hidden_id', true, { isHiddenForReporting: true }),
      mkField('visible_id', true),
    ];
    expect(classifyJoinedUniqueCountAvailability(fields)).toBe('available');
  });

  it('agrees with collectPrimaryKeyRowIdentity: available iff a non-empty row identity exists', () => {
    const nested = {
      ...mkField('meta', false),
      fields: [mkField('inner_id', true)],
    } as unknown as DataMartSchemaField;
    const disconnected = mkField('gone_id', true, {
      status: DataMartSchemaFieldStatus.DISCONNECTED,
    });
    const hiddenInDisconnected = {
      ...mkField('vanished', false, { status: DataMartSchemaFieldStatus.DISCONNECTED }),
      fields: [mkField('buried_id', true)],
    } as unknown as DataMartSchemaField;

    const cases: DataMartSchemaField[][] = [
      [],
      [mkField('id', false)],
      [mkField('id', true)],
      [mkField('id', true, { isHiddenForReporting: true })],
      [nested],
      [disconnected],
      [hiddenInDisconnected],
      [mkField('date', true), disconnected],
      [mkField('date', true), nested],
      [mkField('date', true), mkField('campaign_id', true, { isHiddenForReporting: true })],
    ];

    for (const fields of cases) {
      const isAvailable = classifyJoinedUniqueCountAvailability(fields) === 'available';
      const hasRowIdentity = collectPrimaryKeyRowIdentity(fields).length > 0;
      expect(isAvailable).toBe(hasRowIdentity);
    }
  });
});

describe('calculated fields', () => {
  it('accepts a field carrying a formula', () => {
    const schema = createBaseFieldSchemaForType(z.string()).parse({
      name: 'ctr',
      type: 'FLOAT',
      status: DataMartSchemaFieldStatus.CONNECTED,
      calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
    });
    expect(isCalculatedField(schema)).toBe(true);
  });

  it('accepts a formula at exactly the length cap (10,000 characters)', () => {
    expect(() =>
      createBaseFieldSchemaForType(z.string()).parse({
        name: 'ctr',
        type: 'FLOAT',
        status: DataMartSchemaFieldStatus.CONNECTED,
        calculated: { formula: 'x'.repeat(10_000), level: 'metric' },
      })
    ).not.toThrow();
  });

  it('rejects a formula over the length cap', () => {
    expect(() =>
      createBaseFieldSchemaForType(z.string()).parse({
        name: 'ctr',
        type: 'FLOAT',
        status: DataMartSchemaFieldStatus.CONNECTED,
        calculated: { formula: 'x'.repeat(10_001), level: 'metric' },
      })
    ).toThrow();
  });

  // The level is derived by CalculatedFieldValidatorService, so the wire schema's whole job here is
  // to accept every shape a client can legitimately send — including none, which is what the web
  // sends for a field it has just created — and to refuse a value that is not a level at all.
  it.each([['metric'], ['column']])('accepts level %s on the wire', level => {
    const parsed = createBaseFieldSchemaForType(z.string()).parse({
      name: 'ctr',
      type: 'FLOAT',
      status: DataMartSchemaFieldStatus.CONNECTED,
      calculated: { formula: 'SUM({{ref field="clicks"}})', level },
    });
    expect(parsed.calculated?.level).toBe(level);
  });

  it('accepts a calculated field carrying no level — the shape the web submits', () => {
    const parsed = createBaseFieldSchemaForType(z.string()).parse({
      name: 'ctr',
      type: 'FLOAT',
      status: DataMartSchemaFieldStatus.CONNECTED,
      calculated: { formula: 'SUM({{ref field="clicks"}})' },
    });
    expect(parsed.calculated?.level).toBeUndefined();
  });

  it('rejects a level outside the derived vocabulary', () => {
    expect(() =>
      createBaseFieldSchemaForType(z.string()).parse({
        name: 'ctr',
        type: 'FLOAT',
        status: DataMartSchemaFieldStatus.CONNECTED,
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'dimension' },
      })
    ).toThrow();
  });

  // The enum is BUILT from CALCULATED_FIELD_LEVELS, and `CalculatedFieldLevel` is derived from the
  // same tuple — so the drift this guards against has two halves with two different defences. A
  // level in the type but not on the wire is unrepresentable BY CONSTRUCTION (there is one list, so
  // no test can exercise the disagreement); a level on the wire but not in the tuple is what this
  // test catches, by failing the moment someone hand-writes a narrower list here instead.
  it('accepts every level CALCULATED_FIELD_LEVELS declares', () => {
    const accepted = CALCULATED_FIELD_LEVELS.filter(
      level =>
        createBaseFieldSchemaForType(z.string()).safeParse({
          name: 'ctr',
          type: 'FLOAT',
          status: DataMartSchemaFieldStatus.CONNECTED,
          calculated: { formula: 'SUM({{ref field="clicks"}})', level },
        }).success
    );
    expect(accepted).toEqual([...CALCULATED_FIELD_LEVELS]);
  });

  it('collectSchemaFieldPathDescriptors keeps a calculated field', () => {
    const fields = [
      {
        name: 'ctr',
        type: 'FLOAT',
        status: DataMartSchemaFieldStatus.DISCONNECTED,
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
    ] as unknown as DataMartSchemaField[];
    expect(collectSchemaFieldPathDescriptors(fields).map(d => d.name)).toEqual(['ctr']);
  });
});

describe('collectFormulaReferenceableFields', () => {
  const mkField = (name: string, extra: Partial<DataMartSchemaField> = {}): DataMartSchemaField =>
    ({
      name,
      type: 'STRING',
      status: DataMartSchemaFieldStatus.CONNECTED,
      ...extra,
    }) as unknown as DataMartSchemaField;

  it('keeps a hidden field — unlike collectSchemaFieldPathDescriptors, a formula may reference it', () => {
    const fields = [mkField('internal_id', { isHiddenForReporting: true }), mkField('clicks')];
    expect(collectFormulaReferenceableFields(fields).map(d => d.name)).toEqual([
      'internal_id',
      'clicks',
    ]);
    expect(collectSchemaFieldPathDescriptors(fields).map(d => d.name)).toEqual(['clicks']);
  });

  it('still prunes a DISCONNECTED field and its subtree — it is genuinely gone from the source', () => {
    const fields = [
      mkField('gone', {
        status: DataMartSchemaFieldStatus.DISCONNECTED,
        fields: [mkField('child')],
      }),
      mkField('clicks'),
    ];
    expect(collectFormulaReferenceableFields(fields).map(d => d.name)).toEqual(['clicks']);
  });

  it('descends into nested fields under a dotted path', () => {
    const fields = [
      mkField('metrics', {
        isHiddenForReporting: true,
        fields: [mkField('ctr')],
      }),
    ];
    expect(collectFormulaReferenceableFields(fields).map(d => d.name)).toEqual([
      'metrics',
      'metrics.ctr',
    ]);
  });
});
