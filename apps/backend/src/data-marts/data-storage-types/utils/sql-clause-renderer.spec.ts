import {
  CalculatedFieldRenderOptions,
  CalculatedFieldPlan,
  ColumnRefResolver,
  SqlClauseRenderer,
  RenderedClause,
  assertNoHavingRules,
  buildFilterTypeResolver,
  composePlainSelectBody,
} from './sql-clause-renderer';
import { DataStorageType } from '../enums/data-storage-type.enum';
import type {
  FormulaReference,
  FormulaSpanReplacement,
} from '../../calculated-fields/formula-reference';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { UNIQUE_COUNT_LABEL } from '../../dto/schemas/aggregation-labels';
import {
  REPORT_AGGREGATE_FUNCTIONS,
  type ReportAggregateFunction,
} from '../../dto/schemas/aggregate-function.schema';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { RoutedFilterRule } from '../../dto/domain/filter-clause';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { DateTruncUnit } from '../../dto/schemas/date-trunc-config.schema';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';
import { AthenaClauseRenderer } from '../athena/services/athena-clause-renderer';
import { RedshiftClauseRenderer } from '../redshift/services/redshift-clause-renderer';
import { SnowflakeClauseRenderer } from '../snowflake/services/snowflake-clause-renderer';
import { DatabricksClauseRenderer } from '../databricks/services/databricks-clause-renderer';
import { BigQueryFieldType } from '../bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from '../athena/enums/athena-field-type.enum';
import { RedshiftFieldType } from '../redshift/enums/redshift-field-type.enum';
import { SnowflakeFieldType } from '../snowflake/enums/snowflake-field-type.enum';
import { DatabricksFieldType } from '../databricks/enums/databricks-field-type.enum';
import {
  EXACT_NUMERIC_TYPES,
  categorizeFieldType,
  isFloatingPointType,
  isIntegerType,
} from '../../dto/schemas/field-type-category';

class StubRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return `"${name}"`;
  }
  public override textCastType(): string {
    return 'STRING';
  }
  // Two entries, not one: the integer-exclusion tests below have to prove that an INTEGER
  // declaration is refused a cast BECAUSE it is an integer, not because this stub happens to
  // state no target for it — so an integer target must exist to be declined.
  public override castTypeForDeclaredType(declaredType: string): string | undefined {
    const normalized = declaredType.trim().toUpperCase();
    if (normalized === 'FLOAT') return 'DOUBLE';
    if (normalized === 'INTEGER') return 'INT64';
    return undefined;
  }
  protected renderDateTrunc(columnRef: string, unit: DateTruncUnit): string {
    return `DATE_TRUNC(${columnRef}, ${unit})`;
  }
  protected renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    columnRef: string
  ): RenderedClause {
    if (rule.operator === 'eq') {
      return {
        sql: `${columnRef} = @${paramName}`,
        params: [{ name: paramName, value: rule.value }],
      };
    }
    if (rule.operator === 'is_empty') {
      return { sql: `${columnRef} IS NULL`, params: [] };
    }
    return { sql: '1=1', params: [] };
  }
}

describe('SqlClauseRenderer', () => {
  const r = new StubRenderer();

  it('renders empty when no clauses given', () => {
    expect(r.renderWhere([]).sql).toBe('');
    expect(r.renderOrderBy([]).sql).toBe('');
    expect(r.renderLimit(null).sql).toBe('');
  });

  it('renders single filter as WHERE', () => {
    const out = r.renderWhere([{ column: 'a', operator: 'eq', value: 1 }]);
    expect(out.sql).toBe('\nWHERE "a" = @p0');
    expect(out.params).toEqual([{ name: 'p0', value: 1 }]);
  });

  it('joins multiple filters with AND and increments param indices correctly', () => {
    const out = r.renderWhere([
      { column: 'a', operator: 'eq', value: 1 },
      { column: 'b', operator: 'is_empty' },
    ]);
    expect(out.sql).toBe('\nWHERE "a" = @p0\n  AND "b" IS NULL');
    expect(out.params).toEqual([{ name: 'p0', value: 1 }]);
  });

  it('renders ORDER BY with multiple columns', () => {
    const sort: SortRule[] = [
      { column: 'date', direction: 'desc' },
      { column: 'amount', direction: 'asc' },
    ];
    expect(r.renderOrderBy(sort).sql).toBe('\nORDER BY\n  "date" DESC,\n  "amount" ASC');
  });

  it('renders LIMIT', () => {
    expect(r.renderLimit(100).sql).toBe('\nLIMIT 100');
    expect(r.renderLimit(0).sql).toBe('\nLIMIT 0');
  });

  it('rejects fractional, negative, NaN, and Infinity limits as defence-in-depth', () => {
    expect(() => r.renderLimit(10.7)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(-1)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(NaN)).toThrow(/Invalid LIMIT value/);
    expect(() => r.renderLimit(Infinity)).toThrow(/Invalid LIMIT value/);
  });

  it('omits LIMIT when null or undefined', () => {
    expect(r.renderLimit(null).sql).toBe('');
    expect(r.renderLimit(undefined).sql).toBe('');
  });

  describe('renderAggregateExpression — base throws for dialect-specific functions', () => {
    it('STRING_AGG throws "not supported for this storage"', () => {
      expect(() =>
        r.renderAggregatedSelect(['cat'], [{ column: 'cat', function: 'STRING_AGG' }])
      ).toThrow(/not supported for this storage/);
    });

    it('P50 throws "not supported for this storage"', () => {
      expect(() =>
        r.renderAggregatedSelect(['price'], [{ column: 'price', function: 'P50' }])
      ).toThrow(/not supported for this storage/);
    });
  });

  describe('renderAggregatedSelect — output naming, alias map', () => {
    it('aliases an aggregated metric to the suffixed label (FN argument stays the raw column)', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      expect(out.selectSql).toBe('"channel",\n  SUM("revenue") AS "revenue | SUM"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
    });

    it('returns aliasByColumn mapping each projected column to its quoted output alias', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      expect(out.aliasByColumn.get('channel')).toBe('"channel"');
      expect(out.aliasByColumn.get('revenue')).toBe('"revenue | SUM"');
    });

    it('aliasByColumn maps a date-trunc dimension to its quoted plain column name', () => {
      const out = r.renderAggregatedSelect(
        ['date', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        new Map([['date', 'MONTH']])
      );
      expect(out.aliasByColumn.get('date')).toBe('"date"');
      expect(out.aliasByColumn.get('revenue')).toBe('"revenue | SUM"');
    });

    it('buildAggregatedAliasResolver routes a metric to its suffixed alias and falls back to quoting', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      const resolver = r.buildAggregatedAliasResolver(out.aliasByColumn);
      expect(resolver('revenue')).toBe('"revenue | SUM"');
      expect(resolver('channel')).toBe('"channel"');
      expect(resolver('unknown')).toBe('"unknown"');
    });

    it('ORDER BY on a metric references the suffixed alias via the resolver', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }]
      );
      const orderBy = r.renderOrderBy(
        [{ column: 'revenue', direction: 'desc' }],
        r.buildAggregatedAliasResolver(out.aliasByColumn)
      );
      expect(orderBy.sql).toBe('\nORDER BY\n  "revenue | SUM" DESC');
    });
  });

  describe('renderAggregatedSelect — multiple functions on one column', () => {
    it('emits one SELECT item per function for a multi-aggregated column, in rule order', () => {
      const out = r.renderAggregatedSelect(
        ['date', 'amount'],
        [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
        ]
      );
      expect(out.selectSql).toBe(
        '"date",\n  SUM("amount") AS "amount | SUM",\n  AVG("amount") AS "amount | AVG"'
      );
      // The lone dimension is the only GROUP BY key; a multi-aggregated column is never a key.
      expect(out.groupBySql).toBe('\nGROUP BY\n  "date"');
    });

    it('maps a multi-aggregated column to its FIRST function alias (ORDER BY resolves to it)', () => {
      const out = r.renderAggregatedSelect(
        ['date', 'amount'],
        [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
        ]
      );
      expect(out.aliasByColumn.get('amount')).toBe('"amount | SUM"');
    });

    it('emits one item per function per column in qualified (blended) mode', () => {
      const qualify: ColumnRefResolver = column => `t."${column}"`;
      const out = r.renderAggregatedSelect(
        ['date', 'amount'],
        [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
        ],
        undefined,
        { qualifyColumn: qualify }
      );
      expect(out.selectSql).toBe(
        't."date" AS "date",\n  SUM(t."amount") AS "amount | SUM",\n  AVG(t."amount") AS "amount | AVG"'
      );
      expect(out.groupBySql).toBe('\nGROUP BY\n  t."date"');
    });
  });

  describe('renderAggregatedSelect — qualified mode (blended post-join aggregation)', () => {
    const qualify: ColumnRefResolver = column => `t."${column}"`;

    it('qualifies the FN argument and keeps the output alias unqualified', () => {
      const out = r.renderAggregatedSelect(
        ['d', 'x'],
        [{ column: 'x', function: 'SUM' }],
        undefined,
        {
          qualifyColumn: qualify,
        }
      );
      expect(out.selectSql).toBe('t."d" AS "d",\n  SUM(t."x") AS "x | SUM"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  t."d"');
    });

    it('aliases a plain dimension to its unqualified name (explicit AS in qualified mode)', () => {
      const out = r.renderAggregatedSelect(['d'], [], undefined, { qualifyColumn: qualify });
      expect(out.selectSql).toBe('t."d" AS "d"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  t."d"');
    });

    it('truncates a qualified date-trunc dimension and groups by the qualified truncated expr', () => {
      const out = r.renderAggregatedSelect(
        ['d', 'x'],
        [{ column: 'x', function: 'SUM' }],
        new Map([['d', 'MONTH']]),
        { qualifyColumn: qualify }
      );
      expect(out.selectSql).toBe('DATE_TRUNC(t."d", MONTH) AS "d",\n  SUM(t."x") AS "x | SUM"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  DATE_TRUNC(t."d", MONTH)');
    });

    it('aliasByColumn maps to the unqualified output alias in qualified mode', () => {
      const out = r.renderAggregatedSelect(
        ['d', 'x'],
        [{ column: 'x', function: 'SUM' }],
        undefined,
        {
          qualifyColumn: qualify,
        }
      );
      expect(out.aliasByColumn.get('d')).toBe('"d"');
      expect(out.aliasByColumn.get('x')).toBe('"x | SUM"');
    });
  });

  describe('column qualification via ColumnRefResolver', () => {
    const qualify: ColumnRefResolver = column => `main."${column}"`;

    it('passes the resolved column reference into WHERE fragments', () => {
      const out = r.renderWhere(
        [
          { column: 'a', operator: 'eq', value: 1 },
          { column: 'b', operator: 'is_empty' },
        ],
        qualify
      );
      expect(out.sql).toBe('\nWHERE main."a" = @p0\n  AND main."b" IS NULL');
    });

    it('passes the resolved column reference into ORDER BY fragments', () => {
      const out = r.renderOrderBy(
        [
          { column: 'date', direction: 'desc' },
          { column: 'amount', direction: 'asc' },
        ],
        qualify
      );
      expect(out.sql).toBe('\nORDER BY\n  main."date" DESC,\n  main."amount" ASC');
    });

    it('lets the resolver route different columns to different prefixes', () => {
      const routed: ColumnRefResolver = column =>
        column === 'b' ? `orders."${column}"` : `main."${column}"`;
      const out = r.renderWhere(
        [
          { column: 'a', operator: 'eq', value: 1 },
          { column: 'b', operator: 'eq', value: 2 },
        ],
        routed
      );
      expect(out.sql).toBe('\nWHERE main."a" = @p0\n  AND orders."b" = @p1');
    });
  });

  describe('renderAggregatedSelect — Unique Count (includeUniqueCount)', () => {
    it('single PK column → COUNT(DISTINCT col) appended, no GROUP BY key added', () => {
      const out = r.renderAggregatedSelect(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        undefined,
        { includeUniqueCount: true, primaryKeyColumns: ['session_id'] }
      );
      expect(out.selectSql).toContain(`COUNT(DISTINCT "session_id") AS "${UNIQUE_COUNT_LABEL}"`);
      expect(out.groupBySql).toBe('\nGROUP BY\n  "channel"');
    });

    it('composite PK → COUNT(DISTINCT CASE WHEN ... IS NULL ... THEN NULL ELSE CONCAT ... END) appended', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['c1', 'c2'],
      });
      expect(out.selectSql).toContain(
        `COUNT(DISTINCT CASE WHEN "c1" IS NULL OR "c2" IS NULL THEN NULL ELSE CONCAT(CAST(LENGTH(CAST("c1" AS STRING)) AS STRING), '␟', CAST("c1" AS STRING), CAST(LENGTH(CAST("c2" AS STRING)) AS STRING), '␟', CAST("c2" AS STRING)) END) AS "${UNIQUE_COUNT_LABEL}"`
      );
    });

    it('flag off → Unique Count NOT present', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: false,
        primaryKeyColumns: ['id'],
      });
      expect(out.selectSql).not.toContain(UNIQUE_COUNT_LABEL);
    });

    it('empty primaryKeyColumns → Unique Count NOT present', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: [],
      });
      expect(out.selectSql).not.toContain(UNIQUE_COUNT_LABEL);
    });

    it('Unique Count is appended after the projected dimensions', () => {
      const out = r.renderAggregatedSelect(['channel'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['id'],
      });
      const dimIdx = out.selectSql.indexOf('"channel"');
      const ucIdx = out.selectSql.indexOf(UNIQUE_COUNT_LABEL);
      expect(dimIdx).toBeGreaterThan(-1);
      expect(ucIdx).toBeGreaterThan(dimIdx);
    });
  });

  describe('renderAggregatedSelect — calculated fields (main-owner)', () => {
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';

    it('projects a main-owner calculated field in the outer SELECT', () => {
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        qualifyColumn: c => `main.${c}`,
        calculatedFields: [
          { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
        ],
      });
      expect(out.selectSql).toContain(
        'SUM(main.clicks) / NULLIF(SUM(main.impressions), 0) AS "ctr"'
      );
      // The metric is an aggregate: it must never become a grouping key.
      expect(out.groupBySql).not.toContain('ctr');
    });

    it('projects a calculated field alongside a real aggregation on another column', () => {
      const out = r.renderAggregatedSelect(
        ['country', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        undefined,
        {
          calculatedFields: [
            { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
          ],
        }
      );
      expect(out.selectSql).toBe(
        '"country",\n  SUM("revenue") AS "revenue | SUM",\n  ' +
          'SUM("clicks") / NULLIF(SUM("impressions"), 0) AS "ctr"'
      );
      // 'revenue' is its own aggregated metric, not a grouping key — only 'country' groups.
      expect(out.groupBySql).toBe('\nGROUP BY\n  "country"');
    });

    it('projects a calculated field alongside a date-trunc dimension', () => {
      const out = r.renderAggregatedSelect(['date'], [], new Map([['date', 'MONTH']]), {
        calculatedFields: [
          { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
        ],
      });
      expect(out.selectSql).toBe(
        'DATE_TRUNC("date", MONTH) AS "date",\n  ' +
          'SUM("clicks") / NULLIF(SUM("impressions"), 0) AS "ctr"'
      );
      expect(out.groupBySql).toBe('\nGROUP BY\n  DATE_TRUNC("date", MONTH)');
    });

    it('renders a formula referencing a field the reporting menu hides — hidden is legal inside a formula', () => {
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        calculatedFields: [
          {
            outputName: 'hidden_ratio',
            type: 'FLOAT',
            formula:
              'SUM({{ref field="internal_clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
            level: 'metric',
          },
        ],
      });
      expect(out.selectSql).toContain(
        'SUM("internal_clicks") / NULLIF(SUM("impressions"), 0) AS "hidden_ratio"'
      );
    });

    it('supports a metric with no dimensions at all — a single grand-total row, no GROUP BY', () => {
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
        ],
      });
      expect(out.selectSql).toBe('SUM("clicks") / NULLIF(SUM("impressions"), 0) AS "ctr"');
      expect(out.groupBySql).toBe('');
    });

    it('no calculatedFields option → legacy shape untouched', () => {
      const out = r.renderAggregatedSelect(['channel'], [{ column: 'channel', function: 'COUNT' }]);
      expect(out.selectSql).toBe('COUNT("channel") AS "channel | COUNT"');
    });
  });

  // A row-level calculated field is a DIMENSION: when the report groups at all,
  // the field joins the grouping keys as its own rendered expression — never as the columns that
  // expression happens to mention, which is a finer grain that leaves the field's own value
  // duplicated in a report grouped by it.
  describe('renderAggregatedSelect — a ROW-LEVEL calculated field', () => {
    const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';
    const SESSION_KEY_SQL = 'CONCAT("session_id", "user_id")';
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
    const rowLevel = {
      outputName: 'session_key',
      type: 'STRING',
      formula: SESSION_KEY_FORMULA,
      level: 'column' as const,
    };

    it('groups by the rendered expression, byte-identical to what it projects', () => {
      const out = r.renderAggregatedSelect(
        ['country', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        undefined,
        { calculatedFields: [rowLevel] }
      );

      expect(out.selectSql).toBe(
        '"country",\n  SUM("revenue") AS "revenue | SUM",\n  ' +
          `${SESSION_KEY_SQL} AS "session_key"`
      );
      expect(out.groupBySql).toBe(`\nGROUP BY\n  "country",\n  ${SESSION_KEY_SQL}`);
    });

    // `groupByParts` is consumed POSITIONALLY (`buildKeptGroupsJoinPairs`) and counted
    // (`assertKeptGroupKeys`), and the calculated loop runs after the column loop — so a
    // row-level key lands LAST, after every plain/date-trunc dimension. Any caller building a
    // parallel `dimensions` list has to match this order, so state it rather than imply it.
    it('emits the row-level key LAST, after every column key', () => {
      const out = r.renderAggregatedSelect(['country', 'date'], [], new Map([['date', 'MONTH']]), {
        calculatedFields: [rowLevel],
      });

      expect(out.groupByParts).toEqual(['"country"', 'DATE_TRUNC("date", MONTH)', SESSION_KEY_SQL]);
    });

    // `calculatedFields` is NOT the key order. An AGGREGATE-level plan contributes no key at all,
    // so the row-level keys are a FILTERED SUBSEQUENCE of that array — a caller pairing
    // `dimensions[i]` against the unfiltered list shifts every later key onto the wrong dimension,
    // and the kept-groups join is exactly such a caller (`buildKeptGroupsJoinPairs`).
    it('appends only the row-level keys, in plan order, skipping an aggregate-level one', () => {
      const userKey = {
        outputName: 'user_key',
        type: 'STRING',
        formula: 'UPPER({{ref field="user_id"}})',
        level: 'column' as const,
      };
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        calculatedFields: [
          { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
          rowLevel,
          userKey,
        ],
      });

      expect(out.groupByParts).toEqual(['"country"', SESSION_KEY_SQL, 'UPPER("user_id")']);
      // The aggregate one is still PROJECTED, in its own position in the select list — it is
      // dropped from the KEYS, not from the query.
      expect(out.selectSql).toBe(
        '"country",\n  SUM("clicks") / NULLIF(SUM("impressions"), 0) AS "ctr",\n  ' +
          `${SESSION_KEY_SQL} AS "session_key",\n  UPPER("user_id") AS "user_key"`
      );
    });

    // ORDER BY on an aggregated query resolves through `aliasByColumn`. The metric loop never
    // wrote to it, so sorting on a row-level field worked only by the accident that the fallback
    // quotes the column name into the same text as the SELECT alias.
    it('registers its output alias so ORDER BY resolves through the alias map', () => {
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        qualifyColumn: c => `main.${c}`,
        calculatedFields: [rowLevel],
      });

      expect(out.aliasByColumn.get('session_key')).toBe('"session_key"');
    });

    // An AGGREGATING formula keeps the shipped behaviour: projected, never a grouping key.
    it('leaves an aggregating calculated field out of the grouping keys', () => {
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        calculatedFields: [
          { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
        ],
      });

      expect(out.groupByParts).toEqual(['"country"']);
      expect(out.aliasByColumn.has('ctr')).toBe(false);
    });

    // A metric sleeve renders this same dimension a SECOND time, in its own CTE, and joins back on
    // it — so the two strings must match byte for byte. Both sides therefore render through ONE
    // method instead of deriving the string twice, exactly as `renderDateTruncExpression` already
    // arranges for a bucketed dimension.
    describe('renderRowLevelDimensionExpression — the one seat both sides render through', () => {
      const qualifyColumn: ColumnRefResolver = c => `main.${c}`;
      // The blended builder's own resolver shape (`resolveFormulaReference`): it resolves a
      // reference through the blend's unified names, INSTEAD of the plain column qualifier — spelled
      // differently here so a channel silently dropped shows up as a different string.
      const resolveCalculatedFieldReference = (ref: FormulaReference): string =>
        `unified.${ref.path === '' ? ref.field : `${ref.path}__${ref.field}`}`;
      const USER_ID_TAG = '{{ref field="user_id"}}';
      const replacements: ReadonlyMap<string, readonly FormulaSpanReplacement[]> = new Map([
        [
          rowLevel.outputName,
          [
            {
              start: SESSION_KEY_FORMULA.indexOf(USER_ID_TAG),
              end: SESSION_KEY_FORMULA.indexOf(USER_ID_TAG) + USER_ID_TAG.length,
              sql: 'sleeve_1._val',
            },
          ],
        ],
      ]);

      // Each case names the expression it must produce, because "equals what renderAggregatedSelect
      // groups by" is true by construction once both go through this method — it pins the two sides
      // together but says nothing about WHICH string they agree on. The literal is the oracle; the
      // equality is the anti-drift guard.
      const optionSets: ReadonlyArray<[string, CalculatedFieldRenderOptions, string]> = [
        ['no resolver at all (the flat path)', {}, 'CONCAT("session_id", "user_id")'],
        ['a column qualifier', { qualifyColumn }, 'CONCAT(main.session_id, main.user_id)'],
        [
          'a caller-supplied reference resolver',
          { qualifyColumn, resolveCalculatedFieldReference },
          'CONCAT(unified.session_id, unified.user_id)',
        ],
        // Empty for a row-level plan today — a formula with no aggregate call has no call to lift —
        // but nothing enforces that, so the method must honour the map rather than assume it away.
        [
          'a span replacement recorded for this plan',
          { qualifyColumn, calculatedFieldReplacements: replacements },
          'CONCAT(main.session_id, sleeve_1._val)',
        ],
      ];

      it.each(optionSets)(
        'returns exactly what renderAggregatedSelect groups by, given %s',
        (_label, opts, expected) => {
          const out = r.renderAggregatedSelect(['country'], [], undefined, {
            ...opts,
            calculatedFields: [rowLevel],
          });
          const outerKey = out.groupByParts[out.groupByParts.length - 1];

          expect(r.renderRowLevelDimensionExpression(rowLevel, opts)).toBe(expected);
          // The key under test is the calculated one, not the plain `country` dimension before it.
          expect(out.groupByParts).toHaveLength(2);
          expect(outerKey).toBe(expected);
          expect(out.selectSql).toContain(`${expected} AS "session_key"`);
        }
      );

      // A row-level formula reads its OWN Data Mart only, permanently (a joined reference outside an
      // aggregate call is refused at save). The verdict lives in the RESOLVER, which is the only
      // party that knows the join tree; the default one refuses rather than qualifying the joined
      // name against main, and extracting the render step must not have lost that.
      it('refuses a live joined reference through the default resolver', () => {
        expect(() =>
          r.renderRowLevelDimensionExpression(
            { ...rowLevel, formula: '{{ref path="orders" field="status"}}' },
            { qualifyColumn }
          )
        ).toThrow(BusinessViolationException);
      });

      // The method exists to render a GROUPING key. An aggregate handed to it would be pushed into
      // a GROUP BY on one side of the join-back and not the other, so refuse rather than render.
      it('refuses an aggregate-level plan rather than rendering one as a grouping key', () => {
        expect(() =>
          r.renderRowLevelDimensionExpression(
            { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
            { qualifyColumn }
          )
        ).toThrow(/row-level/);
      });
    });

    // A row-level field is a dimension, so it may carry a date bucket —
    // and the bucket wraps the WHOLE substituted formula, in SELECT and GROUP BY alike, exactly as
    // it wraps a column reference a few lines above in the renderer.
    describe('with a date bucket on it', () => {
      const MONTH = new Map<string, DateTruncUnit>([['session_key', 'MONTH']]);
      const BUCKETED = `DATE_TRUNC(${SESSION_KEY_SQL}, MONTH)`;

      it('projects and groups by the truncated expression, byte-identical', () => {
        const out = r.renderAggregatedSelect(['country'], [], MONTH, {
          calculatedFields: [rowLevel],
        });

        expect(out.selectSql).toBe(`"country",\n  ${BUCKETED} AS "session_key"`);
        expect(out.groupByParts).toEqual(['"country"', BUCKETED]);
        expect(out.aliasByColumn.get('session_key')).toBe('"session_key"');
      });

      // The counter-intuitive half of it. The design called `CAST(<expr> AS <declared type>)`
      // before the truncation, as the only option compatible with it; the probe measured it
      // turning a LOUD Redshift refusal into `2026-05-01` for a formula meaning the 5th of August.
      // No dialect returned NULL without it. So the absence of a cast here is a measured decision,
      // and this asserts the absence rather than trusting the shape above to reveal it.
      // BOTH declarations, because the two catch different mutations and neither catches both. The
      // STRING one is the realistic shape and pins the SQL byte for byte. The FLOAT one is the only
      // one that catches a cast resolved through `castTypeForDeclaredType`: this stub — like every
      // real dialect map — states no target for a date or string declaration, so such a cast would
      // render NOTHING over the STRING fixture and the byte assertion would stay green.
      it.each([
        ['STRING', 'the shape a report actually takes'],
        ['FLOAT', 'the one the stub states a cast target for'],
      ])('adds no CAST around the expression, declared %s (%s)', type => {
        const out = r.renderAggregatedSelect([], [], MONTH, {
          calculatedFields: [{ ...rowLevel, type }],
        });

        expect(out.groupByParts).toEqual([BUCKETED]);
        expect(out.selectSql).toBe(`${BUCKETED} AS "session_key"`);
      });

      // The bucket belongs to the GROUPING-KEY branch alone. A rule naming a field the report also
      // aggregates is refused at save, but the renderer must not quietly do both: `DATE_TRUNC`
      // inside `COUNT(DISTINCT …)` is a different metric, and no warehouse would complain.
      it('ignores a bucket on a field the report aggregates', () => {
        const out = r.renderAggregatedSelect(
          ['country'],
          [{ column: 'session_key', function: 'COUNT_DISTINCT' }] as AggregationRule[],
          MONTH,
          { calculatedFields: [{ ...rowLevel, isAggregatedByReport: true }] }
        );

        expect(out.selectSql).not.toContain('DATE_TRUNC');
        expect(out.groupByParts).toEqual(['"country"']);
      });

      // An aggregate-level formula is not a dimension at all, permanently. Its projection is
      // untouched by a bucket rule that should never have reached here.
      it('ignores a bucket on an aggregate-level field', () => {
        const out = r.renderAggregatedSelect(['country'], [], new Map([['ctr', 'MONTH']]), {
          calculatedFields: [
            { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' },
          ],
        });

        expect(out.selectSql).not.toContain('DATE_TRUNC');
        expect(out.groupByParts).toEqual(['"country"']);
      });

      // The anti-drift pin the sleeve rests on: the sleeve derives this same key OUTSIDE this
      // class, and joins back on it. Both sides must reach it through the two PUBLIC seats, with
      // the plan's own declared type as the type argument — a sleeve reading the type from
      // somewhere else is exactly the drift the join-back cannot survive.
      it('renders the bucketed key identically through the public seats', () => {
        const out = r.renderAggregatedSelect([], [], MONTH, { calculatedFields: [rowLevel] });

        expect(out.groupByParts[0]).toBe(
          r.renderDateTruncExpression(
            r.renderRowLevelDimensionExpression(rowLevel, {}),
            'MONTH',
            undefined,
            rowLevel.type
          )
        );
      });
    });

    // A report may apply an aggregation to a row-level field, and the field
    // then STOPS being a grouping key. Kept as one, `COUNT(DISTINCT expr) … GROUP BY expr` puts
    // exactly one distinct value in every group and the metric reads 1 on EVERY row — no error, on
    // any warehouse, and a constant rather than an inflated number.
    describe('once the REPORT aggregates it', () => {
      const aggregated = { ...rowLevel, isAggregatedByReport: true };
      const COUNT_UNIQUE = [
        { column: 'session_key', function: 'COUNT_DISTINCT' },
      ] as AggregationRule[];

      it('renders the aggregate over the expression and drops it from the grouping keys', () => {
        const out = r.renderAggregatedSelect(['country'], COUNT_UNIQUE, undefined, {
          calculatedFields: [aggregated],
        });

        expect(out.selectSql).toBe(
          `"country",\n  COUNT(DISTINCT (${SESSION_KEY_SQL})) AS "session_key | COUNTUNIQUE"`
        );
        expect(out.groupByParts).toEqual(['"country"']);
        // The half-applied shape, stated rather than implied: `GROUP BY "country", CONCAT(…)`
        // beside that COUNT is the 1-on-every-row query.
        expect(out.groupBySql).toBe('\nGROUP BY\n  "country"');
        // It no longer projects under its own bare name either — the header binds to the label.
        expect(out.selectSql).not.toContain('AS "session_key"');
      });

      it('emits one item per function in rule order, with the alias map on the first', () => {
        const out = r.renderAggregatedSelect(
          ['country'],
          [
            { column: 'session_key', function: 'COUNT_DISTINCT' },
            { column: 'session_key', function: 'COUNT' },
          ] as AggregationRule[],
          undefined,
          { calculatedFields: [aggregated] }
        );

        expect(out.selectSql).toBe(
          `"country",\n  COUNT(DISTINCT (${SESSION_KEY_SQL})) AS "session_key | COUNTUNIQUE",\n  ` +
            `COUNT((${SESSION_KEY_SQL})) AS "session_key | COUNT"`
        );
        expect(out.aliasByColumn.get('session_key')).toBe('"session_key | COUNTUNIQUE"');
        expect(out.groupByParts).toEqual(['"country"']);
      });

      // A formula body is arbitrary user SQL. Redshift's `||` chain already cost this branch
      // already fixed once in exactly this shape, on the other side of the same join-back.
      it('parenthesises the substituted expression', () => {
        const out = r.renderAggregatedSelect([], COUNT_UNIQUE, undefined, {
          calculatedFields: [
            {
              ...aggregated,
              formula: `{{ref field="session_id"}} || '-' || {{ref field="user_id"}}`,
            },
          ],
        });

        expect(out.selectSql).toBe(
          `COUNT(DISTINCT ("session_id" || '-' || "user_id")) AS "session_key | COUNTUNIQUE"`
        );
      });

      // The verdict is read off the PLAN, never re-derived from the rules in hand: a rule naming
      // another column says nothing about this field.
      it('stays a grouping key when the report aggregates a different column', () => {
        const out = r.renderAggregatedSelect(
          ['country', 'revenue'],
          [{ column: 'revenue', function: 'SUM' }] as AggregationRule[],
          undefined,
          { calculatedFields: [rowLevel] }
        );

        expect(out.groupByParts).toEqual(['"country"', SESSION_KEY_SQL]);
        expect(out.selectSql).toContain(`${SESSION_KEY_SQL} AS "session_key"`);
      });

      // An aggregate-level field already IS an aggregate and no rule may name it. One that did
      // must not wrap it in a second aggregation, and must not gain a grouping key either.
      it('never wraps an aggregate-level plan, whatever the rules say', () => {
        const out = r.renderAggregatedSelect(
          ['country'],
          [{ column: 'ctr', function: 'SUM' }] as AggregationRule[],
          undefined,
          {
            calculatedFields: [
              { outputName: 'ctr', type: 'FLOAT', formula: CTR_FORMULA, level: 'metric' as const },
            ],
          }
        );

        expect(out.selectSql).toBe(
          '"country",\n  SUM("clicks") / NULLIF(SUM("impressions"), 0) AS "ctr"'
        );
        expect(out.groupByParts).toEqual(['"country"']);
      });

      // `renderKeptGroupsJoin` and `buildKeptGroupsCte` render the report's grouping from an EMPTY
      // rule list on purpose. A plan the report aggregates has no function to render there, so it
      // is neither a key nor an aggregate and would simply vanish from the query — the restriction
      // then groups one key coarser than the report and Totals come back plausibly wrong.
      it('refuses a plan the report aggregates when this call carries no rule for it', () => {
        expect(() =>
          r.renderAggregatedSelect(['country'], [], undefined, { calculatedFields: [aggregated] })
        ).toThrow(/session_key/);
      });

      // The mirror of it, and the direction that used to pass silently: a rule names the field, but
      // the plan was never stamped. Nothing downstream disagrees — the field simply becomes a
      // grouping key and the aggregation the report asked for is dropped, headers and all, so the
      // report comes back with `GROUP BY country, CONCAT(…)` and a column nobody ordered. Both
      // plan factories stamp through `partitionCalculatedPlans`, so this is unreachable today; the
      // flag is optional, so a third factory would compile.
      it('refuses an unstamped plan when this call DOES carry a rule for it', () => {
        expect(() =>
          r.renderAggregatedSelect(['country'], COUNT_UNIQUE, undefined, {
            calculatedFields: [rowLevel],
          })
        ).toThrow(/session_key/);
      });

      // …and this is the caller that used to hand it one. The restriction reproduces the REPORT's
      // grouping, and the report stopped grouping by the field the moment it aggregated it — so an
      // aggregated plan contributes NO key here, exactly as an aggregate-level one does. Kept, the
      // restriction groups one key FINER than the report, its HAVING keeps a different row set, and
      // Totals come back plausibly wrong; since the refusal above, it throws instead.
      it('contributes no kept-groups key, so the restriction stays at the report grain', () => {
        const clause = r.renderKeptGroupsJoin({
          restriction: {
            // The name is absent from `dimensions` too — the composer builds that list from the
            // grouping keys, so the two views of the report's grain agree.
            dimensions: ['country'],
            calculatedDimensions: [aggregated],
            having: [
              { column: 'revenue', function: 'SUM', operator: 'eq', value: 1000 },
            ] as FilterRule[],
          },
          fromClause: '"t"',
          filters: [],
          typeByColumn: undefined,
          resolveColumnType: undefined,
        });

        expect(clause.sql).toContain('GROUP BY\n  "country"');
        expect(clause.sql).not.toContain('CONCAT(');
        // One key, so exactly one join pair — a second would pair against a grain the report
        // does not have.
        expect(clause.sql).toContain('"_owox_kg_0"');
        expect(clause.sql).not.toContain('_owox_kg_1');
      });

      // The Totals half of the same shape, and the half nothing covered at any level. The report
      // compares the aggregate its SELECT printed — the argument CAST to the declared type;
      // the restriction re-runs the report's grouping in a subquery of its own and has to compare
      // the SAME thing. Re-derived there it was the field's NAME — `SUM("clicks_rate")` over a
      // FROM that has no such column — so a correctly filtered report lost its Totals row and the
      // reason lived only in the server log, since both Totals callers swallow the failure.
      //
      // The assertion is the RELATIONSHIP between the two rendered queries, not a `CAST` substring:
      // a mutation that casts both sides differently, or neither, is the same defect and a
      // substring pin would stay green through it.
      it('gives the Totals restriction the aggregate argument the report compares', () => {
        const havingLeftHandSide = (sql: string, param: string): string =>
          new RegExp(`\\nHAVING ([^\\n]+) = @${param}`).exec(sql)?.[1] ??
          `no HAVING bound to @${param} in:\n${sql}`;
        const rate: CalculatedFieldPlan = {
          outputName: 'clicks_rate',
          type: 'FLOAT',
          formula: '{{ref field="clicks"}} * 1.0',
          level: 'column',
          isAggregatedByReport: true,
        };
        const metricFilter: RoutedFilterRule[] = [
          { column: 'clicks_rate', function: 'SUM', operator: 'eq', value: 5, clause: 'having' },
        ];
        const shared = {
          fromClause: '"t"',
          dateTruncs: [],
          sort: [],
          limit: null,
          rowCount: false,
          uniqueCount: false,
          qualifyColumn: undefined,
          qualifyProjection: undefined,
          typeByColumn: undefined,
          resolveColumnType: undefined,
          calculatedPredicateExpressions: r.buildCalculatedPredicateExpressions([rate]),
        };
        const report = r.renderAggregatedQuery({
          ...shared,
          columns: ['country'],
          aggregations: [{ column: 'clicks_rate', function: 'SUM' }] as AggregationRule[],
          filters: metricFilter,
          calculatedFields: [rate],
        });
        // A calculated field stays out of the Totals plan's own metrics, so this query never
        // renders the aggregate itself — the restriction is the only place it can appear.
        const totals = r.renderAggregatedQuery({
          ...shared,
          columns: ['revenue'],
          aggregations: [{ column: 'revenue', function: 'SUM' }] as AggregationRule[],
          filters: [],
          groupRestriction: {
            dimensions: ['country'],
            having: metricFilter,
            calculatedHavingMetrics: [rate],
          },
        });

        expect(havingLeftHandSide(totals.sql, 'kgh0')).toBe(havingLeftHandSide(report.sql, 'h0'));
        // …and the name never appears, in any spelling: it is a SELECT alias the subquery's FROM
        // has no column for.
        expect(totals.sql).not.toContain('clicks_rate');
      });
    });

    // `SUM` over a text expression is not a compile error everywhere:
    // Redshift coerces the varchar to `Decimal` with SCALE 0 and truncates every row before
    // summing, so the live probe measured `12` where `12.75` is correct. The analyst's DECLARED
    // type is the only thing that can tell the warehouse otherwise, and it reaches it here —
    // inside the aggregate, around the substituted expression, for the functions that read the
    // value as a number and for no others.
    describe('the declared type, imposed where the aggregation does arithmetic', () => {
      // The stub above leaves the dialect-only functions unimplemented on purpose, and two tests
      // pin that base contract. The rule covers all twelve functions, so this renderer answers for
      // all twelve — in spellings no dialect uses, so a cast leaking into one is unmistakable.
      class EveryFunctionRenderer extends StubRenderer {
        protected override renderPercentile(p: 25 | 50 | 75 | 95, columnRef: string): string {
          return `PCT${p}(${columnRef})`;
        }
        protected override renderStringAgg(columnRef: string): string {
          return `SAGG(${columnRef})`;
        }
      }
      const rf = new EveryFunctionRenderer();
      // The probe's own fixture: two string columns concatenated to '10.5' and '2.25', on a field
      // the analyst declared a number. The true SUM is 12.75.
      const NUMERIC_TEXT_SQL = 'CONCAT("num_prefix", "num_suffix")';
      const numericText: CalculatedFieldPlan = {
        outputName: 'amount',
        type: 'FLOAT',
        formula: 'CONCAT({{ref field="num_prefix"}}, {{ref field="num_suffix"}})',
        level: 'column',
        isAggregatedByReport: true,
      };
      const selectFor = (fn: ReportAggregateFunction, type = 'FLOAT'): string =>
        rf.renderAggregatedSelect([], [{ column: 'amount', function: fn }], undefined, {
          calculatedFields: [{ ...numericText, type }],
        }).selectSql;

      it('wraps the parenthesised expression in a cast, inside the aggregate', () => {
        expect(selectFor('SUM')).toBe(
          `SUM(CAST((${NUMERIC_TEXT_SQL}) AS DOUBLE)) AS "amount | SUM"`
        );
      });

      // The whole rule in one assertion, over the real function list rather than a copy of it.
      it('casts for exactly the six functions that do arithmetic on the value', () => {
        const casting = REPORT_AGGREGATE_FUNCTIONS.filter(fn => selectFor(fn).includes('CAST('));
        expect(casting).toEqual(['SUM', 'AVG', 'P25', 'P50', 'P75', 'P95']);
      });

      // Every exclusion changes an ANSWER, not an amount of effort: a cast decides WHICH VALUES
      // ARE EQUAL for COUNT_DISTINCT ('01' and '1' are two strings and one number) and the
      // ORDERING for MIN/MAX ('10' < '9' as text, 10 > 9 as numbers); COUNT cannot see its
      // argument's type at all, and neither STRING_AGG nor ANY_VALUE reads the value as a number.
      it('leaves the argument exactly as it renders today for every other function', () => {
        const arg = `(${NUMERIC_TEXT_SQL})`;
        expect(selectFor('COUNT_DISTINCT')).toContain(`COUNT(DISTINCT ${arg})`);
        expect(selectFor('COUNT')).toContain(`COUNT(${arg})`);
        expect(selectFor('MIN')).toContain(`MIN(${arg})`);
        expect(selectFor('MAX')).toContain(`MAX(${arg})`);
        expect(selectFor('STRING_AGG')).toContain(`SAGG(${arg})`);
        expect(selectFor('ANY_VALUE')).toContain(`ANY_VALUE(${arg})`);
      });

      // The LAST of the three guards, and the narrowest. It is NOT what keeps the 85 numbers the
      // previous slice measured on five live warehouses where they are — every one of those that
      // aggregates a calculated field uses COUNT_DISTINCT, so the FUNCTION gate returns two lines
      // earlier and this one is never consulted for them. What this covers is a declaration the
      // dialect states no spelling for, which must render as `SUM((expr))` and never as
      // `CAST(… AS undefined)`.
      it('emits no cast when the dialect states no target for the declared type', () => {
        expect(selectFor('SUM', 'STRING')).toBe(`SUM((${NUMERIC_TEXT_SQL})) AS "amount | SUM"`);
      });

      // Added after review. An INTEGER declaration is excluded even though the dialect DOES
      // state a target for it (this stub answers `INT64`), so this assertion fails if the
      // exclusion is dropped rather than passing on the `undefined` fallback.
      //
      // The cast exists to replace an IMPLICIT coercion the warehouse was going to make anyway
      // with an explicit one of the same declared shape. For an integer declaration there is no
      // implicit conversion to replace — `SUM` over a float expression is simply a float sum — so
      // the cast would not correct a coercion, it would INTRODUCE a per-row truncation: the exact
      // shape this slice exists to remove, only deliberate. And the dialects do not agree on it:
      // Spark truncates where the other four round, so the same report would return a different
      // total on Databricks than on BigQuery.
      it('never casts an INTEGER declaration, even where the dialect states a target for it', () => {
        expect(rf.castTypeForDeclaredType('INTEGER')).toBe('INT64');
        expect(selectFor('SUM', 'INTEGER')).toBe(`SUM((${NUMERIC_TEXT_SQL})) AS "amount | SUM"`);
        expect(selectFor('AVG', 'INTEGER')).toBe(`AVG((${NUMERIC_TEXT_SQL})) AS "amount | AVG"`);
        expect(selectFor('P50', 'INTEGER')).toBe(
          `PCT50((${NUMERIC_TEXT_SQL})) AS "amount | MEDIAN"`
        );
      });

      // Every integer spelling the five vocabularies use, not just the one the stub maps — the
      // exclusion is keyed on a shared classifier, so it has to answer for all of them.
      it('excludes every integer spelling the dialect vocabularies can declare', () => {
        const casting = ['TINYINT', 'SMALLINT', 'INT', 'INTEGER', 'BIGINT'].filter(type =>
          selectFor('SUM', type).includes('CAST(')
        );
        expect(casting).toEqual([]);
      });

      // The cast belongs to the report's aggregation, not to the field. Pushed one level down into
      // the shared render step it would also change the GROUPING KEY — and a metric sleeve
      // projects that same dimension from OUTSIDE this class and joins back on it byte for byte,
      // so the join-back would match nothing and every sleeve metric would read NULL, or a
      // COALESCEd zero.
      it('never reaches the grouping key or the plain projection of the same field', () => {
        const key = { ...numericText, isAggregatedByReport: false };
        const out = rf.renderAggregatedSelect(['country'], [], undefined, {
          calculatedFields: [key],
        });

        expect(out.groupByParts).toEqual(['"country"', NUMERIC_TEXT_SQL]);
        expect(out.selectSql).toContain(`${NUMERIC_TEXT_SQL} AS "amount"`);
        expect(rf.renderRowLevelDimensionExpression(key)).toBe(NUMERIC_TEXT_SQL);
        expect(rf.renderCalculatedSelectItems([key])).toEqual([`${NUMERIC_TEXT_SQL} AS "amount"`]);
      });

      // An AGGREGATE-level formula is projected as itself and is never wrapped in an aggregation
      // at all, so there is no arithmetic of ours to impose a type on.
      it('never casts an aggregate-level formula, which no aggregation wraps', () => {
        const out = rf.renderAggregatedSelect(['country'], [], undefined, {
          calculatedFields: [
            {
              outputName: 'ctr',
              type: 'FLOAT',
              formula: CTR_FORMULA,
              level: 'metric',
            },
          ],
        });

        expect(out.selectSql).not.toContain('CAST(');
      });
    });

    // The PLAIN shape: the builder chose no grouping at all, so the field is only a projected
    // expression. Same render step as the grouped path — one translation of an unparseable
    // formula, not two that drift.
    describe('the plain (non-aggregated) shape', () => {
      it('projects each calculated field with no grouping contribution', () => {
        expect(r.renderCalculatedSelectItems([rowLevel])).toEqual([
          `${SESSION_KEY_SQL} AS "session_key"`,
        ]);
      });

      it('qualifies its references through the caller resolver, as the grouped path does', () => {
        expect(
          r.renderCalculatedSelectItems([rowLevel], { qualifyColumn: c => `main.${c}` })
        ).toEqual(['CONCAT(main.session_id, main.user_id) AS "session_key"']);
      });

      it('translates an unparseable formula into the same 400 the grouped path gives', () => {
        expect(() =>
          r.renderCalculatedSelectItems([{ ...rowLevel, formula: '{{ref field=}}' }])
        ).toThrow(BusinessViolationException);
      });

      it('refuses a joined reference here too, rather than qualifying it against main', () => {
        expect(() =>
          r.renderCalculatedSelectItems([
            { ...rowLevel, formula: '{{ref path="orders" field="status"}}' },
          ])
        ).toThrow(BusinessViolationException);
      });

      it('drops the wildcard once a calculated field is projected', () => {
        expect(composePlainSelectBody('*', ['expr AS "f"'])).toBe('expr AS "f"');
        expect(composePlainSelectBody('"a",\n  "b"', ['expr AS "f"'])).toBe(
          '"a",\n  "b",\n  expr AS "f"'
        );
        expect(composePlainSelectBody('*', [])).toBe('*');
      });

      // A calculated field's name is a SELECT alias, never a warehouse column — so a dialect that
      // qualifies its predicates must not qualify it. `src.session_key` is an unrecognized name
      // on BigQuery, the one dialect that aliases its FROM.
      it('resolves a sort on a calculated field to the bare alias, not the qualified column', () => {
        const resolve = r.buildPlainSelectAliasResolver([rowLevel], c => `src.${c}`);
        expect(resolve('session_key')).toBe('"session_key"');
        expect(resolve('country')).toBe('src.country');
      });
    });
  });

  // The flat renderer has no join tree, so it cannot resolve `{{ref path="orders" …}}` to its
  // owner. Rendering it as a bare main-table column is the WRONG answer twice over: an
  // "Unrecognized name" when main has no such column, and — the dangerous half — perfectly valid
  // SQL over the WRONG column when main happens to own one of that name. The second shape is what
  // let a save-time dry run go green and stamp `warehouseValidation: 'passed'` for a query the
  // warehouse never saw.
  describe('renderAggregatedSelect — a calculated field that reads a JOINED Data Mart', () => {
    const JOINED_FORMULA =
      'SUM({{ref field="clicks"}}) * SUM({{ref path="orders" field="amount"}})';

    it('refuses a live joined reference instead of qualifying it against the main table', () => {
      expect(() =>
        r.renderAggregatedSelect(['country'], [], undefined, {
          qualifyColumn: c => `main.${c}`,
          calculatedFields: [
            { outputName: 'rpc', type: 'FLOAT', formula: JOINED_FORMULA, level: 'metric' },
          ],
        })
      ).toThrow(/orders\.amount/);
    });

    // The name-collision case, stated on its own: `amount` being a legitimate column of the MAIN
    // Data Mart is exactly what makes `main.amount` compile. The refusal must not depend on the
    // warehouse noticing.
    it('refuses even when the main Data Mart owns a column of the same name', () => {
      expect(() =>
        r.renderAggregatedSelect(['amount'], [{ column: 'amount', function: 'SUM' }], undefined, {
          qualifyColumn: c => `main.${c}`,
          calculatedFields: [
            { outputName: 'rpc', type: 'FLOAT', formula: JOINED_FORMULA, level: 'metric' },
          ],
        })
      ).toThrow(/orders\.amount/);
    });

    // The bug class: a reference inside a SQL comment is not SQL, so commenting an old joined
    // reference out must not be what makes a metric unrenderable.
    it('renders a metric whose only joined reference is commented out', () => {
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        qualifyColumn: c => `main.${c}`,
        calculatedFields: [
          {
            outputName: 'rpc',
            type: 'FLOAT',
            formula: 'SUM({{ref field="clicks"}}) -- * SUM({{ref path="orders" field="amount"}})',
            level: 'metric',
          },
        ],
      });
      expect(out.selectSql).toContain('SUM(main.clicks)');
    });

    // A formula persisted before save-time validation existed can be unparseable. The
    // composition-time validator normally reports that as a 400 naming the metric, but it only
    // inspects calculated fields once the Data Mart's schema has been actualized — so on a mart
    // with no actualized schema the Handlebars parse error surfaced here as an uncaught 500.
    it('reports an unparseable stored formula as a refusal naming the metric, not a parser crash', () => {
      let caught: unknown;
      try {
        r.renderAggregatedSelect(['country'], [], undefined, {
          calculatedFields: [
            {
              outputName: 'roi',
              type: 'FLOAT',
              formula: 'SUM({{ref field=cost}})',
              level: 'metric',
            },
          ],
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BusinessViolationException);
      expect((caught as Error).message).toContain("'roi'");
      expect((caught as Error).message).toContain('cannot be parsed');
    });

    // A caller bug (two replacement spans overlapping) is not the analyst's problem and must keep
    // failing as one, rather than being relabelled a broken formula.
    it('still fails loudly for a caller-side replacement bug', () => {
      const spans = [
        { start: 0, end: 10, sql: 'a' },
        { start: 5, end: 15, sql: 'b' },
      ];
      expect(() =>
        r.renderAggregatedSelect(['country'], [], undefined, {
          calculatedFields: [
            { outputName: 'rpc', type: 'FLOAT', formula: JOINED_FORMULA, level: 'metric' },
          ],
          calculatedFieldReplacements: new Map([['rpc', spans]]),
        })
      ).toThrow(/Overlapping formula span replacements/);
    });

    // A joined call already lifted into a metric sleeve arrives as a whole-span replacement, so
    // its references are never resolved here — the guard must not fire on those.
    it('renders a joined call that arrives as a span replacement', () => {
      const start = JOINED_FORMULA.indexOf('SUM({{ref path=');
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        qualifyColumn: c => `main.${c}`,
        calculatedFields: [
          { outputName: 'rpc', type: 'FLOAT', formula: JOINED_FORMULA, level: 'metric' },
        ],
        calculatedFieldReplacements: new Map([
          ['rpc', [{ start, end: JOINED_FORMULA.length, sql: 'sleeve_1._val' }]],
        ]),
      });
      expect(out.selectSql).toContain('SUM(main.clicks) * sleeve_1._val AS "rpc"');
    });
  });

  // A formula may reference another Calculated Field of the SAME Data Mart. The referenced
  // field's plan travels inside `dependencies` and is substituted here, at compose time — never
  // persisted, so editing the referenced formula reaches every formula that reads it.
  describe('renderAggregatedSelect — a formula referencing another formula', () => {
    const revenue: CalculatedFieldPlan = {
      outputName: 'revenue',
      type: 'FLOAT',
      formula: 'SUM({{ref field="amount"}})',
      level: 'metric',
    };
    const cost: CalculatedFieldPlan = {
      outputName: 'cost',
      type: 'FLOAT',
      formula: 'SUM({{ref field="spend"}})',
      level: 'metric',
    };
    const roas: CalculatedFieldPlan = {
      outputName: 'roas',
      type: 'FLOAT',
      formula: '{{ref field="revenue"}} / NULLIF({{ref field="cost"}}, 0)',
      level: 'metric',
      dependencies: [revenue, cost],
    };

    // THE formula this is written around. Kills "resolve a reference to a dependency as a
    // plain column", which emits `"revenue" / NULLIF("cost", 0)` — a warehouse error if no such
    // column exists, and a valid read of the WRONG column if one does.
    it('substitutes each referenced formula and projects the metric alone', () => {
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        calculatedFields: [roas],
      });

      expect(out.selectSql).toBe(
        '"country",\n  (SUM("amount")) / NULLIF((SUM("spend")), 0) AS "roas"'
      );
      // A dependency is not a column. It is neither projected under its own name nor grouped.
      expect(out.selectSql).not.toContain('AS "revenue"');
      expect(out.groupBySql).toBe('\nGROUP BY\n  "country"');
    });

    // Kills "splice the rendered expression without parentheses". `x / a + b` is valid SQL on every
    // warehouse and a DIFFERENT number from `x / (a + b)` — no error, no signal. Same class as the
    // Redshift `||` re-binding this branch already had to fix once.
    it('parenthesises a substituted expression so its top-level operator cannot re-bind', () => {
      const totalCost: CalculatedFieldPlan = {
        outputName: 'total_cost',
        type: 'FLOAT',
        formula: 'SUM({{ref field="media"}}) + SUM({{ref field="fees"}})',
        level: 'metric',
      };
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          {
            outputName: 'roi',
            type: 'FLOAT',
            formula: 'SUM({{ref field="amount"}}) / {{ref field="total_cost"}}',
            level: 'metric',
            dependencies: [totalCost],
          },
        ],
      });

      expect(out.selectSql).toBe('SUM("amount") / (SUM("media") + SUM("fees")) AS "roi"');
    });

    // The closure is transitive, and every level looks names up in the SAME flat list.
    it('substitutes a chain of dependencies, not just the first hop', () => {
      const base: CalculatedFieldPlan = {
        outputName: 'base',
        type: 'FLOAT',
        formula: 'SUM({{ref field="amount"}})',
        level: 'metric',
      };
      const middle: CalculatedFieldPlan = {
        outputName: 'middle',
        type: 'FLOAT',
        formula: '{{ref field="base"}} * 2',
        level: 'metric',
      };
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          {
            outputName: 'top',
            type: 'FLOAT',
            formula: '{{ref field="middle"}} + 1',
            level: 'metric',
            dependencies: [middle, base],
          },
        ],
      });

      expect(out.selectSql).toBe('((SUM("amount")) * 2) + 1 AS "top"');
    });

    // A diamond is LEGAL — two formulas may read the same third one. This is what a visited set
    // that never unwinds gets wrong, and the only test standing there for the renderer's guard.
    it('expands the same dependency on two branches without calling it a cycle', () => {
      const shared: CalculatedFieldPlan = {
        outputName: 'shared',
        type: 'FLOAT',
        formula: 'SUM({{ref field="amount"}})',
        level: 'metric',
      };
      const left: CalculatedFieldPlan = {
        outputName: 'left',
        type: 'FLOAT',
        formula: '{{ref field="shared"}} + 1',
        level: 'metric',
      };
      const right: CalculatedFieldPlan = {
        outputName: 'right',
        type: 'FLOAT',
        formula: '{{ref field="shared"}} + 2',
        level: 'metric',
      };
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          {
            outputName: 'top',
            type: 'FLOAT',
            formula: '{{ref field="left"}} / {{ref field="right"}}',
            level: 'metric',
            dependencies: [left, shared, right],
          },
        ],
      });

      expect(out.selectSql).toBe('((SUM("amount")) + 1) / ((SUM("amount")) + 2) AS "top"');
    });

    // A loop only reaches a report from a schema written by a path that skips save-time
    // validation. Unguarded, the substitution recurses for ever: a stack overflow, i.e. a
    // 500 carrying no field name at all. Kills "expand without the guard".
    it('refuses a cycle by name instead of overflowing the stack', () => {
      const a: CalculatedFieldPlan = {
        outputName: 'a',
        type: 'FLOAT',
        formula: '{{ref field="b"}} + 1',
        level: 'metric',
      };
      const b: CalculatedFieldPlan = {
        outputName: 'b',
        type: 'FLOAT',
        formula: '{{ref field="a"}} * 2',
        level: 'metric',
      };
      let caught: unknown;
      try {
        r.renderAggregatedSelect([], [], undefined, {
          calculatedFields: [{ ...a, dependencies: [b, a] }],
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BusinessViolationException);
      expect((caught as Error).message).toContain('a → b → a');
    });

    // The self-reference guard the own-mart refusal used to provide incidentally.
    it('refuses a formula that references itself', () => {
      const self: CalculatedFieldPlan = {
        outputName: 'a',
        type: 'FLOAT',
        formula: '{{ref field="a"}} + 1',
        level: 'metric',
      };
      expect(() =>
        r.renderAggregatedSelect([], [], undefined, {
          calculatedFields: [{ ...self, dependencies: [self] }],
        })
      ).toThrow(/a → a/);
    });

    // The cycle guard pops on the way out so a DIAMOND stays legal — and that is exactly what
    // makes the OUTPUT unbounded: a formula referencing another one twice expands it twice, so
    // each level doubles. Twenty of them, every formula tiny and every one of them legal on its
    // own, reach past V8's string limit; the pod dies with a RangeError or an OOM kill, and it
    // re-fires on every report run, Looker refresh, MCP query and HTTP Data stream, not just at
    // save. No cycle is involved, so the guard above never sees it.
    it('refuses an expansion that doubles at every level instead of building it', () => {
      const chain: CalculatedFieldPlan[] = [
        { outputName: 'a0', type: 'FLOAT', formula: `'${'x'.repeat(200)}'`, level: 'metric' },
      ];
      for (let i = 1; i <= 20; i++) {
        chain.push({
          outputName: `a${i}`,
          type: 'FLOAT',
          formula: `{{ref field="a${i - 1}"}} + {{ref field="a${i - 1}"}}`,
          level: 'metric',
        });
      }
      const top = chain[chain.length - 1];

      expect(() =>
        r.renderAggregatedSelect([], [], undefined, {
          calculatedFields: [{ ...top, dependencies: chain.slice(0, -1) }],
        })
      ).toThrow(/cannot be computed: expanding its formula/);
    });

    // The budget must not fire on an ordinary chain. Twenty formulas deep, each referencing the
    // previous ONCE, is linear and stays far below it.
    it('expands a long linear chain without tripping the budget', () => {
      const chain: CalculatedFieldPlan[] = [
        { outputName: 'b0', type: 'FLOAT', formula: `'${'x'.repeat(200)}'`, level: 'metric' },
      ];
      for (let i = 1; i <= 20; i++) {
        chain.push({
          outputName: `b${i}`,
          type: 'FLOAT',
          formula: `{{ref field="b${i - 1}"}} + 1`,
          level: 'metric',
        });
      }
      const top = chain[chain.length - 1];

      expect(() =>
        r.renderAggregatedSelect([], [], undefined, {
          calculatedFields: [{ ...top, dependencies: chain.slice(0, -1) }],
        })
      ).not.toThrow();
    });

    // ACCESS CONTROL, not merely correctness. Routing and the source access check are
    // decided from the SELECTED metric's own text, so a joined source reachable only THROUGH a
    // dependency would be joined without ever being access-checked. The caller's joined resolver
    // must therefore never see a dependency's references — even though, as here, it would happily
    // resolve them. Kills "pass the whole render options down into the dependency".
    it('refuses a joined reference reached through a substituted dependency', () => {
      const joinedRevenue: CalculatedFieldPlan = {
        outputName: 'joined_revenue',
        type: 'FLOAT',
        formula: 'SUM({{ref path="orders" field="amount"}})',
        level: 'metric',
      };
      let caught: unknown;
      try {
        r.renderAggregatedSelect([], [], undefined, {
          qualifyColumn: c => `main."${c}"`,
          resolveCalculatedFieldReference: ref =>
            ref.path ? `orders_cte."${ref.field}"` : `main."${ref.field}"`,
          calculatedFields: [
            {
              outputName: 'roas',
              type: 'FLOAT',
              formula: '{{ref field="joined_revenue"}} / 2',
              level: 'metric',
              dependencies: [joinedRevenue],
            },
          ],
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BusinessViolationException);
      expect((caught as Error).message).toContain('orders.amount');
      // It must name the field the ANALYST selected, not only the dependency they may never have
      // opened — the refusal arrives on a report that mentions `roas` and nothing else.
      expect((caught as Error).message).toContain("'roas'");
      expect((caught as Error).message).toContain("'joined_revenue'");
      // …and it must NOT repeat the top-level advice, which cannot work here: a dependency is
      // expanded flat by design, so keeping the join on the report changes nothing.
      expect((caught as Error).message).not.toContain('report that keeps the join');
    });

    // Three hops: the refusal still names the SELECTED field, not the intermediate one it was
    // reached through. Kills "name the field one level up".
    it('names the selected field for a joined reference two dependencies down', () => {
      const leaf: CalculatedFieldPlan = {
        outputName: 'leaf',
        type: 'FLOAT',
        formula: 'SUM({{ref path="orders" field="amount"}})',
        level: 'metric',
      };
      const middle: CalculatedFieldPlan = {
        outputName: 'middle',
        type: 'FLOAT',
        formula: '{{ref field="leaf"}} * 2',
        level: 'metric',
      };
      let caught: unknown;
      try {
        r.renderAggregatedSelect([], [], undefined, {
          calculatedFields: [
            {
              outputName: 'roas',
              type: 'FLOAT',
              formula: '{{ref field="middle"}} / 2',
              level: 'metric',
              dependencies: [middle, leaf],
            },
          ],
        });
      } catch (e) {
        caught = e;
      }

      expect((caught as Error).message).toContain("'roas'");
      // `leaf` is the formula that actually reads the joined source — the one to edit.
      expect((caught as Error).message).toContain("'leaf'");
      expect((caught as Error).message).not.toContain("'middle'");
    });

    // The SELECTED field's own joined reference keeps the original advice, which IS achievable
    // there: the blended path lifts such a call into a metric sleeve. Kills "give every joined
    // refusal the dependency wording".
    it('keeps the achievable advice when the selected field itself reads a joined source', () => {
      let caught: unknown;
      try {
        r.renderAggregatedSelect([], [], undefined, {
          calculatedFields: [
            {
              outputName: 'rpc',
              type: 'FLOAT',
              formula: 'SUM({{ref path="orders" field="amount"}})',
              level: 'metric',
            },
          ],
        });
      } catch (e) {
        caught = e;
      }

      expect((caught as Error).message).toContain('report that keeps the join');
    });

    it("qualifies a dependency's own references exactly as the outer formula's", () => {
      const out = r.renderAggregatedSelect([], [], undefined, {
        qualifyColumn: c => `main.${c}`,
        calculatedFields: [roas],
      });

      expect(out.selectSql).toBe('(SUM(main.amount)) / NULLIF((SUM(main.spend)), 0) AS "roas"');
    });

    // A row-level formula over another row-level formula stays a grouping key, and the report
    // groups by ITS OWN whole expression — the dependency contributes no key of its own.
    it('groups a row-level formula by its whole substituted expression, and by nothing else', () => {
      const initials: CalculatedFieldPlan = {
        outputName: 'initials',
        type: 'STRING',
        formula: 'CONCAT({{ref field="first"}}, {{ref field="last"}})',
        level: 'column',
      };
      const out = r.renderAggregatedSelect(['country'], [], undefined, {
        calculatedFields: [
          {
            outputName: 'session_key',
            type: 'STRING',
            formula: 'CONCAT({{ref field="initials"}}, {{ref field="id"}})',
            level: 'column',
            dependencies: [initials],
          },
        ],
      });

      expect(out.groupBySql).toBe(
        '\nGROUP BY\n  "country",\n  CONCAT((CONCAT("first", "last")), "id")'
      );
    });

    // A tag inside a SQL comment is not SQL — the closure, the save-time dependency graph, the
    // level walk and `brokenReferencesOf` all read a stored formula that way, and the schema below
    // was SAVED on that reading. Keying the substitution on ALL parsed references instead re-enters
    // `b` for a tag inside `b`'s own comment and refuses `b → b`: a legal, saved schema made
    // permanently unrunnable, named after a loop that is not in the SQL.
    it('does not substitute a reference that sits inside a SQL comment', () => {
      const b: CalculatedFieldPlan = {
        outputName: 'b',
        type: 'FLOAT',
        formula: 'SUM({{ref field="x"}})\n-- was {{ref field="b"}}',
        level: 'metric',
      };
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          {
            outputName: 'a',
            type: 'FLOAT',
            formula: '{{ref field="b"}} + 1',
            level: 'metric',
            dependencies: [b],
          },
        ],
      });

      // The commented tag renders as the one token it always did, never as an expansion.
      expect(out.selectSql).toBe('(SUM("x")\n-- was "b"\n) + 1 AS "a"');
    });

    // The other half of the same mistake, in the OUTER formula: a commented-out reference replaced
    // by a dependency's multi-line expression puts that expression's later lines on LIVE lines,
    // escaping the comment. Kills "substitute every parsed reference".
    it('leaves a commented-out reference in the outer formula as a single token', () => {
      const b: CalculatedFieldPlan = {
        outputName: 'b',
        type: 'STRING',
        formula: 'CASE WHEN {{ref field="x"}} > 0\n THEN 1 ELSE 0 END',
        level: 'column',
      };

      expect(
        r.renderCalculatedSelectItems([
          {
            outputName: 'a',
            type: 'STRING',
            formula: '{{ref field="y"}} -- old: {{ref field="b"}}\n + 1',
            level: 'column',
            dependencies: [b],
          },
        ])
      ).toEqual(['"y" -- old: "b"\n + 1 AS "a"']);
    });

    // A trailing `-- note` is legal in a stored formula, and substitution is what makes it
    // dangerous: spliced inline, `(SUM("x") -- note)` puts the closing parenthesis, and everything
    // the outer formula writes after it, inside the comment. Kills the inline `(${expression})`.
    it('closes a substituted expression on its own line when the expression ends in a comment', () => {
      const b: CalculatedFieldPlan = {
        outputName: 'b',
        type: 'FLOAT',
        formula: 'SUM({{ref field="x"}}) -- net of refunds',
        level: 'metric',
      };
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          {
            outputName: 'a',
            type: 'FLOAT',
            formula: '{{ref field="b"}} / 2',
            level: 'metric',
            dependencies: [b],
          },
        ],
      });

      expect(out.selectSql).toBe('(SUM("x") -- net of refunds\n) / 2 AS "a"');
    });

    // The PLAIN (non-aggregated) shape shares one render step with the grouped one, so a report
    // whose only calculated field is row-level must substitute identically.
    it('substitutes in the plain SELECT shape too', () => {
      const initials: CalculatedFieldPlan = {
        outputName: 'initials',
        type: 'STRING',
        formula: 'CONCAT({{ref field="first"}}, {{ref field="last"}})',
        level: 'column',
      };

      expect(
        r.renderCalculatedSelectItems([
          {
            outputName: 'greeting',
            type: 'STRING',
            formula: 'CONCAT(\'Hi \', {{ref field="initials"}})',
            level: 'column',
            dependencies: [initials],
          },
        ])
      ).toEqual([`CONCAT('Hi ', (CONCAT("first", "last"))) AS "greeting"`]);
    });
  });

  // PRE-EXISTING, and reachable today with no dependency involved at all: a stored formula may
  // legally end in a `-- note`, and SIX sites wrote SQL after a rendered formula on the SAME line.
  // `SUM(x) -- tail AS "a", SUM(y) AS "b"` reaches the warehouse as `SELECT SUM(x) SUM(y) AS "b"`,
  // a syntax error on every dialect; so does the GROUP BY case, which loses only its comma because
  // the next key is on the next line. Save-time validation cannot see any of it: the dry run only
  // asks whether the composed query errors, and at the shape it composes (one metric, nothing
  // after it) it does not — the column merely loses its alias, which is the one silent shape.
  //
  // All six are equally load-bearing; the last two tests below pin the sixth site and the
  // byte-identity invariant that decides WHERE the newline is applied.
  describe('renderAggregatedSelect — a formula that ends in a line comment', () => {
    // Kills "append ` AS <alias>` to the rendered expression". Two metrics, so the swallowed comma
    // is asserted as well as the swallowed alias.
    it('keeps a metric’s own alias and the next select item out of its trailing comment', () => {
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          {
            outputName: 'a',
            type: 'FLOAT',
            formula: 'SUM({{ref field="x"}}) -- tail',
            level: 'metric',
          },
          { outputName: 'b', type: 'FLOAT', formula: 'SUM({{ref field="y"}})', level: 'metric' },
        ],
      });

      expect(out.selectSql).toBe('SUM("x") -- tail\n AS "a",\n  SUM("y") AS "b"');
    });

    // The same defect in GROUP BY. NOT a coarser grain — the keys are joined with `',\n  '`, so
    // only the comma is inside the comment and the next key survives on its own line: the warehouse
    // sees `GROUP BY CONCAT("x") CONCAT("y")`, a syntax error. Both keys are asserted, so a "fix"
    // that dropped one instead of restoring the comma fails here too.
    it('keeps the next grouping key out of a row-level formula’s trailing comment', () => {
      const out = r.renderAggregatedSelect([], [], undefined, {
        calculatedFields: [
          {
            outputName: 'k1',
            type: 'STRING',
            formula: 'CONCAT({{ref field="x"}}) -- tail',
            level: 'column',
          },
          {
            outputName: 'k2',
            type: 'STRING',
            formula: 'CONCAT({{ref field="y"}})',
            level: 'column',
          },
        ],
      });

      expect(out.groupBySql).toBe('\nGROUP BY\n  CONCAT("x") -- tail\n,\n  CONCAT("y")');
      expect(out.selectSql).toBe('CONCAT("x") -- tail\n AS "k1",\n  CONCAT("y") AS "k2"');
    });

    // The report-aggregated row-level branch closes a parenthesis after the expression, so the
    // comment swallows that too — and with it the aggregate call's own closing paren.
    //
    // This site now writes MORE after the expression than a parenthesis: a declared
    // numeric type puts ` AS <cast type>)` there as well, and a swallowed `AS DOUBLE` is an
    // unterminated CAST rather than a missing alias. It is covered by the same newline because
    // that newline is applied once, to the whole formula, at the one render step every shape goes
    // through — which is exactly the invariant the last test in this block pins.
    it('closes the report’s aggregate wrapper and its cast outside the trailing comment', () => {
      const out = r.renderAggregatedSelect([], [{ column: 'a', function: 'SUM' }], undefined, {
        calculatedFields: [
          {
            outputName: 'a',
            type: 'FLOAT',
            formula: '{{ref field="x"}} -- tail',
            level: 'column',
            isAggregatedByReport: true,
          },
        ],
      });

      expect(out.selectSql).toBe('SUM(CAST(("x" -- tail\n) AS DOUBLE)) AS "a | SUM"');
    });

    // The PLAIN shape writes its alias the same way, and a report whose only calculated field is
    // row-level takes that path.
    it('keeps the alias out of the trailing comment in the plain SELECT shape', () => {
      expect(
        r.renderCalculatedSelectItems([
          {
            outputName: 'a',
            type: 'STRING',
            formula: '{{ref field="x"}} -- tail',
            level: 'column',
          },
        ])
      ).toEqual(['"x" -- tail\n AS "a"']);
    });

    // The most destructive of the six sites: `renderNullSafeJoinOn` joins its pairs with ` AND ` on
    // ONE line and parenthesises each side, so a grouping key ending in a comment took the closing
    // parenthesis with it — and with that the `= <right>`, the NULL-safe leg, and every following
    // pair, leaving the predicate's own parenthesis unbalanced. Both the kept-groups join below and
    // the metric sleeve's join-back build their pairs from these same `groupByParts`.
    it('closes a grouping key’s trailing comment before the join predicate', () => {
      const clause = r.renderKeptGroupsJoin({
        restriction: {
          dimensions: ['session_key'],
          calculatedDimensions: [
            {
              outputName: 'session_key',
              type: 'STRING',
              formula: 'CONCAT({{ref field="session_id"}}) -- tail',
              level: 'column',
            },
          ],
          having: [
            { column: 'revenue', function: 'SUM', operator: 'eq', value: 1000 },
          ] as FilterRule[],
        },
        fromClause: '"t"',
        filters: [],
        typeByColumn: undefined,
        resolveColumnType: undefined,
      });

      expect(clause.sql).toContain(
        'ON ((CONCAT("session_id") -- tail\n) = ("_kept_groups"."_owox_kg_0") OR ' +
          '((CONCAT("session_id") -- tail\n) IS NULL AND ("_kept_groups"."_owox_kg_0") IS NULL))'
      );
    });

    // The invariant the seat's PLACEMENT exists to protect, and — until this — the only thing in
    // the repo that pins it. The outer GROUP BY key and the metric sleeve's projection of the same
    // dimension are derived INDEPENDENTLY (`renderAggregatedSelect` here,
    // `renderRowLevelDimensionExpression` from the blended builder, outside this class), and the
    // sleeve joins back on that key. Terminating the comment at each CALL SITE instead of at the
    // one render step they share passes every other test in this repo and fails only this one.
    it('renders a grouping key identically through both seats, comment and all', () => {
      const plan: CalculatedFieldPlan = {
        outputName: 'k',
        type: 'STRING',
        formula: 'CONCAT({{ref field="x"}}) -- tail',
        level: 'column',
      };

      expect(
        r.renderAggregatedSelect([], [], undefined, { calculatedFields: [plan] }).groupByParts[0]
      ).toBe(r.renderRowLevelDimensionExpression(plan, {}));
    });
  });

  // The composite-PK separator MUST be byte-identical across every dialect. A SQL
  // backslash-escape literal (`'␟'`) means U+241F on BigQuery/Databricks but the
  // 6 literal characters on Redshift/Snowflake/Athena → the composite key would collide
  // differently per engine. Assert every dialect emits the SAME raw separator and none
  // emits the backslash-escape form.
  describe('renderAggregatedSelect — composite-PK separator is identical across dialects', () => {
    const dialects: ReadonlyArray<[string, SqlClauseRenderer]> = [
      ['BigQuery', new BigQueryClauseRenderer()],
      ['Athena', new AthenaClauseRenderer()],
      ['Snowflake', new SnowflakeClauseRenderer()],
      ['Redshift', new RedshiftClauseRenderer()],
      ['Databricks', new DatabricksClauseRenderer()],
    ];

    const separatorOf = (renderer: SqlClauseRenderer): string => {
      const out = renderer.renderAggregatedSelect(['x'], [], undefined, {
        includeUniqueCount: true,
        primaryKeyColumns: ['c1', 'c2'],
      });
      // Capture the literal between the two CAST(...) parts. It sits in a CONCAT arg list
      // (`AS STRING), '<sep>', CAST`) on most dialects, or in a `||` chain
      // (`AS VARCHAR(65535)) || '<sep>' || CAST`) on Redshift — match either join form, and
      // either a bare type keyword or one carrying a length.
      const m = out.selectSql.match(/AS \w+(?:\(\d+\))?\)(?:, | \|\| )'([^']*)'(?:, | \|\| )CAST/);
      if (!m) throw new Error(`no composite-PK separator found in: ${out.selectSql}`);
      return m[1];
    };

    it('no dialect emits the backslash-escape form of the separator', () => {
      for (const [name, renderer] of dialects) {
        const sep = separatorOf(renderer);
        expect(`${name}: ${sep}`).not.toContain('\\u');
      }
    });

    it('all five dialects emit the exact same separator literal (the raw U+241F char)', () => {
      const seps = dialects.map(([, renderer]) => separatorOf(renderer));
      const unitSeparator = '␟'; // the actual unit-separator character, not the escape text
      for (const sep of seps) {
        expect(sep).toBe(unitSeparator);
      }
      expect(new Set(seps).size).toBe(1);
    });

    // A default would let a new dialect pass every single-key test — those never cast — and fail
    // in the warehouse on its first COMPOSITE key, where the cast keyword finally appears. There
    // is no keyword every SQL dialect agrees on, so each has to say its own (#6792).
    it('makes every dialect state its own text cast type instead of inheriting one', () => {
      expect(Object.getOwnPropertyNames(SqlClauseRenderer.prototype)).not.toContain('textCastType');
      for (const [name, renderer] of dialects) {
        const own = Object.getOwnPropertyNames(Object.getPrototypeOf(renderer));
        expect(`${name}: ${own.includes('textCastType')}`).toBe(`${name}: true`);
      }
    });
  });

  // A calculated field's declared type is the analyst's free choice and is never validated against
  // the formula, so it reaches the renderer as a name from that DIALECT's field-type
  // vocabulary — which is not always a SQL type name. The live probe substituted the declared name
  // verbatim and BigQuery answered `Type not found: FLOAT at [2:51]`, its SQL spelling being
  // FLOAT64.
  describe('castTypeForDeclaredType — the declared type in each dialect own SQL spelling', () => {
    // [dialect, renderer, a float-family type it declares, the SQL name it accepts in a CAST]
    const dialects: ReadonlyArray<[string, SqlClauseRenderer, string, string]> = [
      ['BigQuery', new BigQueryClauseRenderer(), 'FLOAT', 'FLOAT64'],
      ['Athena', new AthenaClauseRenderer(), 'DOUBLE', 'DOUBLE'],
      ['Snowflake', new SnowflakeClauseRenderer(), 'FLOAT', 'FLOAT'],
      ['Redshift', new RedshiftClauseRenderer(), 'DOUBLE PRECISION', 'DOUBLE PRECISION'],
      ['Databricks', new DatabricksClauseRenderer(), 'DOUBLE', 'DOUBLE'],
    ];

    it('answers each dialect own float spelling — the shape the probe measured 12.75 for', () => {
      for (const [name, renderer, declared, expected] of dialects) {
        expect(`${name}: ${renderer.castTypeForDeclaredType(declared)}`).toBe(
          `${name}: ${expected}`
        );
      }
    });

    // The whole reason the seat exists: two of the five vocabularies spell a float with a word
    // their own SQL does not accept — BigQuery FLOAT (measured `Type not found`) and Athena FLOAT,
    // which is DDL-only where a query says REAL or DOUBLE.
    it('never echoes a declared name that the dialect SQL does not accept as a type', () => {
      expect(new BigQueryClauseRenderer().castTypeForDeclaredType('FLOAT')).toBe('FLOAT64');
      expect(new AthenaClauseRenderer().castTypeForDeclaredType('FLOAT')).toBe('DOUBLE');
    });

    // A cast may WIDEN a declared float but never narrows one: the probe measured `12.75` through
    // each dialect's 64-bit float, and the live numbers were measured with no cast at all, so
    // a 32-bit target would move a number that is correct today — silently, to about seven
    // significant digits. The integer and exact types stay faithful to the declaration: those
    // state a GRAIN the analyst chose, while 32-bit-ness is a storage width nobody asked for.
    it('never narrows a declared float to a 32-bit target', () => {
      const narrowingTargets = new Set(['REAL', 'FLOAT4']);
      const declaredFloats: ReadonlyArray<[string, SqlClauseRenderer, readonly string[]]> = [
        ['Athena', new AthenaClauseRenderer(), ['FLOAT', 'REAL', 'DOUBLE']],
        ['Redshift', new RedshiftClauseRenderer(), ['REAL', 'DOUBLE PRECISION']],
        ['Databricks', new DatabricksClauseRenderer(), ['FLOAT', 'DOUBLE']],
      ];
      for (const [name, renderer, declaredTypes] of declaredFloats) {
        const narrowed = declaredTypes.filter(type =>
          narrowingTargets.has(String(renderer.castTypeForDeclaredType(type)))
        );
        expect(`${name}: ${narrowed.join(', ')}`).toBe(`${name}: `);
      }
    });

    it('answers undefined for a type it states no cast target for, so no cast is emitted', () => {
      for (const [name, renderer] of dialects) {
        expect(`${name}: ${renderer.castTypeForDeclaredType('NOT_A_TYPE')}`).toBe(
          `${name}: undefined`
        );
      }
    });

    // Presence, not shape — and the half nothing above was watching. A numeric type a dialect can
    // DECLARE but never mapped answers `undefined`, its caller then emits no cast, and Redshift is
    // back to returning 12 for 12.75 with every suite and `nest build` green. Keyed on the SAME
    // categorizer `field-aggregation-governance` uses to decide SUM/AVG are offered at all, so the
    // set this must cover cannot drift from the set that can reach the cast.
    it('covers every numeric type each dialect can declare, so a new one fails loudly here', () => {
      const vocabularies: ReadonlyArray<[string, SqlClauseRenderer, readonly string[]]> = [
        ['BigQuery', new BigQueryClauseRenderer(), Object.values(BigQueryFieldType)],
        ['Athena', new AthenaClauseRenderer(), Object.values(AthenaFieldType)],
        ['Snowflake', new SnowflakeClauseRenderer(), Object.values(SnowflakeFieldType)],
        ['Redshift', new RedshiftClauseRenderer(), Object.values(RedshiftFieldType)],
        ['Databricks', new DatabricksClauseRenderer(), Object.values(DatabricksFieldType)],
      ];
      for (const [name, renderer, declaredTypes] of vocabularies) {
        const unmapped = declaredTypes
          .filter(type => categorizeFieldType(type) === 'number')
          .filter(type => renderer.castTypeForDeclaredType(type) === undefined);
        expect(`${name}: ${unmapped.join(', ')}`).toBe(`${name}: `);
      }
    });

    // The integer rule's safety net. The caller casts a float or exact-decimal declaration and REFUSES an
    // integer one, so a numeric type belonging to none of the three families would fall through to
    // "cast it" — the per-row truncation the rule exists to prevent, on a type nobody classified.
    // Keyed on the same dialect vocabularies as the coverage test above, so it fails the moment an
    // enum grows rather than when a report is run.
    it('classifies every numeric type each dialect can declare as integer, float or exact', () => {
      const vocabularies: ReadonlyArray<[string, readonly string[]]> = [
        ['BigQuery', Object.values(BigQueryFieldType)],
        ['Athena', Object.values(AthenaFieldType)],
        ['Snowflake', Object.values(SnowflakeFieldType)],
        ['Redshift', Object.values(RedshiftFieldType)],
        ['Databricks', Object.values(DatabricksFieldType)],
      ];
      for (const [name, declaredTypes] of vocabularies) {
        const unclassified = declaredTypes
          .filter(type => categorizeFieldType(type) === 'number')
          .filter(
            type =>
              !isIntegerType(type) &&
              !isFloatingPointType(type) &&
              !EXACT_NUMERIC_TYPES.has(type.toUpperCase())
          );
        expect(`${name}: ${unclassified.join(', ')}`).toBe(`${name}: `);
      }
    });

    // Same reason as textCastType above, and the reason it is named: each vocabulary is its own,
    // so no shared table can hold this — and a default would let a new dialect pass every test here
    // and then be told `Type not found` by the warehouse.
    it('makes every dialect state its own declared-type mapping instead of inheriting one', () => {
      expect(Object.getOwnPropertyNames(SqlClauseRenderer.prototype)).not.toContain(
        'castTypeForDeclaredType'
      );
      for (const [name, renderer] of dialects) {
        const own = Object.getOwnPropertyNames(Object.getPrototypeOf(renderer));
        expect(`${name}: ${own.includes('castTypeForDeclaredType')}`).toBe(`${name}: true`);
      }
    });
  });

  // The two halves of ONE decision, asserted as a relationship rather than as two
  // greps for `CAST`. The expression's cast is decided from the PLAN's declared type inside
  // `buildCalculatedPredicateExpressions`; the value's is decided from the type RESOLVER at the
  // comparison. Two derivations of one declaration is the drift this branch has already paid for
  // repeatedly, so the assertion reads the target out of the left-hand side and REQUIRES the value
  // to name that same one — out of a single rendered predicate, per dialect.
  describe('a Calculated Field comparison imposes ONE type on both sides', () => {
    // [dialect, renderer, a float-family type it declares]
    const comparisonDialects: ReadonlyArray<[string, SqlClauseRenderer, string]> = [
      ['BigQuery', new BigQueryClauseRenderer(), 'FLOAT'],
      ['Athena', new AthenaClauseRenderer(), 'FLOAT'],
      ['Snowflake', new SnowflakeClauseRenderer(), 'FLOAT'],
      ['Redshift', new RedshiftClauseRenderer(), 'DOUBLE PRECISION'],
      ['Databricks', new DatabricksClauseRenderer(), 'DOUBLE'],
    ];
    const planFor = (declaredType: string): CalculatedFieldPlan => ({
      outputName: 'probe',
      formula: '{{ref field="a"}}',
      level: 'column',
      type: declaredType,
    });
    // The back-reference is the whole assertion: whatever type the expression is cast to, the
    // value must be cast to that same one.
    const ONE_TYPE =
      /^\nWHERE CAST\(\(.+\) AS ([A-Z0-9_]+(?: PRECISION)?(?:\(\d+,\d+\))?)\) > CAST\([^()]+ AS \1\)$/;

    it('names the same cast target on the expression and on the value, on every dialect', () => {
      for (const [name, renderer, declared] of comparisonDialects) {
        const out = renderer.renderWhere(
          [{ column: 'probe', operator: 'gt', value: 5 }],
          undefined,
          'p',
          () => declared,
          renderer.buildCalculatedPredicateExpressions([planFor(declared)])
        );
        expect(`${name}: ${ONE_TYPE.test(out.sql)} — ${out.sql}`).toBe(
          `${name}: true — ${out.sql}`
        );
      }
    });

    // The expression's cast must NOT depend on a caller wiring the resolver: a builder that forgot
    // to would otherwise silently restore Redshift's lexicographic `>`, which returned `9` where
    // `9, 10, 100` is correct. Losing the value's cast is loud instead — BigQuery and Athena refuse
    // the mismatched literal — so the two halves fail in the right order.
    it('still imposes the declaration on the expression when no resolver answers the rule', () => {
      for (const [name, renderer, declared] of comparisonDialects) {
        const out = renderer.renderWhere(
          [{ column: 'probe', operator: 'gt', value: 5 }],
          undefined,
          'p',
          undefined,
          renderer.buildCalculatedPredicateExpressions([planFor(declared)])
        );
        const target = renderer.castTypeForDeclaredType(declared);
        expect(`${name}: ${out.sql.startsWith(`\nWHERE CAST((`)}`).toBe(`${name}: true`);
        expect(`${name}: ${out.sql.includes(`) AS ${target}) > `)}`).toBe(`${name}: true`);
      }
    });
  });

  // The ONE seat a filter's type comes from. A Calculated Field has no warehouse
  // column, so `columnTypes` can never hold one and the resolver answered `undefined` for it: the
  // value's JS type then decided the comparison, measured flipping BigQuery and Athena between a
  // hard error and the right answer for `= 10` versus `= '10'` over one field.
  describe('buildFilterTypeResolver', () => {
    const ctr: CalculatedFieldPlan = {
      outputName: 'ctr',
      formula: 'SUM({{ref field="clicks"}})',
      level: 'metric',
      type: 'FLOAT',
    };

    it('answers a Calculated Field its DECLARED type, which no column map can hold', () => {
      const resolve = buildFilterTypeResolver(undefined, [ctr], DataStorageType.GOOGLE_BIGQUERY);
      expect(resolve?.({ column: 'ctr', operator: 'gt', value: 1 })).toBe('FLOAT');
    });

    it('keeps answering an ordinary column from the storage type map', () => {
      const resolve = buildFilterTypeResolver(
        new Map([['visit_date', 'DATE']]),
        [ctr],
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(resolve?.({ column: 'visit_date', operator: 'gte', value: '2026-07-01' })).toBe(
        'DATE'
      );
      expect(resolve?.({ column: 'unknown', operator: 'eq', value: 1 })).toBeUndefined();
    });

    // The HAVING widening still applies on top: a rule carrying a function compares the
    // AGGREGATE's value, not the raw one, which is what `effectiveComparisonType` already decided
    // for ordinary columns and must keep deciding for a report-aggregated calculated field.
    it('widens to the aggregate effective type for a rule carrying a function', () => {
      const resolve = buildFilterTypeResolver(undefined, [ctr], DataStorageType.GOOGLE_BIGQUERY);
      expect(
        resolve?.({ column: 'ctr', function: 'COUNT_DISTINCT', operator: 'gte', value: 5 })
      ).toBe('INTEGER');
    });

    // `undefined` stays a DECISION rather than an omission: a dialect with neither column types
    // nor a calculated field passes no resolver at all, exactly as it does today.
    it('answers undefined when there is nothing to resolve from', () => {
      expect(buildFilterTypeResolver(undefined, [], DataStorageType.AWS_REDSHIFT)).toBeUndefined();
      expect(
        buildFilterTypeResolver(undefined, undefined, DataStorageType.AWS_REDSHIFT)
      ).toBeUndefined();
    });
  });

  // Dialect-agnostic HAVING contract: the LHS is the aggregate EXPRESSION
  // (renderAggregateExpression), the default param prefix is `h` (distinct from
  // WHERE's `p`), the WHERE/HAVING split is driven by `rule.function`, and multiple
  // HAVING rules join with AND. The StubRenderer's `eq` fragment emits `@<param>`.
  describe('renderHaving — base contract', () => {
    it('renders the aggregate expression as the HAVING LHS with the default `h` prefix', () => {
      const out = r.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'eq', value: 10 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM("amount") = @h0');
      expect(out.params).toEqual([{ name: 'h0', value: 10 }]);
    });

    it('uses a param prefix (`h`) distinct from WHERE (`p`) on the same rule list', () => {
      const rules: FilterRule[] = [
        { column: 'country', operator: 'eq', value: 'US' },
        { column: 'amount', function: 'SUM', operator: 'eq', value: 10 },
      ];
      // WHERE takes only the no-function rule and uses `p`; HAVING takes only the
      // function rule and uses `h`.
      expect(r.renderWhere(rules).sql).toBe('\nWHERE "country" = @p0');
      expect(r.renderWhere(rules).params).toEqual([{ name: 'p0', value: 'US' }]);
      expect(r.renderHaving(rules).sql).toBe('\nHAVING SUM("amount") = @h0');
      expect(r.renderHaving(rules).params).toEqual([{ name: 'h0', value: 10 }]);
    });

    it('joins multiple HAVING rules with AND, each on its own line, advancing the index', () => {
      const out = r.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'eq', value: 1 },
        { column: 'amount', function: 'AVG', operator: 'eq', value: 2 },
      ]);
      expect(out.sql).toBe('\nHAVING SUM("amount") = @h0\n  AND AVG("amount") = @h1');
      expect(out.params.map(p => p.name)).toEqual(['h0', 'h1']);
    });

    it('returns empty SQL when no rule carries a function (all are WHERE rules)', () => {
      expect(r.renderHaving([{ column: 'a', operator: 'eq', value: 1 }]).sql).toBe('');
    });
  });

  // Both clauses read the verdict stamped on the rule, never `rule.function` — an
  // aggregate-level Calculated Field's rule carries none and never can, so a `function` test sends
  // its predicate to WHERE, where an aggregate is invalid on every engine.
  describe('renderWhere / renderHaving split on the carried clause', () => {
    const routedHaving: RoutedFilterRule[] = [
      { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
    ];
    const routedWhere: RoutedFilterRule[] = [
      { column: 'session_key', operator: 'eq', value: 'a1', clause: 'where' },
    ];

    it('renderWhere drops a function-less rule routed to HAVING', () => {
      expect(r.renderWhere(routedHaving).sql).toBe('');
    });

    it('renderWhere keeps a rule routed to WHERE', () => {
      expect(r.renderWhere(routedWhere).sql).toBe('\nWHERE "session_key" = @p0');
    });

    // Routing brings it here and stops. The LHS of a function-less HAVING is the field's own
    // formula, which nothing hands this renderer yet — so it refuses loudly rather than skipping
    // the rule, which would apply the predicate in neither clause and leave no trace.
    it('renderHaving refuses a function-less rule routed to HAVING instead of dropping it', () => {
      expect(() => r.renderHaving(routedHaving)).toThrow(/ctr/);
    });

    // The clause is a property of the RULE; whether the query emits a HAVING at all is a property
    // of the SHAPE, chosen after the filters are rendered — so the type system cannot reach this
    // and only a runtime guard can. Without it a report filtering on an aggregate-level
    // Calculated Field it does NOT select has its predicate applied in neither clause: silently
    // more rows than asked for, where before the clause was carried it failed at the warehouse.
    it('assertNoHavingRules refuses a HAVING-routed rule on a query with no HAVING', () => {
      expect(() => assertNoHavingRules(routedHaving, 'X plain query')).toThrow(/ctr/);
      expect(() => assertNoHavingRules(routedHaving, 'X plain query')).toThrow(/neither/);
    });

    it('assertNoHavingRules passes a WHERE-only list', () => {
      expect(() => assertNoHavingRules(routedWhere, 'X plain query')).not.toThrow();
      expect(() => assertNoHavingRules([], 'X plain query')).not.toThrow();
    });

    it('renderHaving drops a rule routed to WHERE even when it carries a function', () => {
      const misrouted: RoutedFilterRule[] = [
        { column: 'amount', function: 'SUM', operator: 'eq', value: 10, clause: 'where' },
      ];
      expect(r.renderHaving(misrouted).sql).toBe('');
    });
  });

  // A Calculated Field's predicate compares its FORMULA, at both levels —
  // `(<expr>) <op> <value>`. Its name is a SELECT alias with no warehouse column behind it, so the
  // ordinary `qualifyColumn(rule.column)` left-hand side names something that does not exist:
  // `HAVING (<expr>) > @h0` is what the probe measured compiling identically on all five storages.
  describe('a Calculated Field as the predicate left-hand side', () => {
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
    const CTR_SQL = 'SUM("clicks") / NULLIF(SUM("impressions"), 0)';
    const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';
    const SESSION_KEY_SQL = 'CONCAT("session_id", "user_id")';
    const ctr: CalculatedFieldPlan = {
      outputName: 'ctr',
      type: 'FLOAT',
      formula: CTR_FORMULA,
      level: 'metric',
    };
    const sessionKey: CalculatedFieldPlan = {
      outputName: 'session_key',
      type: 'STRING',
      formula: SESSION_KEY_FORMULA,
      level: 'column',
    };

    // PARENTHESISED, and that is not cosmetic: a formula body is arbitrary analyst SQL, and
    // Redshift binds `=` tighter than `||`, so a bare `a || b = 'x'` parses as `a || (b = 'x')`.
    // `renderAggregateArgument` parenthesises for exactly this reason.
    //
    // The expression is NEVER cast here: the target each field's COMPARISONS impose
    // travels beside it, because whether it applies is a property of the operator. The stub maps
    // FLOAT to DOUBLE and states no target for STRING.
    it('renders each plan as a parenthesised expression keyed by its output name', () => {
      const operands = r.buildCalculatedPredicateExpressions([ctr, sessionKey]);

      expect([...operands]).toEqual([
        ['ctr', { expression: `(${CTR_SQL})`, castType: 'DOUBLE' }],
        ['session_key', { expression: `(${SESSION_KEY_SQL})`, castType: undefined }],
      ]);
    });

    it('qualifies the formula references through the caller resolver', () => {
      const operands = r.buildCalculatedPredicateExpressions([sessionKey], {
        qualifyColumn: c => `main.${c}`,
      });

      expect(operands.get('session_key')?.expression).toBe(
        '(CONCAT(main.session_id, main.user_id))'
      );
    });

    // The move left undone: without it this rule reaches the renderer with no formula and
    // dies on the named throw below — the whole reason the refusal could not simply be lifted.
    it('renderHaving compares the formula for a function-less rule routed to HAVING', () => {
      const routed: RoutedFilterRule[] = [
        { column: 'ctr', operator: 'eq', value: 0.5, clause: 'having' },
      ];
      const out = r.renderHaving(
        routed,
        undefined,
        'h',
        undefined,
        undefined,
        r.buildCalculatedPredicateExpressions([ctr])
      );

      // The declared FLOAT reaches the expression from the PLAN; this call passes no
      // type resolver, so the VALUE keeps the plain placeholder — the half that depends on wiring.
      expect(out.sql).toBe(`\nHAVING CAST((${CTR_SQL}) AS DOUBLE) = @h0`);
      expect(out.params).toEqual([{ name: 'h0', value: 0.5 }]);
    });

    // The row-level half, and the one a report hits first. Dropping the lookup in `renderWhere`
    // emits `WHERE "session_key" = @p0` — a column no warehouse has ever had.
    it('renderWhere compares the formula for a rule on a row-level field', () => {
      const routed: RoutedFilterRule[] = [
        { column: 'session_key', operator: 'eq', value: 'a1', clause: 'where' },
      ];
      const out = r.renderWhere(
        routed,
        undefined,
        'p',
        undefined,
        r.buildCalculatedPredicateExpressions([sessionKey])
      );

      expect(out.sql).toBe(`\nWHERE (${SESSION_KEY_SQL}) = @p0`);
      expect(out.params).toEqual([{ name: 'p0', value: 'a1' }]);
    });

    // An ordinary column must keep its qualified reference even while the map is in hand: a
    // lookup that swallowed every name would qualify nothing and emit a bare identifier.
    it('leaves an ordinary column on its own qualified reference', () => {
      const routed: RoutedFilterRule[] = [
        { column: 'country', operator: 'eq', value: 'PL', clause: 'where' },
      ];
      const out = r.renderWhere(
        routed,
        c => `main.${c}`,
        'p',
        undefined,
        r.buildCalculatedPredicateExpressions([sessionKey])
      );

      expect(out.sql).toBe('\nWHERE main.country = @p0');
    });

    // The guard survives the lift: a plan that never reached the renderer is still a predicate
    // with no left-hand side, and skipping it applies it in NEITHER clause.
    it('renderHaving still refuses a function-less rule no plan reached it for', () => {
      const routed: RoutedFilterRule[] = [
        { column: 'ctr', operator: 'eq', value: 0.5, clause: 'having' },
      ];

      expect(() =>
        r.renderHaving(
          routed,
          undefined,
          'h',
          undefined,
          undefined,
          r.buildCalculatedPredicateExpressions([sessionKey])
        )
      ).toThrow(/ctr/);
    });

    // A rule carrying a function on a report-aggregated ROW-LEVEL field keeps comparing the
    // aggregate the SELECT emitted — the expression map must not overtake that seat, or the
    // predicate reads the UNCAST value while the projection prints the cast one.
    it('keeps the aggregate argument as the left-hand side when the rule carries a function', () => {
      const routed: RoutedFilterRule[] = [
        { column: 'session_key', function: 'COUNT', operator: 'eq', value: 3, clause: 'having' },
      ];
      const out = r.renderHaving(
        routed,
        undefined,
        'h',
        undefined,
        new Map([['session_key | COUNT', `CAST((${SESSION_KEY_SQL}) AS STRING)`]]),
        r.buildCalculatedPredicateExpressions([sessionKey])
      );

      expect(out.sql).toBe(`\nHAVING COUNT(CAST((${SESSION_KEY_SQL}) AS STRING)) = @h0`);
    });
  });

  // renderHaving reuses renderFilterFragment, so the null-inclusive negative operators
  // apply to metric (HAVING) filters too — collateral but intended. The aggregate
  // EXPRESSION is the LHS, so it is emitted twice in the `(agg IS NULL OR agg …)` form.
  describe('renderHaving — negative operators are null-inclusive on metric filters', () => {
    it('neq metric filter → `(SUM(col) IS NULL OR SUM(col) <> @h0)` (real BigQuery renderer)', () => {
      const bq = new BigQueryClauseRenderer();
      const out = bq.renderHaving([
        { column: 'amount', function: 'SUM', operator: 'neq', value: 0 },
      ]);
      expect(out.sql).toBe('\nHAVING (SUM(`amount`) IS NULL OR SUM(`amount`) <> @h0)');
      expect(out.params).toEqual([{ name: 'h0', value: 0 }]);
    });

    it('not_contains metric filter emits the aggregate twice (real Athena renderer)', () => {
      const athena = new AthenaClauseRenderer();
      const out = athena.renderHaving([
        { column: 'name', function: 'MAX', operator: 'not_contains', value: 'x' },
      ]);
      expect(out.sql).toBe('\nHAVING (MAX("name") IS NULL OR strpos(MAX("name"), ?) = 0)');
      expect(out.params).toEqual([{ name: 'h0', value: 'x' }]);
    });
  });

  it('renderNullSafeJoinOn joins each pair NULL-safely with AND', () => {
    const sql = r.renderNullSafeJoinOn([
      { left: '"main"."country"', right: '"sleeve_x"."country"' },
      { left: '"main"."device"', right: '"sleeve_x"."device"' },
    ]);
    expect(sql).toBe(
      '(("main"."country") = ("sleeve_x"."country") ' +
        'OR (("main"."country") IS NULL AND ("sleeve_x"."country") IS NULL)) ' +
        'AND (("main"."device") = ("sleeve_x"."device") ' +
        'OR (("main"."device") IS NULL AND ("sleeve_x"."device") IS NULL))'
    );
  });
});

// Terminal allow-list at the render boundary — the date-trunc unit and time zone are INLINED
// into SQL (no bound parameter), so this is the last gate before injection. Every dialect
// overrides renderDateTrunc, so the guard must fire for ALL of them, not just the base.
describe('renderDateTrunc — terminal injection guard (all dialects)', () => {
  const dialects: [string, SqlClauseRenderer][] = [
    ['BigQuery', new BigQueryClauseRenderer()],
    ['Athena', new AthenaClauseRenderer()],
    ['Redshift', new RedshiftClauseRenderer()],
    ['Snowflake', new SnowflakeClauseRenderer()],
    ['Databricks', new DatabricksClauseRenderer()],
  ];

  for (const [name, renderer] of dialects) {
    it(`${name}: rejects an out-of-enum date-trunc unit`, () => {
      expect(() =>
        renderer.renderAggregatedSelect(['d'], [], new Map([['d', 'DAY); DROP TABLE t--' as any]]))
      ).toThrow(/date.trunc unit/i);
    });

    it(`${name}: rejects a time zone that is not a valid IANA name`, () => {
      expect(() =>
        renderer.renderAggregatedSelect(['d'], [], new Map([['d', 'DAY']]), {
          timeZoneByColumn: new Map([['d', "UTC'); DROP TABLE t--"]]),
        })
      ).toThrow(/time zone/i);
    });

    it(`${name}: accepts a valid unit + IANA time zone`, () => {
      expect(() =>
        renderer.renderAggregatedSelect(['d'], [], new Map([['d', 'MONTH']]), {
          timeZoneByColumn: new Map([['d', 'America/New_York']]),
        })
      ).not.toThrow();
    });
  }
});

describe('renderNullSafeJoinOn — NaN-safe leg', () => {
  const renderer = new BigQueryClauseRenderer();

  it('emits the plain NULL-safe form for an unmarked pair', () => {
    expect(renderer.renderNullSafeJoinOn([{ left: 'a.x', right: 'b.x' }])).toBe(
      '((a.x) = (b.x) OR ((a.x) IS NULL AND (b.x) IS NULL))'
    );
  });

  // Redshift binds `=` TIGHTER than `||`, so a bare `a || b = k` parses as `a || (b = k)` and the
  // warehouse rejects the whole join — Totals being best-effort, the block just disappears. Each
  // side is an expression this renderer does not control, so each side is wrapped.
  it('parenthesises an operator expression so precedence cannot re-associate the equality', () => {
    expect(
      renderer.renderNullSafeJoinOn([{ left: '"part_a" || "part_b"', right: 'kg."_owox_kg_0"' }])
    ).toBe(
      '(("part_a" || "part_b") = (kg."_owox_kg_0") ' +
        'OR (("part_a" || "part_b") IS NULL AND (kg."_owox_kg_0") IS NULL))'
    );
  });

  // GROUP BY buckets all NaNs together while `NaN = NaN` is FALSE on BigQuery and Trino, so a
  // float dimension holding NaN forms an outer group that matches no sleeve row — the metric
  // then reads NULL, or 0 once the COUNT DISTINCT pull coalesces.
  it('adds the NaN leg for a pair marked nanSafe', () => {
    expect(renderer.renderNullSafeJoinOn([{ left: 'a.x', right: 'b.x', nanSafe: true }])).toBe(
      '((a.x) = (b.x) OR ((a.x) IS NULL AND (b.x) IS NULL) OR ((a.x) != (a.x) AND (b.x) != (b.x)))'
    );
  });
});

describe('Unique Count primary-key rendering (#6792)', () => {
  const renderer = new BigQueryClauseRenderer();

  it('keeps a single-column key byte-identical to the pre-#6792 form', () => {
    const out = renderer.renderAggregatedSelect(['channel'], [], undefined, {
      includeUniqueCount: true,
      primaryKeyColumns: ['id'],
    });
    expect(out.selectSql).toContain('COUNT(DISTINCT `id`)');
    expect(out.selectSql).not.toContain('CASE WHEN');
  });

  it('excludes rows with a NULL component from a composite key count', () => {
    const out = renderer.renderAggregatedSelect(['channel'], [], undefined, {
      includeUniqueCount: true,
      primaryKeyColumns: ['a', 'b'],
    });
    expect(out.selectSql).toContain('IS NULL OR');
    expect(out.selectSql).toContain('THEN NULL ELSE');
    expect(out.selectSql).not.toContain('COALESCE');
  });
});

/**
 * A metric filter must compare the SAME aggregate its own SELECT prints.
 *
 * The projection wraps a report-aggregated Calculated Field's expression in the analyst's declared
 * type before SUM/AVG/percentile read it; `renderHaving` derived its own left-hand side and did not.
 * Measured live on Redshift 2026-08-24 (probe shape 4b): a report printed `A = 12.75` and
 * `B = 1.75`, then dropped B — the uncast `SUM` in the predicate truncated the same values to `12`
 * and `1`, and `1 > 1.5` is false. No error, and the numbers beside the filter contradicted it.
 *
 * Every assertion below compares the predicate's rendering against the PROJECTION's, both read out
 * of one `renderAggregatedQuery` result, rather than looking for a `CAST` substring: what makes the
 * report honest is that the two are one string, whatever that string is on this dialect.
 */
describe('renderAggregatedQuery — a metric filter compares the aggregate the SELECT prints', () => {
  const METRIC = 'probe';
  // `||`, not CONCAT: the operator whose precedence made the parentheses around a substituted
  // formula load-bearing, so a lost pair shows up here as well.
  const FORMULA = '{{ref field="f_prefix"}} || {{ref field="f_suffix"}}';

  const dialects: ReadonlyArray<{
    name: string;
    renderer: SqlClauseRenderer;
    /** A float-family declaration this dialect states a cast target for. */
    float: string;
    /** An integer-family one it also maps, and that the integer rule refuses to cast anyway. */
    integer: string;
    /** How this dialect qualifies a PREDICATE column — only BigQuery aliases its FROM. */
    qualifyColumn: ColumnRefResolver | undefined;
  }> = [
    {
      name: 'BigQuery',
      renderer: new BigQueryClauseRenderer(),
      float: 'FLOAT',
      integer: 'INTEGER',
      qualifyColumn: c => `src.\`${c}\``,
    },
    {
      name: 'Athena',
      renderer: new AthenaClauseRenderer(),
      float: 'DOUBLE',
      integer: 'INTEGER',
      qualifyColumn: undefined,
    },
    {
      name: 'Redshift',
      renderer: new RedshiftClauseRenderer(),
      float: 'DOUBLE PRECISION',
      integer: 'INTEGER',
      qualifyColumn: undefined,
    },
    {
      name: 'Snowflake',
      renderer: new SnowflakeClauseRenderer(),
      float: 'FLOAT',
      integer: 'INTEGER',
      qualifyColumn: undefined,
    },
    {
      name: 'Databricks',
      renderer: new DatabricksClauseRenderer(),
      float: 'DOUBLE',
      integer: 'INT',
      qualifyColumn: undefined,
    },
  ];

  /**
   * The projected aggregate and the predicate's, read out of ONE rendered query — the whole seat
   * the probe drove, so the wiring between the two is under test and not just the pieces.
   */
  const renderBoth = (
    dialect: (typeof dialects)[number],
    fn: ReportAggregateFunction,
    declaredType: string,
    column: string = METRIC
  ): { projected: string; predicate: string; sql: string } => {
    const sql = dialect.renderer.renderAggregatedQuery({
      fromClause: 'tbl',
      columns: column === METRIC ? [] : [column],
      aggregations: [{ column, function: fn }],
      dateTruncs: [],
      filters: [{ column, function: fn, operator: 'gt', value: 1.5 }],
      sort: [],
      limit: null,
      rowCount: false,
      uniqueCount: false,
      qualifyColumn: dialect.qualifyColumn,
      qualifyProjection: undefined,
      typeByColumn: undefined,
      resolveColumnType: undefined,
      calculatedFields:
        column === METRIC
          ? [
              {
                outputName: METRIC,
                formula: FORMULA,
                type: declaredType,
                level: 'column',
                isAggregatedByReport: true,
              },
            ]
          : undefined,
    }).sql;
    const lines = sql.split('\n');
    // The single select item, `<aggregate> AS <quoted alias>`; the alias is the LAST ` AS `, since
    // a declared-type cast writes one of its own inside the aggregate.
    const item = lines[1].trim();
    const projected = item.slice(0, item.lastIndexOf(' AS '));
    const having = lines.find(line => line.startsWith('HAVING '));
    if (having === undefined) throw new Error(`no HAVING clause in:\n${sql}`);
    return { projected, predicate: having.slice('HAVING '.length).replace(/ > .*$/, ''), sql };
  };

  for (const fn of ['SUM', 'AVG', 'P50'] as const) {
    it(`${fn} over a float declaration: the predicate is the cast aggregate, not a second one`, () => {
      for (const dialect of dialects) {
        const { projected, predicate } = renderBoth(dialect, fn, dialect.float);
        expect(`${dialect.name}: ${predicate}`).toBe(`${dialect.name}: ${projected}`);
        // Guards the comparison above from passing vacuously on a dialect that emitted no cast:
        // shape 4b is only a wrong NUMBER where the projection casts and the predicate does not.
        expect(`${dialect.name}: ${projected.includes('CAST(')}`).toBe(`${dialect.name}: true`);
      }
    });
  }

  // The cast is deliberately narrow, and the predicate must stay as narrow as the projection:
  // casting here would change which values are equal or ordered, so both sides emit none.
  for (const fn of ['COUNT_DISTINCT', 'MIN', 'MAX'] as const) {
    it(`${fn} is excluded from the cast on BOTH sides, though the declaration is numeric`, () => {
      for (const dialect of dialects) {
        const { projected, predicate } = renderBoth(dialect, fn, dialect.float);
        expect(`${dialect.name}: ${predicate}`).toBe(`${dialect.name}: ${projected}`);
        expect(`${dialect.name}: ${predicate}`).not.toContain('CAST(');
      }
    });
  }

  // Casting an INTEGER declaration introduces the per-row truncation this rule removes, and
  // Spark truncates where the other four round. Both sides decline it, and for the same reason.
  it('never casts an INTEGER declaration on either side, though every dialect maps one', () => {
    for (const dialect of dialects) {
      expect(
        `${dialect.name}: ${dialect.renderer.castTypeForDeclaredType(dialect.integer)}`
      ).not.toBe(`${dialect.name}: undefined`);
      const { projected, predicate } = renderBoth(dialect, 'SUM', dialect.integer);
      expect(`${dialect.name}: ${predicate}`).toBe(`${dialect.name}: ${projected}`);
      expect(`${dialect.name}: ${predicate}`).not.toContain('CAST(');
    }
  });

  // An ORDINARY column is not affected, and must not become affected: BigQuery qualifies its
  // predicates and NOT its projection on purpose, so `SUM(src.`amount`)` in HAVING against
  // `SUM(`amount`)` in SELECT is two valid spellings of one column, not drift.
  it('leaves an ordinary column HAVING on the predicate qualifier the dialect chose', () => {
    const bigQuery = dialects.find(d => d.name === 'BigQuery')!;
    const { projected, predicate } = renderBoth(bigQuery, 'SUM', bigQuery.float, 'amount');
    expect(projected).toBe('SUM(`amount`)');
    expect(predicate).toBe('SUM(src.`amount`)');
  });
});
