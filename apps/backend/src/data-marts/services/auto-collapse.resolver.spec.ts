import { applyAutoCollapse, resolveAutoCollapse } from './auto-collapse.resolver';
import type { ReportLike } from '../dto/domain/report-like-read-plan';
import { serializeFormulaReference } from '../calculated-fields/formula-reference';
import { calculatedFieldLevelOf } from '../calculated-fields/calculated-field.utils';
import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

// The storage changes verdicts: `/` promotes on BigQuery and truncates on Athena/Redshift, so a
// ratio of two INTEGER columns lifts on one and not the other. BigQuery is the default here.
const reportWith = (
  fields: unknown[],
  columnConfig: string[] | null,
  extra = {},
  storageType: DataStorageType | null = DataStorageType.GOOGLE_BIGQUERY
): ReportLike =>
  ({
    dataMart: {
      schema: { fields },
      ...(storageType ? { storage: { type: storageType } } : {}),
    },
    columnConfig,
    ...extra,
  }) as unknown as ReportLike;

const field = (name: string, type: string, extra = {}) => ({
  name,
  type,
  status: 'CONNECTED',
  ...extra,
});

const ref = (name: string, path = '') => serializeFormulaReference({ path, field: name });

const calculatedFormulaOf = (report: ReportLike, name: string): string | undefined => {
  const found = (report.dataMart.schema?.fields ?? []).find(f => f.name === name);
  return found?.calculated?.formula;
};

describe('resolveAutoCollapse', () => {
  it('collapses to DISTINCT when the projection carries no metric', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('medium', 'STRING')],
      ['landing_page', 'medium']
    );
    expect(resolveAutoCollapse(report)).toEqual({ kind: 'distinct' });
  });

  it('applies the priority aggregation to a numeric metric', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('leaves a report the analyst already aggregated alone', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      { aggregationConfig: [{ column: 'sessions', function: 'AVG' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('leaves a report with a date-trunc bucket alone', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      { dateTruncConfig: [{ column: 'landing_page', unit: 'DAY' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('leaves a report with a Unique Count configured alone', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      { uniqueCountConfig: true }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('leaves a report alone when a FILTER names an aggregate-level calculated field', () => {
    // This report already runs `GROUP BY country, sessions HAVING SUM(revenue) > 100`. Collapsing
    // would SUM `sessions` per country and move the HAVING to a coarser grain: two moved numbers
    // on a report that had no duplicates to fix.
    const report = reportWith(
      [
        field('country', 'STRING'),
        field('sessions', 'INTEGER'),
        field('total_revenue', 'FLOAT', {
          calculated: { formula: `SUM(${ref('revenue')})`, level: 'metric' },
        }),
      ],
      ['country', 'sessions'],
      { filterConfig: [{ column: 'total_revenue', operator: 'gt', value: 100 }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('still collapses a report filtered on an ordinary column', () => {
    // The trigger above is the aggregate level, not the filter: a plain WHERE rule leaves the
    // query ungrouped, which is the shape this feature fixes.
    const report = reportWith(
      [field('country', 'STRING'), field('sessions', 'INTEGER')],
      ['country', 'sessions'],
      { filterConfig: [{ column: 'country', operator: 'eq', value: 'PL' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('still collapses a report filtered on a ROW-level calculated field', () => {
    // A row-level formula is a WHERE predicate, not a HAVING one.
    const report = reportWith(
      [
        field('country', 'STRING'),
        field('sessions', 'INTEGER'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['country', 'sessions'],
      { filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('re-derives a stale recorded level rather than trusting it, for a FILTER', () => {
    // `blendable-schema.service.ts` says outright that a recorded level is a cache actualization
    // does not maintain. This field says `column` while its formula now aggregates, so the
    // builders route it to HAVING; trusting the record would collapse on top of that.
    const report = reportWith(
      [
        field('country', 'STRING'),
        field('sessions', 'INTEGER'),
        field('total_revenue', 'FLOAT', {
          calculated: { formula: `SUM(${ref('revenue')})`, level: 'column' },
        }),
      ],
      ['country', 'sessions'],
      { filterConfig: [{ column: 'total_revenue', operator: 'gt', value: 100 }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('re-derives a stale recorded level rather than trusting it, for a PROJECTED column', () => {
    const report = reportWith(
      [
        field('country', 'STRING'),
        field('total_revenue', 'FLOAT', {
          calculated: { formula: `SUM(${ref('revenue')})`, level: 'column' },
        }),
      ],
      ['country', 'total_revenue']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('re-derives TRANSITIVELY: a formula whose dependency aggregates is aggregate too', () => {
    // The level the builders use walks the reference chain, so this resolver must walk it too —
    // `margin` reads row-level, and only its dependency gives it away.
    const report = reportWith(
      [
        field('country', 'STRING'),
        field('sessions', 'INTEGER'),
        field('total_revenue', 'FLOAT', {
          calculated: { formula: `SUM(${ref('revenue')})`, level: 'metric' },
        }),
        field('margin', 'FLOAT', {
          calculated: { formula: `${ref('total_revenue')}-1`, level: 'column' },
        }),
      ],
      ['country', 'sessions'],
      { filterConfig: [{ column: 'margin', operator: 'gt', value: 0 }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('refuses to lift a formula the report also FILTERS on', () => {
    // The lift makes `ctr` aggregate-level, and `routeFilterClauses` re-derives that from the
    // formula text — so `WHERE clicks/impressions > 0.5` would become
    // `HAVING SUM(clicks)/SUM(impressions) > 0.5`, which keeps a different set of rows. Rows
    // (10,10) and (0,90) pass the first and fail the second.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr'],
      { filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('refuses to lift a formula the report also SORTS on', () => {
    // The sort would order by a group-level value no row ever held.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr'],
      { sortConfig: [{ column: 'ctr', direction: 'desc' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('still lifts when the filter names a DIFFERENT column', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr'],
      { filterConfig: [{ column: 'landing_page', operator: 'eq', value: 'a' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [
        { column: 'ctr', formula: `SUM(${ref('clicks')})/SUM(${ref('impressions')})` },
      ],
    });
  });

  it('refuses the DISTINCT collapse when a sort names a numeric calculated dimension', () => {
    // The sort renders as `ORDER BY CAST(ROUND(cost) AS FLOAT64)`, never the alias, and that
    // expression is not among the DISTINCT items — rejected by BigQuery, Athena/Trino and
    // Redshift alike. The report ran fine uncollapsed, so the collapse is what must give way.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('cost', 'FLOAT'),
        field('cost_rounded', 'FLOAT', {
          aggregationRole: 'dimension',
          calculated: { formula: `ROUND(${ref('cost')})`, level: 'column' },
        }),
      ],
      ['landing_page', 'cost_rounded'],
      { sortConfig: [{ column: 'cost_rounded', direction: 'desc' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'sort-outside-projection',
    });
  });

  it('still collapses when the sorted calculated dimension takes no cast', () => {
    // A STRING-declared formula sorts as itself, so the DISTINCT list does contain it.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('medium', 'STRING'),
        field('label', 'STRING', {
          aggregationRole: 'dimension',
          calculated: { formula: `CONCAT(${ref('medium')}, '!')`, level: 'column' },
        }),
      ],
      ['landing_page', 'label'],
      { sortConfig: [{ column: 'label', direction: 'asc' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({ kind: 'distinct' });
  });

  it('leaves the AGGREGATED shape alone: there the same field is a grouping key', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('sessions', 'INTEGER'),
        field('cost', 'FLOAT'),
        field('cost_rounded', 'FLOAT', {
          aggregationRole: 'dimension',
          calculated: { formula: `ROUND(${ref('cost')})`, level: 'column' },
        }),
      ],
      ['landing_page', 'cost_rounded', 'sessions'],
      { sortConfig: [{ column: 'cost_rounded', direction: 'desc' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('refuses to lift a formula ANOTHER calculated field reads', () => {
    // The lift rewrites `margin` on a clone, and every level downstream is re-derived from that
    // clone — so `margin_label`, a dimension today, would come back aggregate-level, drop out of
    // the GROUP BY, and collapse the report to one row per date. Invisible from the original
    // schema, which is why the two aggregate-level checks above cannot catch it.
    const report = reportWith(
      [
        field('date', 'DATE'),
        field('revenue', 'FLOAT'),
        field('cost', 'FLOAT'),
        field('margin', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}-${ref('cost')}`, level: 'column' },
        }),
        field('margin_label', 'STRING', {
          calculated: {
            formula: `CONCAT('m:', CAST(${ref('margin')} AS STRING))`,
            level: 'column',
          },
        }),
      ],
      ['date', 'margin', 'margin_label']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('refuses when the reader of the lifted field is filtered on, one hop from the direct check', () => {
    // `pct` is not projected and not named by the filter check above — but it reads `ctr`, so the
    // lift makes it aggregate-level on the clone and its WHERE becomes a HAVING on group totals.
    const report = reportWith(
      [
        field('date', 'DATE'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
        field('pct', 'FLOAT', {
          calculated: { formula: `${ref('ctr')}*100`, level: 'column' },
        }),
      ],
      ['date', 'ctr'],
      { filterConfig: [{ column: 'pct', operator: 'gt', value: 5 }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('still lifts when the other calculated field is unrelated to the lifted one', () => {
    const report = reportWith(
      [
        field('date', 'DATE'),
        field('revenue', 'FLOAT'),
        field('cost', 'FLOAT'),
        field('margin', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}-${ref('cost')}`, level: 'column' },
        }),
        field('label', 'STRING', {
          calculated: { formula: `CONCAT('d:', CAST(${ref('date')} AS STRING))`, level: 'column' },
        }),
      ],
      ['date', 'margin']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [{ column: 'margin', formula: `SUM(${ref('revenue')}-${ref('cost')}\n)` }],
    });
  });

  it('refuses a report projecting a column the main schema cannot resolve', () => {
    // A joined column has no descriptor here, so its type is unknown. Grouping by it — which is
    // what a dimension would get — drops its duplicate rows and changes its total exactly as
    // DISTINCT would, and a joined numeric field IS a metric in the product's own model.
    const report = reportWith(
      [field('customer', 'STRING'), field('order_id', 'STRING')],
      ['customer', 'items__revenue']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'unresolvable-column',
    });
  });

  it('refuses the DISTINCT collapse when a sort names a column outside the projection', () => {
    // `SELECT DISTINCT \`landing_page\` … ORDER BY src.\`sessions\`` is rejected by every dialect,
    // while the same report WITHOUT the collapse is valid SQL the validator deliberately permits.
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page'],
      { sortConfig: [{ column: 'sessions', direction: 'desc' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'sort-outside-projection',
    });
  });

  it('refuses the AGGREGATE collapse when a sort names a column outside the projection', () => {
    // The aggregated shape resolves the unprojected name to a bare identifier sitting outside its
    // own GROUP BY.
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER'), field('other_col', 'STRING')],
      ['landing_page', 'sessions'],
      { sortConfig: [{ column: 'other_col', direction: 'asc' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'sort-outside-projection',
    });
  });

  it('refuses on a sort naming a column the schema does not own at all', () => {
    // A stale or joined sort column is outside the projection just the same.
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      { sortConfig: [{ column: 'costs__adCost', direction: 'asc' }] }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'sort-outside-projection',
    });
  });

  it('still collapses when every sort rule names a projected column', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions'],
      {
        sortConfig: [
          { column: 'sessions', direction: 'desc' },
          { column: 'landing_page', direction: 'asc' },
        ],
      }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
  });

  it('reports the analyst’s own aggregation ahead of an unprojected sort', () => {
    // The sort refusal must not relabel a report the analyst already aggregated.
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page'],
      {
        aggregationConfig: [{ column: 'sessions', function: 'AVG' }],
        sortConfig: [{ column: 'sessions', direction: 'desc' }],
      }
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('does not collapse a report with no explicit projection', () => {
    const report = reportWith([field('sessions', 'INTEGER')], null);
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'no-explicit-projection',
    });
  });

  it('aborts the whole collapse on a non-groupable column', () => {
    const report = reportWith(
      [field('payload', 'JSON'), field('sessions', 'INTEGER')],
      ['payload', 'sessions']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'non-groupable-column',
    });
  });

  it('aborts the whole collapse when a metric allows nothing', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER', { allowedAggregations: [] })],
      ['landing_page', 'sessions']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'no-allowed-aggregation',
    });
  });

  it('lifts a row-level calculated ratio to group level instead of picking SUM for it', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [
        { column: 'ctr', formula: `SUM(${ref('clicks')})/SUM(${ref('impressions')})` },
      ],
    });
  });

  it('lifts a calculated ratio alongside the report’s own metric', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'clicks', 'ctr']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'clicks', function: 'SUM' }],
      liftedFormulas: [
        { column: 'ctr', formula: `SUM(${ref('clicks')})/SUM(${ref('impressions')})` },
      ],
    });
  });

  it('refuses a row-level calculated field whose reference cannot be aggregated', () => {
    // `label` is a dimension: `MIN(label)` inside the formula would invent a value.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('label', 'STRING'),
        field('tagged', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('label')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'tagged']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('lifts the NULLIF-guarded ratio the formula linter tells analysts to write', () => {
    // `FORMULA_UNGUARDED_DIVISION` advises wrapping a denominator as NULLIF(it, 0), so complying
    // with it must not be the reason a report declines to collapse.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('revenue', 'FLOAT'),
        field('cost', 'FLOAT'),
        field('roas', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}/NULLIF(${ref('cost')},0)`, level: 'column' },
        }),
      ],
      ['landing_page', 'roas']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [
        { column: 'roas', formula: `SUM(${ref('revenue')})/NULLIF(SUM(${ref('cost')}),0)` },
      ],
    });
  });

  it('refuses a row-level calculated field the rewrite would not distribute over', () => {
    // SUM(quantity) * SUM(unit_price) is not SUM(quantity * unit_price), so the report keeps its
    // duplicate rows — the documented fallback.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('quantity', 'INTEGER'),
        field('unit_price', 'FLOAT'),
        field('line_revenue', 'FLOAT', {
          calculated: { formula: `${ref('quantity')}*${ref('unit_price')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'line_revenue']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  // The declared types whose division may be whole-number division. DECIMAL/NUMERIC are here
  // because the schema erases scale, so nothing can tell a money column from an already-rounded
  // one — over-refusing a scale-2 column on Athena is the deliberate cost.
  const WHOLE_NUMBER_TYPES = ['INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC'];
  const FRACTIONAL_TYPES = ['FLOAT', 'DOUBLE'];
  const TRUNCATING_STORAGES = [DataStorageType.AWS_ATHENA, DataStorageType.AWS_REDSHIFT];
  const PROMOTING_STORAGES = [
    DataStorageType.GOOGLE_BIGQUERY,
    DataStorageType.LEGACY_GOOGLE_BIGQUERY,
    DataStorageType.SNOWFLAKE,
    DataStorageType.DATABRICKS,
  ];

  const ctrReport = (columnType: string, storageType: DataStorageType | null) =>
    reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', columnType),
        field('impressions', columnType),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr'],
      {},
      storageType
    );
  const ctrLifted = {
    kind: 'aggregate',
    aggregations: [],
    liftedFormulas: [
      { column: 'ctr', formula: `SUM(${ref('clicks')})/SUM(${ref('impressions')})` },
    ],
  };
  const notLiftable = { kind: 'none', reason: 'calculated-not-liftable' };

  it('lifts the headline ratio wherever `/` promotes, whatever the columns are declared as', () => {
    for (const columnType of [...WHOLE_NUMBER_TYPES, ...FRACTIONAL_TYPES]) {
      for (const storageType of PROMOTING_STORAGES) {
        expect([columnType, storageType, resolveAutoCollapse(ctrReport(columnType, storageType))]) //
          .toEqual([columnType, storageType, ctrLifted]);
      }
    }
  });

  it('refuses the headline ratio over whole-number columns where `/` truncates', () => {
    // Rows (5,2) and (1,3) already display 2 and 0 on a truncating storage, so SUM/SUM answering 1
    // is a moved number. DECIMAL is here for the scale-erasure reason above, not as an integer.
    for (const columnType of WHOLE_NUMBER_TYPES) {
      for (const storageType of TRUNCATING_STORAGES) {
        expect([columnType, storageType, resolveAutoCollapse(ctrReport(columnType, storageType))]) //
          .toEqual([columnType, storageType, notLiftable]);
      }
    }
  });

  it('lifts it over fractional columns even where `/` truncates, since nothing rounds', () => {
    for (const columnType of FRACTIONAL_TYPES) {
      for (const storageType of TRUNCATING_STORAGES) {
        expect([columnType, storageType, resolveAutoCollapse(ctrReport(columnType, storageType))]) //
          .toEqual([columnType, storageType, ctrLifted]);
      }
    }
  });

  it('refuses when no storage is loaded, whatever the columns are declared as', () => {
    for (const columnType of [...WHOLE_NUMBER_TYPES, ...FRACTIONAL_TYPES]) {
      const verdict = resolveAutoCollapse(ctrReport(columnType, null));
      // FLOAT still lifts: the conservative default is about the storage, and a fractional column
      // cannot truncate on any of them.
      const expected = WHOLE_NUMBER_TYPES.includes(columnType) ? notLiftable : ctrLifted;
      expect([columnType, verdict]).toEqual([columnType, expected]);
    }
  });

  it('refuses to lift a formula over a field the analyst narrowed away from SUM', () => {
    // The lift recomputes from group totals, so SUM is the only valid wrapper: `MAX(cost)` would
    // honour governance and still not be `Σ(revenue - cost)`.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('revenue', 'FLOAT'),
        field('cost', 'FLOAT', { allowedAggregations: ['MIN', 'MAX'] }),
        field('margin', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}-${ref('cost')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'margin']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('lifts the same margin once both columns allow SUM', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('revenue', 'FLOAT'),
        field('cost', 'FLOAT'),
        field('margin', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}-${ref('cost')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'margin']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [{ column: 'margin', formula: `SUM(${ref('revenue')}-${ref('cost')}\n)` }],
    });
  });

  it('refuses dividing a whole-number column by a literal on a truncating storage', () => {
    // Both facts are this layer's to know, so the lift sees only the consequence.
    const literalDivisorReport = (columnType: string, storageType: DataStorageType) =>
      reportWith(
        [
          field('landing_page', 'STRING'),
          field('amount_cents', columnType),
          field('amount', 'FLOAT', {
            calculated: { formula: `${ref('amount_cents')}/100`, level: 'column' },
          }),
        ],
        ['landing_page', 'amount'],
        {},
        storageType
      );
    for (const columnType of WHOLE_NUMBER_TYPES) {
      expect([
        columnType,
        resolveAutoCollapse(literalDivisorReport(columnType, DataStorageType.AWS_ATHENA)),
      ]).toEqual([columnType, notLiftable]);
    }
    // The same column on a promoting storage, and a fractional column on the truncating one.
    expect(resolveAutoCollapse(literalDivisorReport('BIGINT', DataStorageType.SNOWFLAKE))).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [{ column: 'amount', formula: `SUM(${ref('amount_cents')}/100\n)` }],
    });
    expect(resolveAutoCollapse(literalDivisorReport('FLOAT', DataStorageType.AWS_ATHENA))).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [{ column: 'amount', formula: `SUM(${ref('amount_cents')}/100\n)` }],
    });
  });

  it('lifts the same shape once nothing truncates — a FLOAT column, or a promoting storage', () => {
    const integerOnBigQuery = reportWith(
      [
        field('landing_page', 'STRING'),
        field('amount_cents', 'BIGINT'),
        field('amount', 'FLOAT', {
          calculated: { formula: `${ref('amount_cents')}/100`, level: 'column' },
        }),
      ],
      ['landing_page', 'amount']
    );
    expect(resolveAutoCollapse(integerOnBigQuery)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [{ column: 'amount', formula: `SUM(${ref('amount_cents')}/100\n)` }],
    });

    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('amount_cents', 'FLOAT'),
        field('amount', 'FLOAT', {
          calculated: { formula: `${ref('amount_cents')}/100`, level: 'column' },
        }),
      ],
      ['landing_page', 'amount']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [{ column: 'amount', formula: `SUM(${ref('amount_cents')}/100\n)` }],
    });
  });

  it('refuses a calculated field whose reference sits alone in a divisor', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('sessions', 'INTEGER'),
        field('per_session', 'FLOAT', {
          calculated: { formula: `1/${ref('sessions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'per_session']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('refuses to lift a calculated field nested inside a RECORD', () => {
    // `calculatedFieldsOf` reads top-level fields only, so a lift for `metrics.ctr` would be built
    // and then silently ignored — the report would group by a per-row ratio. The dotted path is the
    // tell: `descriptor.name` is `metrics.ctr` while `descriptor.field.name` is just `ctr`.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('metrics', 'RECORD', {
          fields: [
            field('clicks', 'INTEGER'),
            field('impressions', 'INTEGER'),
            field('ctr', 'FLOAT', {
              calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
            }),
          ],
        }),
      ],
      ['landing_page', 'metrics.ctr']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('lifts every liftable formula when a report selects more than one', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('revenue', 'FLOAT'),
        field('cost', 'FLOAT'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
        field('roas', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}/${ref('cost')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr', 'roas']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'aggregate',
      aggregations: [],
      liftedFormulas: [
        { column: 'ctr', formula: `SUM(${ref('clicks')})/SUM(${ref('impressions')})` },
        { column: 'roas', formula: `SUM(${ref('revenue')})/SUM(${ref('cost')})` },
      ],
    });
  });

  it('refuses a row-level calculated field that reads a joined Data Mart', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('cpc', 'FLOAT', {
          calculated: { formula: `${ref('cost', 'ads')}/${ref('clicks')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'cpc']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('refuses a row-level calculated field that reads another calculated field', () => {
    // Even a dependency that does not aggregate today may start to, and wrapping it would nest
    // aggregates. A dependency that ALREADY aggregates never reaches the lift: it makes this
    // field aggregate-level too, which the check above catches as `analyst-aggregated`.
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('net_amount', 'FLOAT', {
          calculated: { formula: `${ref('amount')}*2`, level: 'column' },
        }),
        field('rpc', 'FLOAT', {
          calculated: { formula: `${ref('net_amount')}/${ref('clicks')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'rpc']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'calculated-not-liftable',
    });
  });

  it('reads a row-level field whose dependency aggregates as aggregate-level, not unliftable', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('revenue', 'FLOAT', {
          calculated: { formula: `SUM(${ref('amount')})`, level: 'metric' },
        }),
        field('rpc', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}/${ref('clicks')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'rpc']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });

  it('refuses to lift a calculated metric the analyst forbade aggregating', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          allowedAggregations: [],
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'no-allowed-aggregation',
    });
  });

  it('groups by a row-level calculated DIMENSION instead of lifting it', () => {
    const report = reportWith(
      [
        field('country', 'STRING'),
        field('campaign', 'STRING'),
        field('label', 'STRING', {
          calculated: {
            formula: `CONCAT(${ref('country')},'-',${ref('campaign')})`,
            level: 'column',
          },
        }),
      ],
      ['label']
    );
    expect(resolveAutoCollapse(report)).toEqual({ kind: 'distinct' });
  });

  it('refuses rather than aggregate or group a column the main schema does not own', () => {
    // A blended column name reaches `columnConfig` with no native descriptor, so its type is
    // unknown. It must not be aggregated — that is the fan-out multiplication a join causes — but
    // it must not become a grouping key either: grouping drops its duplicate rows and moves its
    // total. Joined fields are #6926's subject; until then the whole report is left alone.
    const report = reportWith([field('landing_page', 'STRING')], ['landing_page', 'costs__adCost']);
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'unresolvable-column',
    });
  });

  it('treats an aggregate-level calculated field as already aggregated', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('revenue', 'FLOAT', { calculated: { formula: 'SUM({{amount}})', level: 'metric' } }),
      ],
      ['landing_page', 'revenue']
    );
    expect(resolveAutoCollapse(report)).toEqual({
      kind: 'none',
      reason: 'analyst-aggregated',
    });
  });
});

describe('applyAutoCollapse', () => {
  const ratioReport = () =>
    reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr']
    );

  it('carries the lifted formula on the cloned schema', () => {
    const report = ratioReport();
    const { report: effective } = applyAutoCollapse(report);
    expect(calculatedFormulaOf(effective, 'ctr')).toBe(
      `SUM(${ref('clicks')})/SUM(${ref('impressions')})`
    );
  });

  it('leaves the stored schema untouched — derive, never persist', () => {
    const report = ratioReport();
    const storedField = report.dataMart.schema!.fields.find(f => f.name === 'ctr');
    applyAutoCollapse(report);
    expect(calculatedFormulaOf(report, 'ctr')).toBe(`${ref('clicks')}/${ref('impressions')}`);
    expect(report.dataMart.schema!.fields.find(f => f.name === 'ctr')).toBe(storedField);
  });

  it('clones only the Data Mart and schema, sharing every unchanged field', () => {
    const report = ratioReport();
    const { report: effective } = applyAutoCollapse(report);
    expect(effective.dataMart).not.toBe(report.dataMart);
    expect(effective.dataMart.schema).not.toBe(report.dataMart.schema);
    const untouched = (name: string) =>
      effective.dataMart.schema!.fields.find(f => f.name === name);
    expect(untouched('clicks')).toBe(report.dataMart.schema!.fields.find(f => f.name === 'clicks'));
  });

  it('keeps the Data Mart entity prototype so its accessors survive the clone', () => {
    const report = ratioReport();
    class FakeDataMart {
      schema?: unknown;
      businessOwners: { userId: string }[] = [{ userId: 'u1' }];
      get businessOwnerIds(): string[] {
        return this.businessOwners.map(o => o.userId);
      }
    }
    const entity = new FakeDataMart();
    entity.schema = report.dataMart.schema;
    (report as { dataMart: unknown }).dataMart = entity;

    const { report: effective } = applyAutoCollapse(report);
    expect((effective.dataMart as unknown as FakeDataMart).businessOwnerIds).toEqual(['u1']);
  });

  it('sets `distinct` on the clone and nothing else, leaving the stored report untouched', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('medium', 'STRING')],
      ['landing_page', 'medium']
    );
    const { report: effective, plan } = applyAutoCollapse(report);

    expect(plan).toEqual({ kind: 'distinct' });
    expect((effective as { distinct?: boolean }).distinct).toBe(true);
    expect(effective.aggregationConfig).toBeUndefined();
    expect((report as { distinct?: boolean }).distinct).toBeUndefined();
    expect(effective).not.toBe(report);
  });

  it('returns the SAME object when there is nothing to collapse', () => {
    // A refusal must not clone: a caller comparing identity is entitled to see no change at all.
    const report = reportWith([field('landing_page', 'STRING')], null);
    const { report: effective, plan } = applyAutoCollapse(report);

    expect(plan).toEqual({ kind: 'none', reason: 'no-explicit-projection' });
    expect(effective).toBe(report);
  });

  it('keeps the report prototype on every branch, not just the lifted one', () => {
    // `Report` exposes `ownerIds` as an accessor and `isEmailBasedDestination` as a method. A
    // spread drops both while still typechecking as `Report`, so the loss is silent.
    class FakeReport {
      dataMart = { schema: { fields: [field('landing_page', 'STRING')] } };
      columnConfig = ['landing_page'];
      get ownerIds() {
        return ['u1'];
      }
      isEmailBasedDestination() {
        return true;
      }
    }
    const report = new FakeReport() as unknown as ReportLike;
    const { report: effective, plan } = applyAutoCollapse(report);
    expect(plan).toEqual({ kind: 'distinct' });
    const asFake = effective as unknown as FakeReport;
    expect(asFake.ownerIds).toEqual(['u1']);
    expect(asFake.isEmailBasedDestination()).toBe(true);
  });

  it('keeps it on the LIFT path too, which clones the schema on its way through', () => {
    // The distinct branch above returns early; this one goes through `withLiftedFormulas`, whose
    // own clone used to be handed back with a spread that undid the prototype it just preserved.
    class FakeLiftReport {
      dataMart = {
        schema: {
          fields: [
            field('landing_page', 'STRING'),
            field('revenue', 'FLOAT'),
            field('cost', 'FLOAT'),
            field('margin', 'FLOAT', {
              calculated: { formula: `${ref('revenue')}-${ref('cost')}`, level: 'column' },
            }),
          ],
        },
        storage: { type: DataStorageType.GOOGLE_BIGQUERY },
      };
      columnConfig = ['landing_page', 'margin'];
      get ownerIds() {
        return ['u2'];
      }
      isEmailBasedDestination() {
        return true;
      }
    }
    const report = new FakeLiftReport() as unknown as ReportLike;
    const { report: effective, plan } = applyAutoCollapse(report);

    expect(plan.kind).toBe('aggregate');
    const asFake = effective as unknown as FakeLiftReport;
    expect(asFake.ownerIds).toEqual(['u2']);
    expect(asFake.isEmailBasedDestination()).toBe(true);
  });

  it('flips the composer’s own level verdict, which is what introduces the GROUP BY', () => {
    // `calculatedFieldLevelOf` decides whether a calculated field is a GROUP BY key, and it
    // re-derives from the formula text — so substituting on the clone is the whole mechanism.
    // Pinned here so a refactor cannot route the formula elsewhere and leave a ratio grouped.
    const report = ratioReport();
    const { report: effective } = applyAutoCollapse(report);
    const levelOf = (from: ReportLike) => {
      const fields = (from.dataMart.schema?.fields ?? []) as DataMartSchemaField[];
      return calculatedFieldLevelOf(fields.find(f => f.name === 'ctr')!, fields);
    };
    expect(levelOf(report)).toBe('column');
    expect(levelOf(effective)).toBe('metric');
  });

  it('substitutes EVERY lifted formula on the clone, not just the first', () => {
    const report = reportWith(
      [
        field('landing_page', 'STRING'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('revenue', 'FLOAT'),
        field('cost', 'FLOAT'),
        field('ctr', 'FLOAT', {
          calculated: { formula: `${ref('clicks')}/${ref('impressions')}`, level: 'column' },
        }),
        field('roas', 'FLOAT', {
          calculated: { formula: `${ref('revenue')}/${ref('cost')}`, level: 'column' },
        }),
      ],
      ['landing_page', 'ctr', 'roas']
    );
    const { report: effective } = applyAutoCollapse(report);
    expect(calculatedFormulaOf(effective, 'ctr')).toBe(
      `SUM(${ref('clicks')})/SUM(${ref('impressions')})`
    );
    expect(calculatedFormulaOf(effective, 'roas')).toBe(
      `SUM(${ref('revenue')})/SUM(${ref('cost')})`
    );
  });

  it('does not clone the Data Mart when nothing is lifted', () => {
    const report = reportWith(
      [field('landing_page', 'STRING'), field('sessions', 'INTEGER')],
      ['landing_page', 'sessions']
    );
    const { report: effective, plan } = applyAutoCollapse(report);
    expect(plan).toEqual({
      kind: 'aggregate',
      aggregations: [{ column: 'sessions', function: 'SUM' }],
    });
    expect(effective.dataMart).toBe(report.dataMart);
    expect(effective.aggregationConfig).toEqual([{ column: 'sessions', function: 'SUM' }]);
  });
});
