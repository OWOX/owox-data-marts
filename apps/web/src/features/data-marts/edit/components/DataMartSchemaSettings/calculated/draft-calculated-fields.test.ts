import { describe, expect, it } from 'vitest';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types';
import {
  collectDraftCalculatedFields,
  DRAFT_FORMULA_MAX_LENGTH,
  MAX_DRAFT_CALCULATED_FIELDS,
  selectDraftCalculatedFields,
} from './draft-calculated-fields';
import type { SchemaField } from './formula-reference-index';

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    name: 'f',
    type: 'STRING',
    isPrimaryKey: false,
    status: DataMartSchemaFieldStatus.CONNECTED,
    ...overrides,
  };
}

describe('collectDraftCalculatedFields', () => {
  it('reports each calculated field as the endpoint takes it', () => {
    const drafted = collectDraftCalculatedFields([
      field({ name: 'clicks', type: 'INTEGER' }),
      field({
        name: 'revenue',
        type: 'FLOAT',
        calculated: { formula: 'SUM({{ref field="amount"}})', level: 'metric' },
      }),
    ]);

    // The STORED form, not the authoring text — and no level: the endpoint derives one, and the
    // draft's is a cache that is stale by construction while a formula is being edited.
    expect(drafted).toEqual([
      { name: 'revenue', type: 'FLOAT', formula: 'SUM({{ref field="amount"}})' },
    ]);
  });

  /**
   * "Add calculated field" appends a row with no name and an empty formula, and the analyst fills
   * it in afterwards — so this state is on screen every time someone adds a metric. Every entry
   * needs all three values (`@MinLength(1)`), so one unfinished row would 400 the whole request,
   * and three consecutive 4xx answers stop the live check for the rest of the session.
   */
  it('skips a row that is not filled in yet, which would refuse the whole request', () => {
    const drafted = collectDraftCalculatedFields([
      field({ name: '', type: 'FLOAT', calculated: { formula: '' } }),
      field({ name: '  ', type: 'FLOAT', calculated: { formula: 'SUM(1)' } }),
      field({ name: 'named', type: 'FLOAT', calculated: { formula: '   ' } }),
      field({ name: 'typeless', type: '', calculated: { formula: 'SUM(1)' } }),
      field({ name: 'ready', type: 'FLOAT', calculated: { formula: 'SUM(1)' } }),
    ]);

    expect(drafted.map(entry => entry.name)).toEqual(['ready']);
  });

  /**
   * Every bound the endpoint declares is a way to make the whole request 400, and a 400 is not a
   * visible failure here: three consecutive ones stop the live check for the rest of the session
   * and the diagnostics panel simply stays empty, which reads as "your formula is clean". Nothing
   * caps how many calculated fields a schema may hold, and nothing stops a formula applied in this
   * session from being longer than the endpoint accepts — so both have to be handled here, where
   * the cost is one unresolved sibling instead of every check the analyst makes.
   */
  describe('the bounds the endpoint declares', () => {
    const calculated = (name: string, formula = 'SUM(1)') =>
      field({ name, type: 'FLOAT', calculated: { formula } });

    it('leaves out a formula longer than the endpoint accepts, and keeps the rest', () => {
      const drafted = collectDraftCalculatedFields([
        calculated('too_long', `SUM(${'x'.repeat(DRAFT_FORMULA_MAX_LENGTH)})`),
        calculated('ok'),
      ]);

      expect(drafted.map(entry => entry.name)).toEqual(['ok']);
    });

    it('keeps a formula of exactly the maximum length', () => {
      const formula = 'x'.repeat(DRAFT_FORMULA_MAX_LENGTH);

      expect(collectDraftCalculatedFields([calculated('at_limit', formula)])).toHaveLength(1);
    });
  });

  it('keeps every calculated field, however many — the count is the request’s problem', () => {
    // Trimming here would hide siblings from `selectDraftCalculatedFields`, which is the only
    // place that knows which of them the formula being checked actually needs.
    const many = Array.from({ length: MAX_DRAFT_CALCULATED_FIELDS + 5 }, (_, i) =>
      field({ name: `m${String(i)}`, type: 'FLOAT', calculated: { formula: 'SUM(1)' } })
    );

    expect(collectDraftCalculatedFields(many)).toHaveLength(MAX_DRAFT_CALCULATED_FIELDS + 5);
  });

  it('reports nothing for a schema with no calculated fields, and none for an absent one', () => {
    expect(collectDraftCalculatedFields([field({ name: 'clicks' })])).toEqual([]);
    expect(collectDraftCalculatedFields(undefined)).toEqual([]);
  });
});

/**
 * A draft past the endpoint's count cannot be sent whole, and what is left out does not merely go
 * unresolved: the probe REPLACES the persisted formulas, so a dropped sibling disappears even when
 * it is saved on disk, and the answer is the same sentence a genuinely missing field gets —
 * `` `z` no longer exists in the Data Mart `` — while the menu still offers it and Save still
 * succeeds. So what must survive the cut is decided by the formula being checked, not by row order.
 */
describe('selectDraftCalculatedFields', () => {
  const draft = (name: string, formula = 'SUM(1)') => ({ name, type: 'FLOAT', formula });
  const filler = (count: number, from = 0) =>
    Array.from({ length: count }, (_, i) => draft(`filler${String(from + i)}`));

  it('sends the draft untouched while it fits', () => {
    const all = filler(MAX_DRAFT_CALCULATED_FIELDS);

    const selected = selectDraftCalculatedFields(all, '{{ref field="filler0"}}');

    expect(selected.fields).toBe(all);
    expect(selected.isTruncated).toBe(false);
  });

  it('keeps what the formula names, and what those name in turn, ahead of the rest', () => {
    // `roas` reads `revenue`, which reads `net`: drop `net` and `revenue` breaks, so the closure
    // is what has to survive — not just the names spelled in the formula on screen.
    const all = [
      ...filler(MAX_DRAFT_CALCULATED_FIELDS),
      draft('revenue', 'SUM({{ref field="net"}})'),
      draft('net'),
    ];

    const selected = selectDraftCalculatedFields(all, '{{ref field="revenue"}} / 2');

    expect(selected.isTruncated).toBe(true);
    expect(selected.fields).toHaveLength(MAX_DRAFT_CALCULATED_FIELDS);
    expect(selected.fields.map(f => f.name).slice(0, 2)).toEqual(['revenue', 'net']);
    // The rest of the room goes to the others, in schema order, so the cut is stable.
    expect(selected.fields[2].name).toBe('filler0');
  });

  it('ignores a JOINED reference, which no draft entry can answer for', () => {
    const all = [...filler(MAX_DRAFT_CALCULATED_FIELDS), draft('orders.amount')];

    const selected = selectDraftCalculatedFields(all, '{{ref path="orders" field="amount"}}');

    expect(selected.fields.map(f => f.name)).not.toContain('orders.amount');
  });

  it('survives a cycle between two drafted formulas', () => {
    // The backend refuses a cycle; this walk must not hang on one before it gets the chance.
    const all = [
      ...filler(MAX_DRAFT_CALCULATED_FIELDS),
      draft('a', 'SUM({{ref field="b"}})'),
      draft('b', 'SUM({{ref field="a"}})'),
    ];

    const selected = selectDraftCalculatedFields(all, '{{ref field="a"}}');

    expect(selected.fields.map(f => f.name).slice(0, 2)).toEqual(['a', 'b']);
  });
});
