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

  it('passes rowCount: true to buildQuery when aggregationConfig is non-empty', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      columnConfig: ['channel', 'revenue'],
      aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ rowCount: true })
    );
  });

  it('passes rowCount: false to buildQuery when aggregationConfig is empty or absent', async () => {
    const { service, queryBuilderFacade } = createService();
    const report = buildReport({
      columnConfig: ['channel', 'revenue'],
      aggregationConfig: [],
    } as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ rowCount: false })
    );
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

  it('rowCount is false when report has no aggregationConfig at all', async () => {
    const { service, queryBuilderFacade } = createService();
    // aggregationConfig absent — must NOT produce rowCount: true.
    const report = buildReport({} as Partial<Report>);

    await service.compose(report, {} as never);

    expect(queryBuilderFacade.buildQuery).toHaveBeenCalledWith(
      'GOOGLE_BIGQUERY',
      expect.anything(),
      expect.objectContaining({ rowCount: false })
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
      expect(result!.sql).toContain(`ON (${bucket} = `);
      // The bare column must never become the grouping key.
      expect(result!.sql).not.toMatch(/GROUP BY\n {2}src\.`order_date`\n/);
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

    it('re-resolves the blending decision against the metrics-only totals plan (rowCount false, no Unique Count)', async () => {
      const { service, blendedReportDataService } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['order_date', 'channel', 'revenue'],
      } as Partial<Report>);

      await service.composeTotals(report, {} as never);

      expect(blendedReportDataService.resolveBlendingDecision).toHaveBeenCalledTimes(1);
      const planArg = blendedReportDataService.resolveBlendingDecision.mock.calls[0][0];
      expect(planArg.columnConfig).toEqual(['revenue']);
      expect(planArg.rowCount).toBe(false);
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
        resolveBlendingDecision: jest.fn(async (plan: Partial<Report>) => {
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
            rowCount: false,
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
        }),
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
      expect(planArg.rowCount).toBe(false);
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
        schema
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
