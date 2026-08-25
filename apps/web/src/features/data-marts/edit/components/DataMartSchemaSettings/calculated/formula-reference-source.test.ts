import { describe, expect, it } from 'vitest';
import type { ReferenceableField } from './formula-reference-index';
import {
  buildCalculatedFieldIndex,
  buildSourceLabelIndex,
  describeReferenceSource,
} from './formula-reference-source';

const OWN: ReferenceableField = {
  name: 'clicks',
  path: '',
  field: 'clicks',
  type: 'INTEGER',
  isHidden: false,
};

/** `level` omitted = a formula applied in this session, whose level the save has not derived yet. */
const calculated = (name: string, level?: 'metric' | 'column'): ReferenceableField => ({
  name,
  path: '',
  field: name,
  type: 'FLOAT',
  isHidden: false,
  calculated: level ? { level } : {},
});

const joined = (path: string, field: string, sourceLabel?: string): ReferenceableField => ({
  name: `${path}.${field}`,
  path,
  field,
  type: 'FLOAT',
  isHidden: false,
  ...(sourceLabel ? { sourceLabel } : {}),
});

describe('buildSourceLabelIndex', () => {
  it('keys a joined source by its alias path, once for all its fields', () => {
    const labels = buildSourceLabelIndex([
      OWN,
      joined('orders', 'amount', 'Orders'),
      joined('orders', 'qty', 'Orders'),
      joined('orders.items', 'sku', 'Order Items'),
    ]);

    expect([...labels]).toEqual([
      ['orders', 'Orders'],
      ['orders.items', 'Order Items'],
    ]);
  });

  it('holds nothing for an own-Data-Mart field or a joined source with no label', () => {
    expect([...buildSourceLabelIndex([OWN, joined('orders', 'amount')])]).toEqual([]);
  });
});

describe('buildCalculatedFieldIndex', () => {
  it('keys an own calculated field by the name a reference spells, level and all', () => {
    const calculatedFields = buildCalculatedFieldIndex([
      OWN,
      calculated('revenue', 'metric'),
      calculated('ctr', 'column'),
      calculated('roas'),
    ]);

    expect([...calculatedFields]).toEqual([
      ['revenue', { level: 'metric' }],
      ['ctr', { level: 'column' }],
      // Kept, and kept level-less: it is still a formula, and saying which kind is the caller's
      // problem, not something to invent here.
      ['roas', {}],
    ]);
  });

  it('holds nothing for an ordinary field', () => {
    expect([...buildCalculatedFieldIndex([OWN])]).toEqual([]);
  });

  it('holds nothing for a JOINED entry, even one that arrives carrying a level', () => {
    // No producer emits that today — `buildJoinedReferenceIndex` skips calculated fields outright.
    // The guard is what keeps it that way: this map is keyed by NAME, and a joined entry's
    // name is dotted, so `orders.amount` would answer for an own struct field of the same name.
    const joinedCalculated: ReferenceableField = {
      ...joined('orders', 'amount', 'Orders'),
      calculated: { level: 'metric' },
    };

    expect([...buildCalculatedFieldIndex([joinedCalculated])]).toEqual([]);
  });
});

describe('describeReferenceSource', () => {
  const labels = buildSourceLabelIndex([joined('orders', 'amount', 'Orders')]);
  const calculatedFields = buildCalculatedFieldIndex([
    calculated('revenue', 'metric'),
    calculated('ctr', 'column'),
    calculated('roas'),
  ]);

  it('names the Data Mart a joined reference reads from, not the alias', () => {
    expect(
      describeReferenceSource({ path: 'orders', field: 'amount' }, labels, calculatedFields)
    ).toBe('amount from the joined Data Mart \u201COrders\u201D');
  });

  it('says nothing about an ordinary own-Data-Mart reference', () => {
    expect(
      describeReferenceSource({ path: '', field: 'clicks' }, labels, calculatedFields)
    ).toBeUndefined();
  });

  it('says nothing when the path has no label — the alias is already on screen', () => {
    expect(
      describeReferenceSource({ path: 'sessions', field: 'id' }, labels, calculatedFields)
    ).toBeUndefined();
  });

  it('describes a field the index no longer offers, as long as its source is still joined', () => {
    // A column dropped from the joined Data Mart: the formula still names it, and which Data Mart
    // it named is exactly what the analyst needs to read the broken reference.
    expect(
      describeReferenceSource({ path: 'orders', field: 'discount' }, labels, calculatedFields)
    ).toBe('discount from the joined Data Mart \u201COrders\u201D');
  });

  /**
   * A chip on an own reference spells a plain field name, which says neither that the field is a
   * formula nor the one fact that decides how it may be written. Both are worth saying:
   * `revenue` and `clicks` read identically in the text and are not interchangeable in it.
   */
  it('warns that an aggregate-level calculated reference cannot be wrapped', () => {
    expect(describeReferenceSource({ path: '', field: 'revenue' }, labels, calculatedFields)).toBe(
      'revenue is a calculated field that already aggregates, so it cannot be wrapped in another ' +
        'aggregation.'
    );
  });

  it('says a row-level calculated reference behaves like any other column', () => {
    expect(describeReferenceSource({ path: '', field: 'ctr' }, labels, calculatedFields)).toBe(
      'ctr is a row-level calculated field, so it behaves like any other column.'
    );
  });

  /**
   * The two sentences above state a fact and then rule something out — "cannot be wrapped".
   * A level is only a FACT once the save derived it: for a formula applied in this session the
   * level is absent, and the completion row's label reads that as an aggregate on purpose (the
   * quiet direction for a label). A sentence carrying "cannot" cannot borrow that guess — it would
   * tell the analyst `SUM(roas)` is illegal when it may be exactly right.
   */
  it('claims no level for a formula whose level is not derived yet, and says why', () => {
    expect(describeReferenceSource({ path: '', field: 'roas' }, labels, calculatedFields)).toBe(
      'roas is a calculated field. Whether it aggregates is known once the schema is saved.'
    );
  });
});
