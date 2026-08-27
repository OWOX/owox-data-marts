import { describe, expect, it } from 'vitest';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types';
import {
  buildJoinedReferenceIndex,
  buildNameIndex,
  buildReferenceIndex,
  resolveTypedName,
  type JoinedSchemaField,
  type ReferenceableField,
  type SchemaField,
} from './formula-reference-index';

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    name: 'f',
    type: 'STRING',
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    ...overrides,
  };
}

function calculatedField(overrides: Partial<SchemaField> = {}): SchemaField {
  return field({
    calculated: { formula: '1', level: 'metric' },
    ...overrides,
  });
}

describe('buildReferenceIndex', () => {
  it('offers hidden fields — hidden means off the reporting menu, not absent from the source', () => {
    const index = buildReferenceIndex([
      field({ name: 'clicks' }),
      field({ name: 'impressions', isHiddenForReporting: true }),
    ]);
    expect(index.map(f => [f.name, f.isHidden])).toEqual([
      ['clicks', false],
      ['impressions', true],
    ]);
  });

  // A formula may read another calculated field of the SAME Data Mart, so hiding them from
  // the menu now withholds legal candidates rather than protecting the analyst from a refusal.
  it('offers a calculated field, carrying the level that decides how it may be used', () => {
    const index = buildReferenceIndex([
      field({ name: 'clicks' }),
      calculatedField({ name: 'revenue', type: 'FLOAT' }),
    ]);
    expect(index).toEqual([
      { name: 'clicks', path: '', field: 'clicks', type: 'STRING', isHidden: false },
      {
        name: 'revenue',
        path: '',
        field: 'revenue',
        type: 'FLOAT',
        isHidden: false,
        calculated: { level: 'metric' },
      },
    ]);
  });

  it('carries the ROW level of a row-level calculated field', () => {
    // The two levels are used differently — an aggregate-level field is legal bare and refused
    // inside an aggregation, a row-level one is the reverse — so a level reported as a constant
    // would be worse than none at all.
    const index = buildReferenceIndex([
      calculatedField({ name: 'ctr', calculated: { formula: '1', level: 'column' } }),
    ]);
    expect(index.map(f => f.calculated?.level)).toEqual(['column']);
  });

  it('marks a calculated field whose level is not derived yet WITHOUT inventing one', () => {
    // The save derives the level, so a formula applied in this session carries none. The entry is
    // still marked calculated — that much is known — and the level is simply absent, so each
    // consumer decides for itself what to do with not knowing: the completion label reads it the
    // quiet way (`isRowLevelCalculatedField`), the hover refuses to make a claim at all.
    const [entry] = buildReferenceIndex([
      calculatedField({ name: 'revenue', calculated: { formula: 'SUM(clicks)' } }),
    ]);
    expect(entry.calculated).toEqual({});
    expect(entry.calculated).not.toHaveProperty('level');
  });

  it('leaves an ordinary field unmarked — the marker is what tells the two apart', () => {
    const [entry] = buildReferenceIndex([field({ name: 'clicks' })]);
    expect(entry).not.toHaveProperty('calculated');
  });

  it('offers nothing for a field with no name yet — a nameless field cannot be referenced', () => {
    // "Add calculated field" appends a CONNECTED row whose name is typed afterwards, so an empty
    // name is a state the schema editor really passes through. An empty name in the index matches
    // the empty string everywhere: `resolveAll` hands back zero-length references and
    // `toStoredForm` splices `{{ref field=""}}` into the analyst's formula.
    const index = buildReferenceIndex([
      calculatedField({ name: '' }),
      field({ name: '   ' }),
      field({ name: 'clicks' }),
    ]);
    expect(index.map(f => f.name)).toEqual(['clicks']);
  });

  it('excludes disconnected fields, and their whole subtree', () => {
    const index = buildReferenceIndex([
      field({
        name: 'gone',
        status: DataMartSchemaFieldStatus.DISCONNECTED,
        fields: [field({ name: 'child' })],
      }),
      field({ name: 'clicks' }),
    ]);
    expect(index.map(f => f.name)).toEqual(['clicks']);
  });

  it('offers a nested field under its dotted path', () => {
    const index = buildReferenceIndex([
      field({ name: 'payload', fields: [field({ name: 'value' })] }),
    ]);
    expect(index.map(f => f.name)).toContain('payload.value');
  });

  it('offers a field nested two levels deep under its full dotted path', () => {
    const index = buildReferenceIndex([
      field({
        name: 'payload',
        fields: [field({ name: 'user', fields: [field({ name: 'id' })] })],
      }),
    ]);
    expect(index.map(f => f.name)).toEqual(['payload', 'payload.user', 'payload.user.id']);
  });

  it('walks a container and its calculated child alike, under the same dotted path', () => {
    // Not a shape an analyst can create — every save path's schema parser refuses a dotted
    // calculated name — so what this pins is the traversal itself: it treats a calculated field
    // like any other, exactly as the backend's `collectFormulaReferenceableFields` does.
    const index = buildReferenceIndex([
      field({ name: 'payload', fields: [calculatedField({ name: 'derived' })] }),
    ]);
    expect(index.map(f => f.name)).toEqual(['payload', 'payload.derived']);
  });

  it('returns nothing for an empty schema', () => {
    expect(buildReferenceIndex([])).toEqual([]);
  });

  it('sets path to "" and field to the dotted name on every own-Data-Mart entry', () => {
    const index = buildReferenceIndex([
      field({ name: 'payload', fields: [field({ name: 'value' })] }),
    ]);
    expect(index).toEqual([
      { name: 'payload', path: '', field: 'payload', type: 'STRING', isHidden: false },
      { name: 'payload.value', path: '', field: 'payload.value', type: 'STRING', isHidden: false },
    ]);
  });
});

function joined(overrides: Partial<JoinedSchemaField> = {}): JoinedSchemaField {
  return {
    aliasPath: 'orders',
    originalFieldName: 'amount',
    type: 'FLOAT',
    isHidden: false,
    ...overrides,
  };
}

describe('buildJoinedReferenceIndex', () => {
  it('offers a joined field under <aliasPath>.<field>, tagging it with the structural path', () => {
    expect(buildJoinedReferenceIndex([joined({ outputPrefix: 'Orders' })])).toEqual([
      {
        name: 'orders.amount',
        path: 'orders',
        field: 'amount',
        type: 'FLOAT',
        isHidden: false,
        sourceLabel: 'Orders',
      },
    ]);
  });

  it('names the source by its blend alias, falling back to the Data Mart title', () => {
    const labels = buildJoinedReferenceIndex([
      joined({ outputPrefix: 'Orders EU', sourceDataMartTitle: 'Orders' }),
      joined({ originalFieldName: 'qty', outputPrefix: '  ', sourceDataMartTitle: 'Orders' }),
      joined({ originalFieldName: 'sku' }),
    ]).map(entry => entry.sourceLabel);
    expect(labels).toEqual(['Orders EU', 'Orders', undefined]);
  });

  it('does not offer a field hidden in the joined Data Mart — the backend refuses that reference', () => {
    const index = buildJoinedReferenceIndex([
      joined(),
      joined({ originalFieldName: 'secret', isHidden: true }),
    ]);
    expect(index.map(f => f.name)).toEqual(['orders.amount']);
  });

  // NOT the own-Data-Mart rule above, and the asymmetry is the point: the refusal is lifted for
  // the metric's own mart only. A JOINED formula is still refused — its text never crosses
  // the wire to be substituted, and routing and the source access check are both decided from THIS
  // formula's raw text, so a source reachable only through it would be joined unchecked.
  it('does not offer a CALCULATED field of the joined Data Mart', () => {
    const index = buildJoinedReferenceIndex([
      joined(),
      joined({ originalFieldName: 'ctr', isCalculated: true }),
      // Calculated wins over hidden — the backend reports the same field as 'calculated' too.
      joined({ originalFieldName: 'cpa', isCalculated: true, isHidden: true }),
    ]);
    expect(index.map(f => f.name)).toEqual(['orders.amount']);
  });

  // Absent on a blendable-schema response cached before the backend sent the flag.
  it('offers a field whose isCalculated is absent', () => {
    expect(buildJoinedReferenceIndex([joined()]).map(f => f.name)).toEqual(['orders.amount']);
  });

  it('offers a nested source under its full alias path', () => {
    const index = buildJoinedReferenceIndex([
      joined({ aliasPath: 'orders.items', originalFieldName: 'qty' }),
    ]);
    expect(index.map(f => [f.name, f.path, f.field])).toEqual([
      ['orders.items.qty', 'orders.items', 'qty'],
    ]);
  });

  it('drops an entry with no alias path, which would masquerade as an own-Data-Mart field', () => {
    expect(buildJoinedReferenceIndex([joined({ aliasPath: '' })])).toEqual([]);
  });

  it('returns nothing for a Data Mart that joins nothing', () => {
    expect(buildJoinedReferenceIndex([])).toEqual([]);
  });
});

describe('resolveTypedName', () => {
  const resolve = (fields: readonly ReferenceableField[], typed: string) =>
    resolveTypedName(buildNameIndex(fields), typed);

  it('resolves a typed name, and reports unknown', () => {
    const index = buildReferenceIndex([field({ name: 'clicks' })]);
    expect(resolve(index, 'clicks')).toMatchObject({ field: 'clicks', path: '' });
    expect(resolve(index, 'clcks')).toBe('unknown');
  });

  it('reports unknown against an empty index', () => {
    expect(resolve(buildReferenceIndex([]), 'clicks')).toBe('unknown');
  });

  it('reports ambiguous when a top-level name collides with a nested path', () => {
    const index = buildReferenceIndex([
      field({ name: 'payload.value' }),
      field({ name: 'payload', fields: [field({ name: 'value' })] }),
    ]);
    expect(index.filter(f => f.name === 'payload.value')).toHaveLength(2);
    expect(resolve(index, 'payload.value')).toBe('ambiguous');
  });

  it('resolves a joined name to its joined entry', () => {
    const index = [...buildReferenceIndex([]), ...buildJoinedReferenceIndex([joined()])];
    expect(resolve(index, 'orders.amount')).toMatchObject({ path: 'orders', field: 'amount' });
  });

  it('prefers the own-Data-Mart field when a joined name collides with it', () => {
    const own = buildReferenceIndex([
      field({ name: 'orders', fields: [field({ name: 'amount' })] }),
    ]);
    const index = [...own, ...buildJoinedReferenceIndex([joined()])];
    expect(index.filter(f => f.name === 'orders.amount')).toHaveLength(2);
    expect(resolve(index, 'orders.amount')).toMatchObject({ path: '', field: 'orders.amount' });
  });

  it('prefers the own field whichever order the two indexes were concatenated in', () => {
    const own = buildReferenceIndex([
      field({ name: 'orders', fields: [field({ name: 'amount' })] }),
    ]);
    const index = [...buildJoinedReferenceIndex([joined()]), ...own];
    expect(resolve(index, 'orders.amount')).toMatchObject({ path: '' });
  });

  it('reports ambiguous when two joined sources produce the same typed name', () => {
    // Source `orders` with a nested field `items.qty` against source `orders.items` with `qty`.
    const index = buildJoinedReferenceIndex([
      joined({ originalFieldName: 'items.qty' }),
      joined({ aliasPath: 'orders.items', originalFieldName: 'qty' }),
    ]);
    expect(resolve(index, 'orders.items.qty')).toBe('ambiguous');
  });

  it('lets an own field win a name two joined sources already tied on', () => {
    // The collapse is per name, so a tie recorded before the own field is seen must still yield to
    // it — the precedence rule is about the GROUP, not about which entry arrived first.
    const own = buildReferenceIndex([
      field({
        name: 'orders',
        fields: [field({ name: 'items', fields: [field({ name: 'qty' })] })],
      }),
    ]);
    const index = [
      ...buildJoinedReferenceIndex([
        joined({ originalFieldName: 'items.qty' }),
        joined({ aliasPath: 'orders.items', originalFieldName: 'qty' }),
      ]),
      ...own,
    ];
    expect(resolve(index, 'orders.items.qty')).toMatchObject({ path: '' });
  });

  it('stays ambiguous when two OWN fields tie, whatever joined entries follow', () => {
    const own = buildReferenceIndex([
      field({ name: 'payload.value' }),
      field({ name: 'payload', fields: [field({ name: 'value' })] }),
    ]);
    const index = [
      ...own,
      ...buildJoinedReferenceIndex([joined({ aliasPath: 'payload', originalFieldName: 'value' })]),
    ];
    expect(resolve(index, 'payload.value')).toBe('ambiguous');
  });
});

describe('buildNameIndex', () => {
  it('keys every offered name exactly once, however many candidates share it', () => {
    const index = buildNameIndex([
      ...buildReferenceIndex([field({ name: 'clicks' }), field({ name: 'payload.value' })]),
      ...buildJoinedReferenceIndex([joined()]),
    ]);
    expect([...index.keys()].sort()).toEqual(['clicks', 'orders.amount', 'payload.value']);
  });
});
