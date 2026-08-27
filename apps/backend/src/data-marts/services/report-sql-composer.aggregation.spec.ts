import { ReportSqlComposerService } from './report-sql-composer.service';
import { Report } from '../entities/report.entity';
import { BigQueryQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-query.builder';
import { BigQueryClauseRenderer } from '../data-storage-types/bigquery/services/bigquery-clause-renderer';
import { BigQueryBlendedQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-blended-query-builder';
import { AthenaQueryBuilder } from '../data-storage-types/athena/services/athena-query.builder';
import {
  AthenaClauseRenderer,
  countPositionalPlaceholders,
} from '../data-storage-types/athena/services/athena-clause-renderer';
import { extractCteBody } from '@owox/test-utils';
import { BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import {
  AggregateFunction,
  ReportAggregateFunction,
} from '../dto/schemas/aggregate-function.schema';
import { buildBlendedFieldIndex } from './blended-field-index';
import { GroupRestriction } from '../dto/domain/group-restriction';
import { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import { FilterRule } from '../dto/schemas/filter-config.schema';
import { isCalculatedGroupingKey } from '../calculated-fields/calculated-plan-grain';

describe('ReportSqlComposerService — aggregations wiring', () => {
  const buildReport = (overrides: Partial<Report> = {}): Report =>
    ({
      id: 'rep-1',
      title: 'Report',
      dataMart: {
        id: 'dm-1',
        projectId: 'proj-1',
        definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
        storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
      },
      ...overrides,
    }) as unknown as Report;

  const createService = (
    decision: { needsBlending: boolean; blendedSql?: string; columnFilter?: string[] } = {
      needsBlending: false,
      columnFilter: ['channel', 'revenue'],
    }
  ) => {
    const blendedReportDataService = {
      resolveBlendingDecision: jest.fn().mockResolvedValue(decision),
    };
    const queryBuilderFacade = { buildQuery: jest.fn().mockResolvedValue('SELECT built') };
    const tableReferenceService = { resolveTableName: jest.fn().mockResolvedValue('p.d.t') };
    const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
    const blendableSchemaService = { computeBlendableSchema: jest.fn() };
    const service = new ReportSqlComposerService(
      blendedReportDataService as never,
      queryBuilderFacade as never,
      tableReferenceService as never,
      capabilityService as never,
      blendableSchemaService as never,
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
    );
    return { service, queryBuilderFacade, blendedReportDataService };
  };

  it('passes report.aggregationConfig into buildQuery as aggregations', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      columnConfig: ['channel', 'revenue'],
      aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ aggregations: [{ column: 'revenue', function: 'SUM' }] })
    );
  });

  // Post-join aggregation on a blended report: the blended SQL already contains
  // the outer GROUP BY, so compose returns it as-is (no rejection, no native build).
  it('returns the aggregated blended SQL when aggregationConfig is set and report resolves to blended path', async () => {
    const { service, queryBuilderFacade } = createService({
      needsBlending: true,
      blendedSql: 'WITH cte AS (...) SELECT channel, SUM(partner__cost) ... GROUP BY channel',
    });
    const report = buildReport({
      columnConfig: ['channel', 'partner__cost'],
      aggregationConfig: [{ column: 'channel', function: 'COUNT' }],
    } as Partial<Report>);

    const result = await service.compose(report, {} as never);
    expect(result.sql).toBe(
      'WITH cte AS (...) SELECT channel, SUM(partner__cost) ... GROUP BY channel'
    );
    // The native query builder must not be reached on the blended path.
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  it('does NOT throw when aggregationConfig is set but report does NOT resolve to blended path', async () => {
    const { service } = createService({
      needsBlending: false,
      columnFilter: ['channel', 'revenue'],
    });
    const report = buildReport({
      columnConfig: ['channel', 'revenue'],
      aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
    } as Partial<Report>);

    await expect(service.compose(report, {} as never)).resolves.toBeDefined();
  });

  it('never passes a rowCount flag to buildQuery — the concept no longer exists', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      columnConfig: ['channel', 'revenue'],
      aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
    } as Partial<Report>);

    await service.compose(report, {} as never);

    const [, , options] = (queryBuilderFacade.buildQuery as jest.Mock).mock.calls[0];
    expect(options).not.toHaveProperty('rowCount');
  });

  it('passes uniqueCount: true and primaryKeyColumns when uniqueCountConfig === true', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      uniqueCountConfig: true,
      dataMart: {
        id: 'dm-1',
        projectId: 'proj-1',
        definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
        storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', isPrimaryKey: true },
            { name: 'channel', type: 'STRING', isPrimaryKey: false },
          ],
        },
      },
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ uniqueCount: true, primaryKeyColumns: ['id'] })
    );
  });

  // Regression: the renderer omits the Unique Count metric when there is no PK, so a stored sort
  // on that label must be dropped too — otherwise ORDER BY references a column the SELECT lacks.
  it('drops a "Unique Count" sort rule when uniqueCountConfig is true but the PK was removed', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      uniqueCountConfig: true,
      sortConfig: [
        { column: 'channel', direction: 'asc' },
        { column: 'Unique Count', direction: 'desc' },
      ],
      dataMart: {
        id: 'dm-1',
        projectId: 'proj-1',
        definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
        storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
        // PK removed from the schema after the report was saved.
        schema: { fields: [{ name: 'channel', type: 'STRING', isPrimaryKey: false }] },
      },
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({
        primaryKeyColumns: [],
        sort: [{ column: 'channel', direction: 'asc' }],
      })
    );
  });

  it('keeps a "Unique Count" sort rule while the PK still exists', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      uniqueCountConfig: true,
      sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
      dataMart: {
        id: 'dm-1',
        projectId: 'proj-1',
        definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
        storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
        schema: {
          fields: [
            { name: 'id', type: 'INTEGER', isPrimaryKey: true },
            { name: 'channel', type: 'STRING', isPrimaryKey: false },
          ],
        },
      },
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ sort: [{ column: 'Unique Count', direction: 'desc' }] })
    );
  });

  it('passes uniqueCount: false and primaryKeyColumns: [] when uniqueCountConfig is null/false', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      uniqueCountConfig: null,
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ uniqueCount: false })
    );
  });

  it('passes report.dateTruncConfig into buildQuery as dateTruncs', async () => {
    const { service, queryBuilderFacade } = createService({
      needsBlending: false,
      columnFilter: ['date', 'revenue'],
    });
    const report = buildReport({
      columnConfig: ['date', 'revenue'],
      dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ dateTruncs: [{ column: 'date', unit: 'MONTH' }] })
    );
  });

  it('returns the aggregated blended SQL when dateTruncConfig is set and report resolves to blended path', async () => {
    const { service, queryBuilderFacade } = createService({
      needsBlending: true,
      blendedSql: 'WITH cte AS (...) SELECT DATE_TRUNC(...) ... GROUP BY ...',
    });
    const report = buildReport({
      columnConfig: ['date', 'partner__cost'],
      dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
    } as Partial<Report>);

    const result = await service.compose(report, {} as never);
    expect(result.sql).toBe('WITH cte AS (...) SELECT DATE_TRUNC(...) ... GROUP BY ...');
    expect(queryBuilderFacade.buildQuery).not.toHaveBeenCalled();
  });

  // Every query builder and every reader consumes the PLAN, never the schema field it was built
  // from, so the field's level has to travel on it. Missed, a row-level field reads as a
  // metric — which is a wrong GROUP BY and a wrong number, not an error anyone sees.
  describe('the calculated field level travels on the composed plan', () => {
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
    const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';

    const buildCalculatedReport = (
      calculated: Record<string, unknown>,
      aggregationConfig?: AggregationRule[]
    ) =>
      buildReport({
        columnConfig: ['channel', 'computed'],
        aggregationConfig,
        dataMart: {
          id: 'dm-1',
          projectId: 'proj-1',
          definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
          storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              { name: 'channel', type: 'STRING', status: 'CONNECTED' },
              { name: 'clicks', type: 'INTEGER', status: 'CONNECTED' },
              { name: 'impressions', type: 'INTEGER', status: 'CONNECTED' },
              { name: 'session_id', type: 'STRING', status: 'CONNECTED' },
              { name: 'user_id', type: 'STRING', status: 'CONNECTED' },
              { name: 'computed', type: 'STRING', status: 'CONNECTED', calculated },
            ],
          },
        },
      } as unknown as Partial<Report>);

    const composePlan = async (
      calculated: Record<string, unknown>,
      aggregationConfig?: AggregationRule[]
    ) => {
      const { service } = createService({
        needsBlending: false,
        columnFilter: ['channel', 'computed'],
      });
      const { calculatedFields } = await service.compose(
        buildCalculatedReport(calculated, aggregationConfig),
        {} as never
      );
      return calculatedFields;
    };

    it('carries level "column" for a row-level formula', async () => {
      expect(await composePlan({ formula: SESSION_KEY_FORMULA, level: 'column' })).toEqual([
        expect.objectContaining({ outputName: 'computed', level: 'column' }),
      ]);
    });

    it('carries level "metric" for a formula that aggregates', async () => {
      expect(await composePlan({ formula: CTR_FORMULA, level: 'metric' })).toEqual([
        expect.objectContaining({ outputName: 'computed', level: 'metric' }),
      ]);
    });

    // A field persisted before the level was derived carries none. It aggregated then and must
    // keep aggregating now — the fallback stays in `isRowLevelCalculatedField`, not here.
    it('reads a field persisted with no level as a metric', async () => {
      expect(await composePlan({ formula: CTR_FORMULA })).toEqual([
        expect.objectContaining({ outputName: 'computed', level: 'metric' }),
      ]);
    });

    // "Needs the output-controls path" and "is aggregated" are two questions that shared one
    // expression here. Only the SECOND one reads the level: the formula substitution
    // channel lives on the output-controls path, so a row-level-only selection must still cross
    // it — otherwise no `mainTableReference` is resolved, and on a SQL-defined mart the builder
    // has no source to select the formula's columns from.
    it('still takes the output-controls path when the only calculated field is row-level', async () => {
      const { service, queryBuilderFacade } = createService({
        needsBlending: false,
        columnFilter: ['channel', 'computed'],
      });

      await service.compose(
        buildCalculatedReport({ formula: SESSION_KEY_FORMULA, level: 'column' }),
        {} as never
      );

      expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
        'GOOGLE_BIGQUERY',
        expect.anything(),
        expect.objectContaining({ mainTableReference: 'p.d.t' })
      );
    });

    // `level` answers "does the formula aggregate?", and it once also answered "is the
    // field a grouping key?". A report aggregating a row-level field is where they diverge, and
    // the answer is decided HERE, at the plan factory — kept off the level, every downstream site
    // would re-derive it, and a field both grouped by and counted distinct returns 1 on every row.
    describe('an aggregation rule on a row-level field takes it off the grouping keys', () => {
      const planFor = async (
        calculated: Record<string, unknown>,
        aggregationConfig?: AggregationRule[]
      ) => (await composePlan(calculated, aggregationConfig))![0];

      it('is a grouping key when no rule names it', async () => {
        const plan = await planFor({ formula: SESSION_KEY_FORMULA, level: 'column' });
        expect(isCalculatedGroupingKey(plan)).toBe(true);
      });

      it('is NOT a grouping key when the report aggregates it, and stays row-level', async () => {
        const plan = await planFor({ formula: SESSION_KEY_FORMULA, level: 'column' }, [
          { column: 'computed', function: 'COUNT_DISTINCT' },
        ]);
        // The formula did not change, so neither did its level — only the grain did.
        expect(plan.level).toBe('column');
        expect(isCalculatedGroupingKey(plan)).toBe(false);
      });

      it('a rule naming another column leaves it a grouping key', async () => {
        const plan = await planFor({ formula: SESSION_KEY_FORMULA, level: 'column' }, [
          { column: 'channel', function: 'COUNT' },
        ]);
        expect(isCalculatedGroupingKey(plan)).toBe(true);
      });

      // An aggregate-level field already IS an aggregate, so it is never a grouping key and never
      // becomes one — no rule may even name it (AGGREGATION_ON_CALCULATED_FIELD).
      it('an aggregate-level field is never a grouping key', async () => {
        const plain = await planFor({ formula: CTR_FORMULA, level: 'metric' });
        expect(isCalculatedGroupingKey(plain)).toBe(false);
        const aggregated = await planFor({ formula: CTR_FORMULA, level: 'metric' }, [
          { column: 'computed', function: 'SUM' },
        ]);
        expect(aggregated.level).toBe('metric');
        expect(isCalculatedGroupingKey(aggregated)).toBe(false);
      });
    });
  });

  describe('composeTotals', () => {
    // Totals = a per-column summary: every SELECTED numeric field aggregated by ALL of its
    // allowed functions, over the full filtered dataset with NO grouping → a single row,
    // computed as a SEPARATE query. The real BigQuery builder is wired behind a stub facade
    // so the SQL shape is asserted end-to-end.
    const makeBqTotalsComposer = (
      numericColumns: string[],
      blendableSchema?: { blendedFields: unknown[] }
    ) => {
      const realBuilder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());
      const facade = {
        buildQuery: jest.fn(
          (
            _type: unknown,
            definition: Parameters<BigQueryQueryBuilder['buildQuery']>[0],
            options: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
          ) => realBuilder.buildQuery(definition, options)
        ),
      };
      // For a non-blended report resolveBlendingDecision returns columnFilter = columnConfig;
      // the derived totals plan projects only the numeric columns, so mock that here.
      const blendedReportDataService = {
        resolveBlendingDecision: jest
          .fn()
          .mockResolvedValue({ needsBlending: false, columnFilter: numericColumns }),
      };
      const tableReferenceService = { resolveTableName: jest.fn().mockResolvedValue('p.d.t') };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = {
        computeBlendableSchema: jest
          .fn()
          .mockResolvedValue(blendableSchema ?? { nativeFields: [], blendedFields: [] }),
      };
      // The composer validates the REPORT's own config before deriving a Totals restriction from
      // its HAVING rules (that precondition used to hold by call order alone).
      const validator = { validateForReport: jest.fn().mockResolvedValue(undefined) };
      const service = new ReportSqlComposerService(
        blendedReportDataService as never,
        facade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never,
        validator as never
      );
      return { service, facade, blendedReportDataService, blendableSchemaService, validator };
    };

    const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
      name,
      type,
      isPrimaryKey: false,
      status: 'CONNECTED',
      ...extra,
    });

    const buildTotalsReport = (
      overrides: Partial<Report> = {},
      fields: unknown[] = [
        field('order_date', 'DATE'),
        field('channel', 'STRING'),
        field('revenue', 'INTEGER'),
        field('quantity', 'INTEGER'),
      ]
    ) =>
      buildReport({
        dataMart: {
          id: 'dm-1',
          projectId: 'proj-1',
          definition: { type: 'table', fullyQualifiedName: 'p.d.t' },
          storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
          schema: { type: 'bigquery-data-mart-schema', fields },
        },
        ...overrides,
      } as unknown as Partial<Report>);

    it('totals = each selected numeric field × its allowed aggregations (SUM/AVG/MIN/MAX), NO GROUP BY, NO Row Count, WHERE preserved', async () => {
      const { service } = makeBqTotalsComposer(['revenue', 'quantity']);
      const report = buildTotalsReport({
        columnConfig: ['order_date', 'channel', 'revenue', 'quantity'],
        filterConfig: [{ column: 'channel', operator: 'eq', value: 'paid' }],
        sortConfig: [{ column: 'order_date', direction: 'asc' }],
        limitConfig: 100,
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      expect(result!.columns).toEqual(['revenue', 'quantity']);
      expect(result!.aggregations).toEqual([
        { column: 'revenue', function: 'SUM' },
        { column: 'revenue', function: 'AVG' },
        { column: 'revenue', function: 'MIN' },
        { column: 'revenue', function: 'MAX' },
        { column: 'quantity', function: 'SUM' },
        { column: 'quantity', function: 'AVG' },
        { column: 'quantity', function: 'MIN' },
        { column: 'quantity', function: 'MAX' },
      ]);
      expect(result!.sql).toContain('SUM(`revenue`) AS `revenue | SUM`');
      expect(result!.sql).toContain('MAX(`quantity`) AS `quantity | MAX`');
      expect(result!.sql).toContain('WHERE src.`channel` = @p0');
      expect(result!.sql).not.toMatch(/GROUP BY/);
      expect(result!.sql).not.toMatch(/ORDER BY/);
      expect(result!.sql).not.toMatch(/LIMIT/);
      expect(result!.sql).not.toContain('Row Count');
      // Non-numeric selected columns are not aggregated.
      expect(result!.sql).not.toContain('order_date aggregated');
      expect(result!.sql).not.toContain('channel aggregated');
    });

    it('computes totals even for a NON-aggregated report (independent of report.aggregationConfig)', async () => {
      const { service } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({ columnConfig: ['channel', 'revenue'] } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      expect(result!.columns).toEqual(['revenue']);
      expect(result!.aggregations.map(a => a.function)).toEqual(['SUM', 'AVG', 'MIN', 'MAX']);
    });

    it('honors a per-field allowedAggregations override', async () => {
      const { service } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({ columnConfig: ['revenue'] } as Partial<Report>, [
        field('revenue', 'INTEGER', { allowedAggregations: ['SUM'] }),
      ]);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.aggregations).toEqual([{ column: 'revenue', function: 'SUM' }]);
      expect(result!.sql).toContain('SUM(`revenue`) AS `revenue | SUM`');
      expect(result!.sql).not.toContain('Average');
    });

    it('projects all numeric schema fields when the report has no explicit columnConfig', async () => {
      const { service } = makeBqTotalsComposer(['revenue', 'quantity']);
      const report = buildTotalsReport({ columnConfig: undefined } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.columns).toEqual(['revenue', 'quantity']);
    });

    it('projects all numeric schema fields when columnConfig is null', async () => {
      const { service } = makeBqTotalsComposer(['revenue', 'quantity']);
      const report = buildTotalsReport({ columnConfig: null } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.columns).toEqual(['revenue', 'quantity']);
    });

    // An MCP request selecting ONLY the Unique Count pseudo-field arrives here with an empty
    // projection — the caller chose no dimensions, so there is nothing to total. That reading is
    // the METRICS-ONLY one, the same rule resolveReportDataHeaders emits its (dimensionless)
    // header list by.
    it.each([
      ['a joined Unique Count', ['orders']],
      ['the main Unique Count', true],
    ])(
      'returns null for an empty columnConfig on a metrics-only plan — %s (no native build, no schema resolution, no decision resolved)',
      async (_case, uniqueCountConfig) => {
        const { service, facade, blendedReportDataService, blendableSchemaService } =
          makeBqTotalsComposer([]);
        const report = buildTotalsReport({
          columnConfig: [],
          uniqueCountConfig,
        } as Partial<Report>);

        expect(await service.composeTotals(report, {} as never)).toBeNull();
        expect(facade.buildQuery).not.toHaveBeenCalled();
        expect(blendedReportDataService.resolveBlendingDecision).not.toHaveBeenCalled();
        expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
      }
    );

    // `[]` also lives in PERSISTED rows (report-column-config.schema.ts accepts it so pre-existing
    // rows stay loadable). Such a report projects every native column on the report path, and it
    // has had Totals over every numeric one for months — it must not lose them silently.
    it('keeps Totals for a legacy EMPTY columnConfig with no metrics of its own', async () => {
      const { service } = makeBqTotalsComposer(['revenue', 'quantity']);
      const report = buildTotalsReport({ columnConfig: [] } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.columns).toEqual(['revenue', 'quantity']);
      expect(result!.sql).toContain('SUM(`revenue`) AS `revenue | SUM`');
    });

    it('returns null when no selected column is numeric (no native build, no decision resolved)', async () => {
      const { service, facade, blendedReportDataService } = makeBqTotalsComposer([]);
      const report = buildTotalsReport({
        columnConfig: ['order_date', 'channel'],
      } as Partial<Report>);

      expect(await service.composeTotals(report, {} as never)).toBeNull();
      expect(facade.buildQuery).not.toHaveBeenCalled();
      expect(blendedReportDataService.resolveBlendingDecision).not.toHaveBeenCalled();
    });

    // Requirement (WI §D): a COUNT_DISTINCT metric over a STRING field with no grouping
    // must appear in totals — totals follow the field's governance-allowed functions, not a
    // numeric-type gate (governance permits COUNT/COUNT_DISTINCT on STRING).
    it('scorecard: COUNT_DISTINCT over a STRING metric (NO grouping) is included in totals (WI §D)', async () => {
      const { service } = makeBqTotalsComposer(['country']);
      const report = buildTotalsReport(
        {
          columnConfig: ['country'],
          aggregationConfig: [{ column: 'country', function: 'COUNT_DISTINCT' }],
        } as Partial<Report>,
        // No schema-level metric/dimension role in practice — STRING defaults to 'dimension'.
        // The ONLY signal that `country` is a metric here is that the report aggregates it.
        [field('country', 'STRING')]
      );

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      expect(result!.columns).toContain('country');
      expect(result!.aggregations).toEqual(
        expect.arrayContaining([{ column: 'country', function: 'COUNT_DISTINCT' }])
      );
    });

    // ANY_VALUE (an arbitrary row's value) and STRING_AGG (whole-column concat) are meaningless
    // as a single grand-total number, so they are excluded from the totals summary for EVERY
    // field even when the field's allowed set (per-field override or type-default) permits them.
    it('excludes ANY_VALUE and STRING_AGG from totals even when the field allows them', async () => {
      const { service } = makeBqTotalsComposer(['country']);
      const report = buildTotalsReport(
        {
          columnConfig: ['country'],
          aggregationConfig: [{ column: 'country', function: 'COUNT_DISTINCT' }],
        } as Partial<Report>,
        [
          field('country', 'STRING', {
            allowedAggregations: [
              'MIN',
              'MAX',
              'ANY_VALUE',
              'COUNT',
              'COUNT_DISTINCT',
              'STRING_AGG',
            ],
          }),
        ]
      );

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      const fns = result!.aggregations.map(a => a.function);
      expect(fns).not.toContain('ANY_VALUE');
      expect(fns).not.toContain('STRING_AGG');
      // The meaningful ones survive.
      expect(fns).toEqual(expect.arrayContaining(['COUNT', 'COUNT_DISTINCT', 'MIN', 'MAX']));
    });

    it('restricts totals to the groups the metric filter keeps, keeping WHERE filters', async () => {
      const { service } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['channel', 'revenue'],
        filterConfig: [
          { column: 'channel', operator: 'eq', value: 'paid' },
          { column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 },
        ],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      // The Totals query itself still has no grouping...
      expect(result!.sql).toContain('WHERE src.`channel` = @p0');
      const outerTail = result!.sql.slice(result!.sql.indexOf(') AS `_kept_groups`'));
      expect(outerTail).not.toMatch(/GROUP BY/);
      expect(outerTail).not.toMatch(/HAVING/);
      // ...but it is joined to the groups the report keeps, recomputed with the report's own
      // WHERE, grouping and metric filter. Totals therefore summarise the rows the report shows.
      expect(result!.sql).toContain('JOIN (');
      expect(result!.sql).toContain('HAVING SUM(src.`revenue`) > @kgh0');
      expect(result!.sql).toContain('WHERE src.`channel` = @kgp0');
    });

    // The restriction must be regrouped at the REPORT's grain. A Totals plan sets
    // `dateTruncConfig: null` (it has no GROUP BY of its own), so the buckets have to travel with
    // the restriction — otherwise the surviving groups are recomputed per raw day where the
    // report grouped by month, and a month whose total clears the filter can contain no single
    // day that does: Totals would read 0 while the report shows the month.
    it('recomputes the kept groups at the report date bucket, not the raw column', async () => {
      const { service } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['order_date', 'revenue'],
        dateTruncConfig: [{ column: 'order_date', unit: 'MONTH' }],
        filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
      } as unknown as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      const bucket = 'DATE_TRUNC(src.`order_date`, MONTH)';
      expect(result!.sql).toContain(`GROUP BY\n  ${bucket}`);
      expect(result!.sql).toContain(`ON ((${bucket}) = `);
      // The bare column must never become the grouping key.
      expect(result!.sql).not.toMatch(/GROUP BY\n {2}src\.`order_date`\n/);
    });

    // `reportDimensions` (the restriction's `dimensions`) is built from "selected column with no
    // aggregation of its own" — true for a real dimension like `channel`, but ALSO trivially true
    // for a calculated field (it can never legally appear in aggregationConfig). Left unfiltered,
    // `ctr` would reach `renderKeptGroupsJoin`, which hands `restriction.dimensions` to
    // `renderAggregatedSelect` with NO calculated-metric exclusion — a bare, nonexistent `ctr`
    // column reference and a guaranteed `Unrecognized name` on every dialect.
    it('never leaks the calculated field into the kept-groups restriction dimensions', async () => {
      const ctrFormula =
        'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
      const { service } = makeBqTotalsComposer(['revenue', 'ctr']);
      const report = buildTotalsReport(
        {
          columnConfig: ['channel', 'revenue', 'ctr'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
        } as Partial<Report>,
        [
          field('channel', 'STRING'),
          field('revenue', 'INTEGER'),
          field('clicks', 'INTEGER'),
          field('impressions', 'INTEGER'),
          field('ctr', 'FLOAT', { calculated: { formula: ctrFormula, level: 'metric' } }),
        ]
      );

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      // The restriction's own grouped subquery — from its opening JOIN to its closing alias —
      // must group by the REAL dimension only and never reference the metric as a bare column.
      const keptGroupsBlock = result!.sql.slice(
        result!.sql.indexOf('JOIN ('),
        result!.sql.indexOf(') AS `_kept_groups`')
      );
      expect(keptGroupsBlock).toMatch(/`channel`/);
      expect(keptGroupsBlock).not.toMatch(/`ctr`/);
      // The metric still renders through its own formula channel in the OUTER select, unaffected.
      expect(result!.sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      expect(result!.calculatedFields).toEqual([
        expect.objectContaining({ outputName: 'ctr', formula: ctrFormula }),
      ]);
    });

    // THE case the whole feature is ordered for: "CTR by country" — a breakdown whose ONLY
    // aggregate is the calculated field. `deriveTotalsAggregations` correctly invents no
    // SUM/AVG/MIN/MAX rule for it (it already IS an aggregate), so `aggregations` is empty, and
    // reading that as "nothing to total" returned null → the consumer is told `not_available` and
    // computes the overall CTR itself as the AVERAGE of the per-country ratios: exactly the
    // non-additive re-aggregation this feature exists to remove. Every other calculated-metric
    // totals test above selects `revenue` alongside `ctr`, which supplies a non-zero
    // `aggregations` and hides this.
    it('composes Totals for a report whose ONLY aggregate is a calculated field', async () => {
      const ctrFormula =
        'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
      const { service } = makeBqTotalsComposer(['ctr']);
      const report = buildTotalsReport(
        {
          columnConfig: ['country', 'ctr'],
        } as Partial<Report>,
        [
          field('country', 'STRING'),
          field('clicks', 'INTEGER'),
          field('impressions', 'INTEGER'),
          field('ctr', 'FLOAT', { calculated: { formula: ctrFormula, level: 'metric' } }),
        ]
      );

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      expect(result!.aggregations).toEqual([]);
      expect(result!.columns).toEqual(['ctr']);
      expect(result!.calculatedFields).toEqual([
        expect.objectContaining({ outputName: 'ctr', formula: ctrFormula }),
      ]);
      // The true ratio of the sums over the whole filtered dataset — one row, no GROUP BY.
      expect(result!.sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      expect(result!.sql).not.toMatch(/GROUP BY/);
      expect(result!.sql).not.toContain('Row Count');
      // `country` is a dimension of the REPORT, not of its grand total.
      expect(result!.sql).not.toContain('`country`');
    });

    // A metrics-only report ("total revenue, only if above 1000") has no dimensions at all, so
    // the restriction has nothing to project — and an empty SELECT list is a syntax error.
    it('restricts a metrics-only report through a dimensionless CROSS JOIN', async () => {
      const { service } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['revenue'],
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
      } as unknown as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.sql).toContain('CROSS JOIN (');
      expect(result!.sql).toMatch(/SELECT\n {2}1 AS /);
      expect(result!.sql).not.toMatch(/SELECT\s*\n\s*FROM/);
      expect(result!.sql).toContain('HAVING SUM(src.`revenue`) > @kgh0');
    });

    // A ROW-LEVEL calculated field is a DIMENSION, and Totals is the one surface that must keep it
    // out. `deriveTotalsAggregations` admitted EVERY calculated field, so a selected row-level one
    // reached the totals `columns` and came back from `compose` as a plan with `level: 'column'` —
    // which the aggregated renderer then GROUPS BY. The Totals query returned one row per
    // row-level group and `ReportTotalsService.computeTotals` publishes `dataRows[0]` as the grand
    // total: an arbitrary group's SUM, labelled `calculated_by_owox`, with no exception, no log
    // line, and no degradation signal.
    describe('a ROW-LEVEL calculated field is never a totals metric', () => {
      const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';
      // Declared FLOAT deliberately: the declared type is the analyst's free choice, so this field
      // PASSES `isTotalsEligible`'s numeric test. Only the level rules it out.
      const REVENUE_PER_CLICK_FORMULA =
        '{{ref field="revenue"}} / NULLIF({{ref field="clicks"}}, 0)';
      const CTR_FORMULA =
        'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';

      const FIELDS = [
        field('country', 'STRING'),
        field('revenue', 'INTEGER'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('session_id', 'STRING'),
        field('user_id', 'STRING'),
        field('session_key', 'STRING', {
          calculated: { formula: SESSION_KEY_FORMULA, level: 'column' },
        }),
        field('revenue_per_click', 'FLOAT', {
          calculated: { formula: REVENUE_PER_CLICK_FORMULA, level: 'column' },
        }),
        field('ctr', 'FLOAT', { calculated: { formula: CTR_FORMULA, level: 'metric' } }),
      ];

      // The stock fixture PINS `columnFilter`, which would then decide the composed SQL instead of
      // the totals plan — asserting the gate against a mock rather than against the composer. The
      // real `resolveBlendingDecision` echoes a non-blended plan's own projection back, so echo it.
      const makeEchoingComposer = () => {
        const bundle = makeBqTotalsComposer([]);
        bundle.blendedReportDataService.resolveBlendingDecision.mockImplementation(
          (plan: { columnConfig?: string[] }) => ({
            needsBlending: false,
            columnFilter: plan.columnConfig,
          })
        );
        return bundle;
      };

      // The silent case: with no other totals column the query is VALID, returns N rows, and the
      // first one is published as the report-wide total.
      it('produces NO Totals block when the only selected calculated field is row-level', async () => {
        const { service, facade } = makeEchoingComposer();
        const report = buildTotalsReport(
          { columnConfig: ['country', 'revenue_per_click'] } as Partial<Report>,
          FIELDS
        );

        expect(await service.composeTotals(report, {} as never)).toBeNull();
        expect(facade.buildQuery).not.toHaveBeenCalled();
      });

      // The feature's own headline example: `country` + a row-level `session_key` + a numeric
      // column. Before Tasks 4/5 this emitted a bare non-grouped column beside an aggregate — a
      // hard warehouse error; after them it emits a GROUP BY and a plausible wrong number.
      it('totals the numeric column beside it and nothing for the row-level field', async () => {
        const { service } = makeEchoingComposer();
        const report = buildTotalsReport(
          {
            columnConfig: ['country', 'session_key', 'revenue'],
            aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          } as Partial<Report>,
          FIELDS
        );

        const result = await service.composeTotals(report, {} as never);

        expect(result!.columns).toEqual(['revenue']);
        expect(result!.calculatedFields).toBeUndefined();
        expect(result!.sql).toContain('SUM(`revenue`) AS `revenue | SUM`');
        expect(result!.sql).not.toContain('session_key');
        expect(result!.sql).not.toMatch(/GROUP BY/);
      });

      // The gate is on LEVEL, not on "is calculated": an aggregating formula is already a
      // grand-total-safe aggregate and keeps its Totals through its own formula channel.
      it('still totals an AGGREGATING calculated field selected beside a row-level one', async () => {
        const { service } = makeEchoingComposer();
        const report = buildTotalsReport(
          { columnConfig: ['country', 'session_key', 'ctr'] } as Partial<Report>,
          FIELDS
        );

        const result = await service.composeTotals(report, {} as never);

        expect(result!.columns).toEqual(['ctr']);
        expect(result!.calculatedFields).toEqual([
          expect.objectContaining({ outputName: 'ctr', level: 'metric' }),
        ]);
        expect(result!.sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
        expect(result!.sql).not.toContain('session_key');
        expect(result!.sql).not.toMatch(/GROUP BY/);
      });

      // Kept OUT of the totals metrics, but it must stay IN the kept-groups restriction: the
      // report groups by `country` AND the expression, so a restriction reproducing `country`
      // alone is coarser than the report and the metric filter keeps a different row set than the
      // report shows — which compounds the gate above rather than being fixed by it.
      it('reproduces the report grain in the kept groups, row-level expression included', async () => {
        const { service } = makeEchoingComposer();
        const report = buildTotalsReport(
          {
            columnConfig: ['country', 'session_key', 'revenue'],
            aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
            filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
          } as unknown as Partial<Report>,
          FIELDS
        );

        const result = await service.composeTotals(report, {} as never);

        const expr = 'CONCAT(src.`session_id`, src.`user_id`)';
        const keptGroups = result!.sql.slice(
          result!.sql.indexOf('JOIN ('),
          result!.sql.indexOf(') AS `_kept_groups`')
        );
        expect(keptGroups).toContain(`GROUP BY\n  src.\`country\`,\n  ${expr}`);
        expect(keptGroups).toContain(`${expr} AS \`_owox_kg_1\``);
        expect(keptGroups).toContain('HAVING SUM(src.`revenue`) > @kgh0');
        // Both keys bind, or the restriction is coarser than the report it reproduces.
        expect(result!.sql).toContain('(src.`country`) = (`_kept_groups`.`_owox_kg_0`)');
        expect(result!.sql).toContain(`(${expr}) = (\`_kept_groups\`.\`_owox_kg_1\`)`);
        // The Totals query itself still has no grouping of its own.
        const outerTail = result!.sql.slice(result!.sql.indexOf(') AS `_kept_groups`'));
        expect(outerTail).not.toMatch(/GROUP BY/);
      });

      // A report may apply an aggregation to a row-level field, and the field then stops
      // being a grouping key. Both halves above have to follow it there.
      describe('once the REPORT aggregates it', () => {
        const COUNT_SESSIONS: AggregationRule[] = [
          { column: 'session_key', function: 'COUNT_DISTINCT' },
          { column: 'revenue', function: 'SUM' },
        ];

        /**
         * A Calculated Field is NEVER a Totals metric, whatever the report does
         * with it. The analyst sees a `COUNT_DISTINCT` column with no Totals value: a visible
         * absence rather than a wrong number.
         *
         * Pinned because `deriveTotalsAggregations` reaches that outcome by the wrong ROUTE. The
         * row-level skip fires BEFORE `isTotalsEligible` can see the field, and that rule reads
         * "the report aggregates it" as the metric signal for a non-numeric field — so the skip is
         * the only thing keeping an aggregated `session_key` out. Delete it as an oversight and
         * Totals silently gains a `session_key | COUNTUNIQUE` grand total. A later slice that wants
         * that has to change this rule, not stumble into the code.
         */
        it('an aggregation rule on it still does not make it a totals metric', async () => {
          const { service } = makeEchoingComposer();
          const report = buildTotalsReport(
            {
              columnConfig: ['country', 'session_key', 'revenue'],
              aggregationConfig: COUNT_SESSIONS,
            } as Partial<Report>,
            FIELDS
          );

          const result = await service.composeTotals(report, {} as never);

          expect(result!.columns).toEqual(['revenue']);
          expect(result!.aggregations.map(rule => rule.column)).not.toContain('session_key');
          expect(result!.calculatedFields).toBeUndefined();
          expect(result!.sql).not.toContain('session_key');
          expect(result!.sql).not.toContain('COUNTUNIQUE');
        });

        // The other half, and the one that breaks: the restriction reproduces the REPORT's
        // grouping, and the report stopped grouping by this field the moment it aggregated it.
        // Reproduced as a key the restriction is one key FINER than the report, so the HAVING keeps
        // a different row set and Totals summarise rows the report does not show. Since that refusal it
        // does not even get that far — the restriction renders from an EMPTY rule list, so the
        // renderer refuses a plan it has no function for and the whole Totals block 500s.
        it('drops it from the kept-groups restriction, which the report no longer groups by', async () => {
          const { service } = makeEchoingComposer();
          const report = buildTotalsReport(
            {
              columnConfig: ['country', 'session_key', 'revenue'],
              aggregationConfig: COUNT_SESSIONS,
              filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
            } as unknown as Partial<Report>,
            FIELDS
          );

          const result = await service.composeTotals(report, {} as never);

          const keptGroups = result!.sql.slice(
            result!.sql.indexOf('JOIN ('),
            result!.sql.indexOf(') AS `_kept_groups`')
          );
          expect(keptGroups).toContain('GROUP BY\n  src.`country`');
          expect(keptGroups).not.toContain('CONCAT(');
          expect(keptGroups).toContain('HAVING SUM(src.`revenue`) > @kgh0');
          // `country` is the only key the report has left, so it is the only join pair.
          expect(result!.sql).toContain('(src.`country`) = (`_kept_groups`.`_owox_kg_0`)');
          expect(result!.sql).not.toContain('_owox_kg_1');
        });

        // The discriminator for reading the PLAN rather than the rules in hand: a rule naming
        // another column says nothing about this field, so it is still a grouping key and the
        // restriction must still reproduce its expression.
        it('a rule on another column leaves it in the restriction, expression and all', async () => {
          const { service } = makeEchoingComposer();
          const report = buildTotalsReport(
            {
              columnConfig: ['country', 'session_key', 'revenue'],
              aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
              filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
            } as unknown as Partial<Report>,
            FIELDS
          );

          const result = await service.composeTotals(report, {} as never);

          const keptGroups = result!.sql.slice(
            result!.sql.indexOf('JOIN ('),
            result!.sql.indexOf(') AS `_kept_groups`')
          );
          expect(keptGroups).toContain('CONCAT(src.`session_id`, src.`user_id`)');
          expect(result!.sql).toContain('_owox_kg_1');
        });
      });
    });

    // The clause a predicate belongs in is decided ONCE, from the rule AND the
    // field's level, and carried on the rule. `rule.function` cannot express this case — an
    // aggregate-level Calculated Field's aggregation lives inside the formula, so its rule carries
    // no function and, by AGGREGATION_ON_CALCULATED_FIELD, never can. Split on `rule.function`
    // here and such a report builds NO restriction at all (`renderKeptGroupsJoin` early-returns on
    // an empty `having`), so Totals summarise rows the report hides — with no error.
    describe('a filter on a calculated field routes to the clause its level asks for', () => {
      const CTR_FORMULA =
        'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
      const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';

      const CLAUSE_FIELDS = [
        field('country', 'STRING'),
        field('revenue', 'INTEGER'),
        field('clicks', 'INTEGER'),
        field('impressions', 'INTEGER'),
        field('session_id', 'STRING'),
        field('user_id', 'STRING'),
        field('ctr', 'FLOAT', { calculated: { formula: CTR_FORMULA, level: 'metric' } }),
        field('session_key', 'STRING', {
          calculated: { formula: SESSION_KEY_FORMULA, level: 'column' },
        }),
      ];

      // A recording stub in place of the dialect builder: this task decides the CLAUSE and renders
      // nothing new, so the claim is about the options the builder is handed, not about SQL.
      const makeRecordingComposer = () => {
        const facade = { buildQuery: jest.fn().mockResolvedValue('SELECT built') };
        const blendedReportDataService = {
          resolveBlendingDecision: jest.fn(async (plan: { columnConfig?: string[] }) => ({
            needsBlending: false,
            columnFilter: plan.columnConfig,
          })),
        };
        const validator = { validateForReport: jest.fn().mockResolvedValue(undefined) };
        const service = new ReportSqlComposerService(
          blendedReportDataService as never,
          facade as never,
          { resolveTableName: jest.fn().mockResolvedValue('p.d.t') } as never,
          { isSupported: jest.fn().mockReturnValue(true) } as never,
          {
            computeBlendableSchema: jest
              .fn()
              .mockResolvedValue({ nativeFields: [], blendedFields: [] }),
          } as never,
          validator as never
        );
        return { service, facade };
      };

      type BuiltOptions = {
        filters?: FilterRule[];
        groupRestriction?: GroupRestriction;
      };
      const optionsOf = (facade: { buildQuery: jest.Mock }): BuiltOptions =>
        facade.buildQuery.mock.calls[0][2] as BuiltOptions;

      it('routes an AGGREGATE-level calculated filter into a non-empty restriction', async () => {
        const { service, facade } = makeRecordingComposer();
        const report = buildTotalsReport(
          {
            columnConfig: ['country', 'revenue', 'ctr'],
            filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
          } as unknown as Partial<Report>,
          CLAUSE_FIELDS
        );

        await service.composeTotals(report, {} as never);

        const options = optionsOf(facade);
        expect(options.groupRestriction?.having).toEqual([
          expect.objectContaining({ column: 'ctr', clause: 'having' }),
        ]);
        // The report groups by its plain dimensions; the metric is never one of them.
        expect(options.groupRestriction?.dimensions).toEqual(['country', 'revenue']);
        // ...and the rule is NOT left in the Totals plan's WHERE, where it would compare an
        // aggregate in a query that has no GROUP BY at all.
        expect(options.filters ?? []).toEqual([]);
      });

      it('leaves a ROW-LEVEL calculated filter in WHERE and builds no restriction', async () => {
        const { service, facade } = makeRecordingComposer();
        const report = buildTotalsReport(
          {
            columnConfig: ['country', 'session_key', 'revenue'],
            filterConfig: [{ column: 'session_key', operator: 'eq', value: 'u1-s1' }],
          } as unknown as Partial<Report>,
          CLAUSE_FIELDS
        );

        await service.composeTotals(report, {} as never);

        const options = optionsOf(facade);
        expect(options.groupRestriction).toBeUndefined();
        expect(options.filters).toEqual([
          expect.objectContaining({ column: 'session_key', clause: 'where' }),
        ]);
      });

      it('routes each level to its own clause when a report carries both', async () => {
        const { service, facade } = makeRecordingComposer();
        const report = buildTotalsReport(
          {
            columnConfig: ['country', 'session_key', 'revenue', 'ctr'],
            filterConfig: [
              { column: 'session_key', operator: 'eq', value: 'u1-s1' },
              { column: 'ctr', operator: 'gt', value: 0.5 },
              { column: 'country', operator: 'eq', value: 'US' },
            ],
          } as unknown as Partial<Report>,
          CLAUSE_FIELDS
        );

        await service.composeTotals(report, {} as never);

        const options = optionsOf(facade);
        expect(options.filters?.map(rule => rule.column)).toEqual(['session_key', 'country']);
        expect(options.groupRestriction?.having?.map(rule => rule.column)).toEqual(['ctr']);
      });

      // The plan the restriction renders its own HAVING from. `calculatedDimensions` deliberately
      // drops a field the report AGGREGATES — it stopped being a grouping key — so without a
      // channel of its own the subquery compared the field's NAME: `COUNT(DISTINCT "session_key")`
      // over a FROM that has no such column, and the Totals row vanished from a correctly filtered
      // report with the reason only in the server log.
      it('carries the plan behind a filter on an aggregated row-level field', async () => {
        const { service, facade } = makeRecordingComposer();
        const report = buildTotalsReport(
          {
            columnConfig: ['country', 'session_key', 'revenue'],
            aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
            filterConfig: [
              { column: 'session_key', function: 'COUNT_DISTINCT', operator: 'gt', value: 2 },
            ],
          } as unknown as Partial<Report>,
          CLAUSE_FIELDS
        );

        await service.composeTotals(report, {} as never);

        const options = optionsOf(facade);
        expect(options.groupRestriction?.calculatedHavingMetrics).toEqual([
          expect.objectContaining({ outputName: 'session_key', formula: SESSION_KEY_FORMULA }),
        ]);
        // …and it is still not a grouping key, which is what makes the second channel necessary
        // rather than a duplicate of the first.
        expect(options.groupRestriction?.calculatedDimensions).toBeUndefined();
      });
    });

    // The restriction is derived from the REPORT's HAVING rules, which are lifted OUT of
    // filterConfig here — so the totals plan's own validation never sees them. That held by call
    // order alone (compose runs before computeTotals), and computeTotals is a public service.
    it("validates the report's own config before deriving a restriction from its HAVING", async () => {
      const { service, validator } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['channel', 'revenue'],
        filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
      } as unknown as Partial<Report>);

      await service.composeTotals(report, {} as never);

      expect(validator.validateForReport).toHaveBeenCalledTimes(1);
      // The REPORT's rules, not the metrics-only totals plan's.
      const args = validator.validateForReport.mock.calls[0][0] as {
        filterConfig: unknown;
        columnConfig: unknown;
      };
      expect(args.filterConfig).toEqual(report.filterConfig);
      expect(args.columnConfig).toEqual(['channel', 'revenue']);
    });

    it('skips that validation when the report carries no metric filter', async () => {
      const { service, validator } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['channel', 'revenue'],
        filterConfig: [{ column: 'channel', operator: 'eq', value: 'paid' }],
      } as unknown as Partial<Report>);

      await service.composeTotals(report, {} as never);

      expect(validator.validateForReport).not.toHaveBeenCalled();
    });

    it('re-resolves the blending decision against the metrics-only totals plan (no Unique Count)', async () => {
      const { service, blendedReportDataService } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['order_date', 'channel', 'revenue'],
      } as Partial<Report>);

      await service.composeTotals(report, {} as never);

      expect(blendedReportDataService.resolveBlendingDecision).toHaveBeenCalledTimes(1);
      const planArg = blendedReportDataService.resolveBlendingDecision.mock.calls[0][0];
      expect(planArg.columnConfig).toEqual(['revenue']);
      expect(planArg.uniqueCountConfig).toBeNull();
    });

    it('does NOT mutate the input report', async () => {
      const { service } = makeBqTotalsComposer(['revenue']);
      const columnConfig = ['order_date', 'channel', 'revenue'];
      const report = buildTotalsReport({
        columnConfig,
        sortConfig: [{ column: 'order_date', direction: 'asc' as const }],
        limitConfig: 100,
      } as Partial<Report>);

      await service.composeTotals(report, {} as never);

      expect(report.columnConfig).toBe(columnConfig);
      expect(report.columnConfig).toEqual(['order_date', 'channel', 'revenue']);
      expect(report.limitConfig).toBe(100);
    });

    // A blended report selecting a JOINED numeric column. Totals must include that joined
    // numeric field aggregated by its post-join allowed set, and — like the main-mart
    // totals — emit NO GROUP BY (every projected column is an aggregated metric).
    const blendedField = (
      name: string,
      type: string,
      postJoinAggregations?: ReportAggregateFunction[],
      // The PRE-join roll-up run inside the bottom-up CTE. Must be valid for the field type —
      // e.g. a STRING joined field cannot roll up with SUM, so pass ANY_VALUE there. Pre-join
      // aggregates are the base function set (no percentiles).
      preJoinAggregation: AggregateFunction = 'SUM'
    ): BlendedFieldDto => {
      const f = new BlendedFieldDto();
      f.name = name;
      f.sourceRelationshipId = 'rel-1';
      f.sourceDataMartId = 'dm-partner';
      f.sourceDataMartTitle = 'Partner';
      f.targetAlias = 'partner';
      f.originalFieldName = name.replace(/^partner__/, '');
      f.type = type;
      f.alias = '';
      f.description = '';
      f.isHidden = false;
      f.aggregateFunction = preJoinAggregation;
      f.postJoinAggregations = postJoinAggregations;
      f.transitiveDepth = 1;
      f.aliasPath = 'partner';
      f.outputPrefix = 'Partner';
      return f;
    };

    // Wires the real BigQuery blended builder behind resolveBlendingDecision so the totals
    // SQL is built end-to-end through the blended path, exactly as a blended report would.
    const makeBlendedTotalsComposer = (blendedFields: BlendedFieldDto[]) => {
      const realBlendedBuilder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());
      const blendedReportDataService = {
        resolveBlendingDecision: jest.fn(
          async (plan: Partial<Report> & { groupRestriction?: GroupRestriction }) => {
            const relationship = {
              id: 'rel-1',
              joinConditions: [{ sourceFieldName: 'partner_id', targetFieldName: 'id' }],
            };
            const requested = blendedFields.filter(f => (plan.columnConfig ?? []).includes(f.name));
            const built = realBlendedBuilder.buildBlendedQuery({
              mainTableReference: 'p.d.main',
              mainDataMartTitle: 'Main',
              mainDataMartUrl: 'http://x',
              chains: [
                {
                  relationship: relationship as never,
                  targetTableReference: 'p.d.partner',
                  parentAlias: 'main',
                  cteName: 'partner',
                  blendedFields: requested.map(f => ({
                    targetFieldName: f.originalFieldName,
                    outputAlias: f.name,
                    isHidden: false,
                    aggregateFunction: f.aggregateFunction,
                  })),
                  targetDataMartTitle: 'Partner',
                  targetDataMartUrl: 'http://y',
                },
              ],
              columns: plan.columnConfig ?? [],
              aggregations: plan.aggregationConfig ?? undefined,
              // Totals under a metric filter travel as a restriction rather than a HAVING, so a
              // fixture that drops it composes a query the real service never would.
              groupRestriction: plan.groupRestriction,
              columnTypes: { postJoin: new Map(blendedFields.map(f => [f.name, f.type])) },
              // Mirror the real BlendedReportDataService.resolveBlendingDecision, which always
              // builds and passes a fieldIndex before invoking buildBlendedQuery — a joined
              // COUNT_DISTINCT metric routes through a sleeve CTE that resolves the metric's raw
              // column via context.fieldIndex.
              fieldIndex: buildBlendedFieldIndex({
                blendedFields,
                availableSources: [...new Set(blendedFields.map(f => f.aliasPath))].map(
                  aliasPath => ({ aliasPath, isIncluded: true })
                ),
              } as never),
            });
            return { needsBlending: true, blendedSql: built.sql, params: built.params };
          }
        ),
      };
      const tableReferenceService = { resolveTableName: jest.fn().mockResolvedValue('p.d.main') };
      const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
      const blendableSchemaService = {
        computeBlendableSchema: jest.fn().mockResolvedValue({ nativeFields: [], blendedFields }),
      };
      const service = new ReportSqlComposerService(
        blendedReportDataService as never,
        { buildQuery: jest.fn() } as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
      );
      return { service, blendedReportDataService, blendableSchemaService };
    };

    /**
     * Totals + a metric filter + a ROW-LEVEL calculated field, on a report that JOINS — the shape where composer and builder have to agree. `composeTotals` keeps the
     * field out of the totals metrics (it is a dimension) and puts its plan on the restriction, so
     * the builder is the only thing that can render it: the field's NAME is in the restriction's
     * dimension list while `calculatedFields` deliberately excludes it.
     */
    it('restricts blended Totals at the report own grain, row-level expression included', async () => {
      const fields = [blendedField('partner__cost', 'FLOAT', ['SUM'])];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport(
        {
          columnConfig: ['channel', 'session_key', 'revenue', 'partner__cost'],
          aggregationConfig: [
            { column: 'revenue', function: 'SUM' },
            { column: 'partner__cost', function: 'SUM' },
          ],
          // On a MAIN-native metric deliberately: a HAVING on the sleeve-routed joined one is
          // refused outright, since HAVING renders from the dedup CTE rather than the sleeve.
          filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
        } as unknown as Partial<Report>,
        [
          field('channel', 'STRING'),
          field('revenue', 'INTEGER'),
          field('session_id', 'STRING'),
          field('user_id', 'STRING'),
          field('session_key', 'STRING', {
            calculated: {
              formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
              level: 'column',
            },
          }),
        ]
      );

      const result = await service.composeTotals(report, {} as never);

      const expr = 'CONCAT(main.session_id, main.user_id)';
      expect(result!.columns).toEqual(['revenue', 'partner__cost']);
      // The report's own grain, reproduced: `channel` first, then the row-level expression.
      expect(result!.sql).toContain(`${expr} AS _owox_kg_1`);
      expect(result!.sql).toContain(`AND ((${expr}) = (_kept_groups._owox_kg_1)`);
      // The columns the formula reads reach the main CTE; the field's NAME must not — nothing
      // else would tell us, since `SELECT session_key FROM p.d.main` only fails in the warehouse.
      const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(result!.sql);
      expect(mainCte).not.toBeNull();
      expect(mainCte![1]).toContain('session_id');
      expect(mainCte![1]).toContain('user_id');
      expect(mainCte![1]).not.toContain('session_key');
      // Totals themselves stay dimensionless.
      expect(result!.sql.slice(result!.sql.lastIndexOf('\n\nSELECT'))).not.toMatch(/GROUP BY/);
    });

    it('includes JOINED numeric fields in totals (post-join allowed set), NO GROUP BY', async () => {
      const fields = [blendedField('partner__cost', 'FLOAT', ['SUM', 'AVG'])];
      const { service, blendedReportDataService } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['channel', 'revenue', 'partner__cost'],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      // Joined numeric column is aggregated by its post-join allowed functions, alongside
      // the main-mart numeric.
      expect(result!.columns).toEqual(['revenue', 'partner__cost']);
      expect(result!.aggregations).toEqual([
        { column: 'revenue', function: 'SUM' },
        { column: 'revenue', function: 'AVG' },
        { column: 'revenue', function: 'MIN' },
        { column: 'revenue', function: 'MAX' },
        { column: 'partner__cost', function: 'SUM' },
        { column: 'partner__cost', function: 'AVG' },
      ]);
      // The metrics-only totals plan projects only the numeric fields and carries every
      // aggregation, so the OUTER totals SELECT has no GROUP BY (a single grand-total row).
      // The `GROUP BY` inside the bottom-up `partner` CTE is the structural join rollup,
      // unavoidable in any blended SQL — assert only the final SELECT is ungrouped.
      const planArg = blendedReportDataService.resolveBlendingDecision.mock.calls[0][0];
      expect(planArg.columnConfig).toEqual(['revenue', 'partner__cost']);
      const finalSelect = result!.sql.slice(result!.sql.lastIndexOf('\n\nSELECT'));
      // partner__cost is a JOINED numeric field carrying BOTH SUM and AVG at once — routed
      // through its value sleeve (uniform routing, 3) rather than dedup+SUM/dedup+
      // AVG. Since 1, two sleeve-eligible functions on the SAME column now share ONE
      // merged sleeve CTE (one dedup pass, two outer aggregates) instead of two identically-
      // shaped `SELECT DISTINCT` subqueries.
      expect(result!.sql).toContain('sleeve_partner__cost AS (');
      expect(result!.sql.match(/sleeve_partner__cost AS \(/g)).toHaveLength(1);
      expect(result!.sql.match(/SELECT DISTINCT/g)).toHaveLength(1);
      expect(finalSelect).toContain(
        'ANY_VALUE(sleeve_partner__cost.`partner__cost | SUM`) AS `partner__cost | SUM`'
      );
      expect(finalSelect).toContain(
        'ANY_VALUE(sleeve_partner__cost.`partner__cost | AVG`) AS `partner__cost | AVG`'
      );
      // ONE join-back feeds both aggregates.
      expect(
        finalSelect.match(/LEFT JOIN sleeve_partner__cost ON|CROSS JOIN sleeve_partner__cost/g)
      ).toHaveLength(1);
      expect(finalSelect).not.toContain('SUM(partner.partner__cost)');
      expect(finalSelect).not.toContain('AVG(partner.partner__cost)');
      // Main-native `revenue` is unaffected — stays on the normal dedup/re-aggregate path.
      expect(finalSelect).toContain('SUM(main.revenue) AS `revenue | SUM`');
      expect(finalSelect).not.toMatch(/GROUP BY/);
    });

    // A STRING joined field the report aggregates as COUNT_DISTINCT. Pre-join roll-up is
    // ANY_VALUE (STRING cannot SUM). The post-join COUNT_DISTINCT total must be produced by a
    // metric SLEEVE (re-join raw, DISTINCT at the grand-total grain) — NOT re-aggregated as SUM
    // over the dedup CTE (the pre-slice-1 over-counting path). Guards the joined-COUNT_DISTINCT
    // totals story end-to-end at the composer level.
    it('routes a JOINED COUNT_DISTINCT total through a metric sleeve (exact, not dedup+SUM)', async () => {
      const fields = [blendedField('partner__country', 'STRING', ['COUNT_DISTINCT'], 'ANY_VALUE')];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['partner__country'],
        aggregationConfig: [{ column: 'partner__country', function: 'COUNT_DISTINCT' }],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      expect(result!.aggregations).toEqual(
        expect.arrayContaining([{ column: 'partner__country', function: 'COUNT_DISTINCT' }])
      );
      // Dimensionless grand total → the sleeve is CROSS JOINed and its value pulled via ANY_VALUE.
      // The presence of the sleeve CTE is the proof this is NOT the old dedup+SUM path.
      expect(result!.sql).toContain('sleeve_partner__country');
      expect(result!.sql).toContain('CROSS JOIN');
    });

    // Symmetry with the main-mart rule: a JOINED non-numeric field the report aggregates as a
    // metric (e.g. COUNT_DISTINCT over a joined text column) must appear in totals too, by its
    // post-join allowed functions — minus ANY_VALUE / STRING_AGG.
    it('includes a JOINED non-numeric field in totals when the report aggregates it', async () => {
      // A STRING joined field must roll up pre-join with a STRING-valid function (ANY_VALUE),
      // not SUM — so the generated CTE + outer SQL is executable BigQuery.
      const fields = [
        blendedField(
          'partner__country',
          'STRING',
          ['MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'],
          'ANY_VALUE'
        ),
      ];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['partner__country'],
        aggregationConfig: [{ column: 'partner__country', function: 'COUNT_DISTINCT' }],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      expect(result!.columns).toContain('partner__country');
      const fns = result!.aggregations
        .filter(a => a.column === 'partner__country')
        .map(a => a.function);
      expect(fns).toEqual(expect.arrayContaining(['COUNT_DISTINCT', 'MIN', 'MAX']));
      // COUNT is deliberately absent beside a JOINED COUNT_DISTINCT: the two are computed at
      // different grains (COUNT_DISTINCT through a sleeve on the raw path, COUNT re-aggregated
      // over the dedup CTE), so shown together they can invert COUNT(DISTINCT x) <= COUNT(x).
      // A NATIVE column keeps both — nothing routes it through a sleeve.
      expect(fns).not.toContain('COUNT');
      // STRING_AGG (and ANY_VALUE) are excluded from totals on the joined path too.
      expect(fns).not.toContain('STRING_AGG');

      // The generated SQL must be executable: the bottom-up CTE rolls the STRING column up with
      // ANY_VALUE (never SUM over text), and the ungrouped outer SELECT pulls each post-join
      // total off its sleeve. MIN/MAX share one value sleeve; COUNT_DISTINCT keeps its own, and
      // the name collision between the two shapes is what `_2` resolves.
      const splitAt = result!.sql.lastIndexOf('\n\nSELECT');
      const cte = result!.sql.slice(0, splitAt);
      const finalSelect = result!.sql.slice(splitAt);
      expect(cte).toContain('ANY_VALUE(country) AS partner__country');
      expect(result!.sql).not.toMatch(/SUM\(/); // no SUM over a text column anywhere
      expect(finalSelect).toContain(
        'ANY_VALUE(sleeve_partner__country_2.`partner__country | MIN`)'
      );
      expect(finalSelect).toContain(
        'ANY_VALUE(sleeve_partner__country_2.`partner__country | MAX`)'
      );
      expect(finalSelect).not.toContain('MIN(partner.partner__country)');
      // No `COUNT(...)` over the dedup CTE beside the sleeve's COUNT DISTINCT — see above.
      expect(finalSelect).not.toContain('COUNT(partner.partner__country)');
      // COUNT_DISTINCT on a JOINED column routes through a dimensionless "sleeve" CTE (correct
      // through fan-out): the outer SELECT pulls its single grand-total value via ANY_VALUE and
      // CROSS JOINs the sleeve, instead of re-aggregating COUNT(DISTINCT partner.partner__country)
      // over the fanned-out join (which would over-count).
      const sleeveCte = extractCteBody(result!.sql, 'sleeve_partner__country');
      expect(sleeveCte).toContain('COUNT(DISTINCT partner_raw.country)');
      expect(sleeveCte).not.toMatch(/GROUP BY/); // dimensionless grand total → one row, no grouping
      expect(finalSelect).toContain('CROSS JOIN sleeve_partner__country');
      expect(finalSelect).toContain(
        'ANY_VALUE(sleeve_partner__country.`partner__country | COUNTUNIQUE`)'
      );
      expect(finalSelect).not.toContain('COUNT(DISTINCT partner.partner__country)');
      // Excluded functions never reach the totals SELECT. The only ANY_VALUE here is the sleeve
      // value-pull above — the excluded pre-join ANY_VALUE is NOT applied over the column itself.
      expect(finalSelect).not.toContain('ANY_VALUE(partner.partner__country)');
      expect(finalSelect).not.toMatch(/STRING_?AGG/i);
      // Single grand-total row — no outer GROUP BY.
      expect(finalSelect).not.toMatch(/GROUP BY/);
    });

    // A JOINED non-numeric field the report does NOT aggregate stays a plain dimension — not in
    // totals (only the numeric joined field is auto-summarized).
    it('excludes a JOINED non-numeric field from totals when the report does not aggregate it', async () => {
      const fields = [
        blendedField('partner__cost', 'FLOAT', ['SUM']),
        blendedField('partner__country', 'STRING', ['COUNT', 'COUNT_DISTINCT'], 'ANY_VALUE'),
      ];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['partner__cost', 'partner__country'],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      expect(result!.columns).toContain('partner__cost');
      expect(result!.columns).not.toContain('partner__country');
    });

    // A stale post-join override can name functions the current type can't run (e.g. SUM saved
    // before a field became STRING). collectBlendedAllowedSets clamps the override to the type's
    // supported set — as the native path does — so the totals plan never carries SUM(string),
    // which would make the validator throw and silently null the whole totals block.
    it('clamps a stale numeric override on a joined STRING field to type-supported functions', async () => {
      const fields = [
        blendedField(
          'partner__country',
          'STRING',
          ['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT'],
          'ANY_VALUE'
        ),
      ];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['partner__country'],
        aggregationConfig: [{ column: 'partner__country', function: 'COUNT_DISTINCT' }],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      const fns = result!.aggregations
        .filter(a => a.column === 'partner__country')
        .map(a => a.function);
      // SUM / AVG are not supported for STRING → clamped away; the valid ones survive.
      expect(fns).not.toContain('SUM');
      expect(fns).not.toContain('AVG');
      expect(fns).toEqual(expect.arrayContaining(['COUNT_DISTINCT']));
      // See above: COUNT is dropped for a joined column that carries a sleeve-routed
      // COUNT_DISTINCT, so the clamp result is COUNT_DISTINCT alone rather than both.
      expect(fns).not.toContain('COUNT');
      expect(result!.sql).not.toMatch(/SUM\(/);
      expect(result!.sql).not.toMatch(/AVG\(/);
    });

    it('resolves the blendable schema once and reuses it for the blended decision (no recompute)', async () => {
      const fields = [blendedField('partner__cost', 'FLOAT', ['SUM', 'AVG'])];
      const { service, blendedReportDataService, blendableSchemaService } =
        makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['channel', 'revenue', 'partner__cost'],
      } as Partial<Report>);

      await service.composeTotals(report, {} as never);

      // Schema computed exactly once for the whole totals derivation.
      expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledTimes(1);
      // And that same schema is threaded into the decision instead of being recomputed.
      const schema = await blendableSchemaService.computeBlendableSchema.mock.results[0].value;
      expect(blendedReportDataService.resolveBlendingDecision).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        schema,
        undefined
      );
    });

    it('returns blendedDataHeaders carrying the joined field base type so totals headers resolve a type', async () => {
      const fields = [blendedField('partner__cost', 'FLOAT', ['SUM', 'AVG'])];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['channel', 'revenue', 'partner__cost'],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result).not.toBeNull();
      const costHeader = result!.blendedDataHeaders?.find(h => h.name === 'partner__cost');
      expect(costHeader).toBeDefined();
      // Base (unaggregated) type — the header path widens it per aggregation function.
      expect(costHeader!.storageFieldType).toBe('FLOAT');
    });

    it('uses the numeric type-default for a joined field with no postJoinAggregations override', async () => {
      const fields = [blendedField('partner__cost', 'FLOAT')];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['partner__cost'],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.columns).toEqual(['partner__cost']);
      expect(result!.aggregations.map(a => a.function)).toEqual(['SUM', 'AVG', 'MIN', 'MAX']);
    });

    it('skips a joined NON-numeric field', async () => {
      const fields = [blendedField('partner__name', 'STRING')];
      const { service } = makeBlendedTotalsComposer(fields);
      const report = buildTotalsReport({
        columnConfig: ['revenue', 'partner__name'],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.columns).toEqual(['revenue']);
      expect(result!.aggregations.every(a => a.column === 'revenue')).toBe(true);
    });

    // BigQuery totals are covered above with NAMED params. Athena uses POSITIONAL `?`
    // placeholders bound by array order, so the totals path's param alignment is only
    // verified on a positional dialect here.
    describe('Athena (positional `?` params)', () => {
      const makeAthenaTotalsComposer = (numericColumns: string[]) => {
        const realBuilder = new AthenaQueryBuilder(new AthenaClauseRenderer());
        const facade = {
          buildQuery: jest.fn(
            (
              _type: unknown,
              definition: Parameters<AthenaQueryBuilder['buildQuery']>[0],
              options: Parameters<AthenaQueryBuilder['buildQuery']>[1]
            ) => realBuilder.buildQuery(definition, options)
          ),
        };
        const blendedReportDataService = {
          resolveBlendingDecision: jest
            .fn()
            .mockResolvedValue({ needsBlending: false, columnFilter: numericColumns }),
        };
        const tableReferenceService = {
          resolveTableName: jest.fn().mockResolvedValue('db.schema.t'),
        };
        const capabilityService = { isSupported: jest.fn().mockReturnValue(true) };
        const blendableSchemaService = {
          computeBlendableSchema: jest
            .fn()
            .mockResolvedValue({ nativeFields: [], blendedFields: [] }),
        };
        const service = new ReportSqlComposerService(
          blendedReportDataService as never,
          facade as never,
          tableReferenceService as never,
          capabilityService as never,
          blendableSchemaService as never,
          // The composer validates the REPORT's own config before deriving a Totals restriction from
          // its HAVING rules (that precondition used to hold by call order alone).
          { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
        );
        return { service, facade };
      };

      // Athena schema/storage so compose() routes to the Athena builder.
      const buildAthenaTotalsReport = (overrides: Partial<Report> = {}) =>
        buildReport({
          dataMart: {
            id: 'dm-1',
            projectId: 'proj-1',
            definition: { type: 'table', fullyQualifiedName: 'db.schema.t' },
            storage: { id: 'storage-1', type: 'AWS_ATHENA' },
            schema: {
              type: 'athena-data-mart-schema',
              fields: [
                { name: 'order_date', type: 'DATE', isPrimaryKey: false, status: 'CONNECTED' },
                { name: 'channel', type: 'VARCHAR', isPrimaryKey: false, status: 'CONNECTED' },
                { name: 'region', type: 'VARCHAR', isPrimaryKey: false, status: 'CONNECTED' },
                { name: 'revenue', type: 'INTEGER', isPrimaryKey: false, status: 'CONNECTED' },
                { name: 'quantity', type: 'INTEGER', isPrimaryKey: false, status: 'CONNECTED' },
              ],
            },
          },
          ...overrides,
        } as unknown as Partial<Report>);

      it('emits per-numeric-field aggregations with NO GROUP BY (single grand-total row)', async () => {
        const { service } = makeAthenaTotalsComposer(['revenue', 'quantity']);
        const report = buildAthenaTotalsReport({
          columnConfig: ['order_date', 'channel', 'revenue', 'quantity'],
        } as Partial<Report>);

        const result = await service.composeTotals(report, {} as never);

        expect(result).not.toBeNull();
        expect(result!.columns).toEqual(['revenue', 'quantity']);
        expect(result!.aggregations).toEqual([
          { column: 'revenue', function: 'SUM' },
          { column: 'revenue', function: 'AVG' },
          { column: 'revenue', function: 'MIN' },
          { column: 'revenue', function: 'MAX' },
          { column: 'quantity', function: 'SUM' },
          { column: 'quantity', function: 'AVG' },
          { column: 'quantity', function: 'MIN' },
          { column: 'quantity', function: 'MAX' },
        ]);
        expect(result!.sql).toContain('SUM("revenue") AS "revenue | SUM"');
        expect(result!.sql).toContain('MAX("quantity") AS "quantity | MAX"');
        expect(result!.sql).not.toMatch(/GROUP BY/);
        expect(result!.sql).not.toMatch(/ORDER BY/);
        expect(result!.sql).not.toContain('Row Count');
      });

      it('aligns POSITIONAL params with the `?` placeholders, in WHERE order', async () => {
        const { service } = makeAthenaTotalsComposer(['revenue']);
        // Two WHERE filters → two `?` placeholders that must bind to params in this order.
        const report = buildAthenaTotalsReport({
          columnConfig: ['channel', 'region', 'revenue'],
          filterConfig: [
            { column: 'channel', operator: 'eq', value: 'paid' },
            { column: 'region', operator: 'eq', value: 'EU' },
          ],
        } as Partial<Report>);

        const result = await service.composeTotals(report, {} as never);

        expect(result).not.toBeNull();
        // No `@named` placeholders — Athena is positional.
        expect(result!.sql).not.toContain('@');
        expect(result!.sql).toContain('"channel" = ?');
        expect(result!.sql).toContain('"region" = ?');
        // Placeholder count equals param count, and the channel filter (first in WHERE)
        // precedes the region filter — so params line up positionally.
        const placeholders = countPositionalPlaceholders(result!.sql);
        expect(placeholders).toBe(result!.params!.length);
        expect(result!.params).toEqual([
          { name: 'p0', value: 'paid' },
          { name: 'p1', value: 'EU' },
        ]);
        expect(result!.sql.indexOf('"channel" = ?')).toBeLessThan(
          result!.sql.indexOf('"region" = ?')
        );
      });
    });
  });
});
