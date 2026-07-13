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
import { BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';

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
      blendableSchemaService as never
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
      const service = new ReportSqlComposerService(
        blendedReportDataService as never,
        facade as never,
        tableReferenceService as never,
        capabilityService as never,
        blendableSchemaService as never
      );
      return { service, facade, blendedReportDataService, blendableSchemaService };
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
      expect(result!.sql).toContain('WHERE main.`channel` = @p0');
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

    it('returns null when no selected column is numeric (no native build, no decision resolved)', async () => {
      const { service, facade, blendedReportDataService } = makeBqTotalsComposer([]);
      const report = buildTotalsReport({
        columnConfig: ['order_date', 'channel'],
      } as Partial<Report>);

      expect(await service.composeTotals(report, {} as never)).toBeNull();
      expect(facade.buildQuery).not.toHaveBeenCalled();
      expect(blendedReportDataService.resolveBlendingDecision).not.toHaveBeenCalled();
    });

    it('strips HAVING (function-carrying) filters from the totals query, keeping WHERE filters', async () => {
      const { service } = makeBqTotalsComposer(['revenue']);
      const report = buildTotalsReport({
        columnConfig: ['channel', 'revenue'],
        filterConfig: [
          { column: 'channel', operator: 'eq', value: 'paid' },
          { column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 },
        ],
      } as Partial<Report>);

      const result = await service.composeTotals(report, {} as never);

      expect(result!.sql).toContain('WHERE main.`channel` = @p0');
      expect(result!.sql).not.toMatch(/HAVING/);
      expect(result!.sql).not.toMatch(/GROUP BY/);
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
      postJoinAggregations?: ReportAggregateFunction[]
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
      f.aggregateFunction = 'SUM';
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
        blendableSchemaService as never
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
      expect(finalSelect).toContain('SUM(partner.partner__cost)');
      expect(finalSelect).not.toMatch(/GROUP BY/);
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
          blendableSchemaService as never
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
