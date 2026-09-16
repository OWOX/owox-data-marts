import { describe, expect, it } from 'vitest';
import { resolveAutoCollapse, autoAggregationByColumn } from './auto-collapse';
import type { NativeField } from '../types/relationship.types';
import type { OutputConfig } from '../types/output-config';

const field = (name: string, type: string, extra: Partial<NativeField> = {}): NativeField => ({
  name,
  type,
  status: 'CONNECTED',
  ...extra,
});

const EMPTY: OutputConfig = {
  filterConfig: [],
  sortConfig: [],
  limitConfig: null,
  aggregationConfig: [],
  dateTruncConfig: [],
  uniqueCountConfig: [],
};

describe('resolveAutoCollapse', () => {
  it('collapses to DISTINCT when the projection carries no metric', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('medium', 'STRING')],
      ['landing_page', 'medium'],
      EMPTY
    );
    expect(plan).toEqual({ kind: 'distinct' });
  });

  it('applies the priority aggregation to a numeric metric', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      EMPTY
    );
    expect(plan).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('leaves a report the analyst already aggregated alone', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      { ...EMPTY, aggregationConfig: [{ column: 'sessions', function: 'AVG' }] }
    );
    expect(plan).toEqual({ kind: 'none', reason: 'analyst-aggregated' });
  });

  it('leaves a report alone when a FILTER names an aggregate-level calculated field', () => {
    // The server branches on `hasAggregateCalculatedField([...calculatedFields,
    // ...calculatedFilterMetrics])`, and the filter half comes from `filterConfig` — so this
    // report already runs `GROUP BY … HAVING …` and no ghost may be drawn for it.
    const plan = resolveAutoCollapse(
      [
        field('country', 'STRING'),
        field('sessions', 'INTEGER'),
        field('total_revenue', 'FLOAT', {
          calculated: { formula: 'SUM({{revenue}})', level: 'metric' },
        }),
      ],
      ['country', 'sessions'],
      {
        ...EMPTY,
        filterConfig: [{ column: 'total_revenue', operator: 'gt', value: 100 }],
      }
    );
    expect(plan).toEqual({ kind: 'none', reason: 'analyst-aggregated' });
  });

  it('still draws the ghost for a report filtered on an ordinary column', () => {
    const plan = resolveAutoCollapse(
      [field('country', 'STRING'), field('sessions', 'INTEGER')],
      ['country', 'sessions'],
      { ...EMPTY, filterConfig: [{ column: 'country', operator: 'eq', value: 'PL' }] }
    );
    expect(plan).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('refuses the DISTINCT collapse when a sort names a column outside the projection', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page'],
      { ...EMPTY, sortConfig: [{ column: 'sessions', direction: 'desc' }] }
    );
    expect(plan).toEqual({ kind: 'none', reason: 'sort-outside-projection' });
  });

  it('refuses the AGGREGATE collapse when a sort names a column outside the projection', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER'), field('other_col', 'STRING')],
      ['landing_page', 'sessions'],
      { ...EMPTY, sortConfig: [{ column: 'other_col', direction: 'asc' }] }
    );
    expect(plan).toEqual({ kind: 'none', reason: 'sort-outside-projection' });
  });

  it('still collapses when every sort rule names a projected column', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      { ...EMPTY, sortConfig: [{ column: 'sessions', direction: 'desc' }] }
    );
    expect(plan).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('does not collapse a report with no explicit projection', () => {
    const plan = resolveAutoCollapse([field('sessions', 'INTEGER')], null, EMPTY);
    expect(plan).toEqual({ kind: 'none', reason: 'no-explicit-projection' });
  });

  it('aborts the whole collapse on a non-groupable column', () => {
    const plan = resolveAutoCollapse(
      [field('payload', 'JSON'), field('sessions', 'INTEGER')],
      ['payload', 'sessions'],
      EMPTY
    );
    expect(plan).toEqual({ kind: 'none', reason: 'non-groupable-column' });
  });

  it('aborts the whole collapse when a metric allows nothing', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER', { allowedAggregations: [] })],
      ['landing_page', 'sessions'],
      EMPTY
    );
    expect(plan).toEqual({ kind: 'none', reason: 'no-allowed-aggregation' });
  });

  it('never picks an aggregation for a row-level calculated ratio', () => {
    const plan = resolveAutoCollapse(
      [
        field('landing_page', 'STRING'),
        field('ctr', 'FLOAT', {
          calculated: { formula: '{{clicks}}/{{impressions}}', level: 'column' },
        }),
      ],
      ['landing_page', 'ctr'],
      EMPTY
    );
    expect(plan).toEqual({ kind: 'none', reason: 'calculated-not-liftable' });
  });

  it('groups a calculated dimension while aggregating an ordinary metric', () => {
    const plan = resolveAutoCollapse(
      [
        field('campaign_label', 'STRING', {
          calculated: { formula: "CONCAT(country, '-', campaign)", level: 'column' },
        }),
        field('sessions', 'INTEGER'),
      ],
      ['campaign_label', 'sessions'],
      EMPTY
    );
    expect(plan).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('aborts on an aggregate-level calculated field regardless of its role', () => {
    // country_rep defaults to dimension role (STRING category, no explicit override) — the
    // regression this pins: role must not be consulted before the aggregate-level abort, or a
    // dimension-role aggregate formula would fall through as a harmless grouping key instead of
    // aborting, letting `sessions` draw a ghost the backend never produces for this report.
    const plan = resolveAutoCollapse(
      [
        field('country_rep', 'STRING', {
          calculated: { formula: 'MAX(country)', level: 'metric' },
        }),
        field('sessions', 'INTEGER'),
      ],
      ['country_rep', 'sessions'],
      EMPTY
    );
    expect(plan).toEqual({ kind: 'none', reason: 'analyst-aggregated' });
  });

  it('refuses rather than group a column the native schema does not own', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING')],
      ['landing_page', 'b__ad_cost'],
      EMPTY
    );
    expect(plan).toEqual({ kind: 'none', reason: 'unresolvable-column' });
  });

  it('maps an aggregate plan to its per-column functions', () => {
    const plan = resolveAutoCollapse(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      EMPTY
    );
    expect([...autoAggregationByColumn(plan)]).toEqual([['sessions', 'SUM']]);
  });

  it('maps every non-aggregate plan to an empty map', () => {
    expect(autoAggregationByColumn({ kind: 'distinct' }).size).toBe(0);
    expect(autoAggregationByColumn({ kind: 'none', reason: 'analyst-aggregated' }).size).toBe(0);
  });
});
