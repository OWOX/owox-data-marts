import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { InsightTemplateSourceType } from '../dto/schemas/insight-template/insight-template-source.schema';
import { DataMart } from '../entities/data-mart.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { InsightTemplateSourceDataService } from './insight-template-source-data.service';

describe('InsightTemplateSourceDataService', () => {
  const createService = () => {
    const dataMartSqlTableService = {
      executeSqlToTable: jest.fn(),
      resolveDataMartTableMacro: jest.fn().mockImplementation(async (_dataMart, sql) => sql),
    };
    const insightArtifactService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
      markValidationStatus: jest.fn(),
    };
    const validationService = {
      validateSources: jest.fn().mockResolvedValue(undefined),
    };
    const reportHeadersGeneratorFacade = {
      generateHeadersFromSchema: jest.fn(),
    };

    return {
      service: new InsightTemplateSourceDataService(
        dataMartSqlTableService as never,
        insightArtifactService as never,
        validationService as never,
        reportHeadersGeneratorFacade as never
      ),
      dataMartSqlTableService,
      insightArtifactService,
      validationService,
      reportHeadersGeneratorFacade,
    };
  };

  const createDataMart = (): DataMart =>
    ({
      id: 'data-mart-1',
      projectId: 'project-1',
      storage: {
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
      schema: {
        type: 'bigquery-data-mart-schema',
        fields: [],
      },
    }) as unknown as DataMart;

  const createInsightTemplate = (sources: InsightTemplate['sources'] = []): InsightTemplate =>
    ({
      sources,
    }) as unknown as InsightTemplate;

  it('adds aliases to source="main" table headers', async () => {
    const { service, dataMartSqlTableService, reportHeadersGeneratorFacade } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
      new ReportDataHeader('units'),
    ]);
    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['credits', 'units'],
      rows: [[100, 200]],
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(reportHeadersGeneratorFacade.generateHeadersFromSchema).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      dataMart.schema
    );
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(dataMart, undefined, {
      limit: 101,
    });
    expect(result.tableSources.main.dataHeaders).toEqual([
      { name: 'credits', alias: 'Credits' },
      { name: 'units' },
    ]);
    expect(result.tableSources.main.rowsLimit).toBe(100);
    expect(result.tableSources.main.hasMoreRowsThanLimit).toBe(false);
  });

  it('uses preloaded source for main without executing main SQL', async () => {
    const { service, dataMartSqlTableService, reportHeadersGeneratorFacade } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([]);
    const preloadedMain = {
      dataHeaders: [{ name: 'credits', alias: 'Credits' }],
      dataRows: [[100]],
      dataHeadersCount: 1,
      hasMoreRowsThanLimit: true,
      rowsLimit: 100,
    };

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
    ]);

    const result = await service.buildRenderContext(dataMart, insightTemplate, {
      preloadedSources: { main: preloadedMain },
    });

    expect(dataMartSqlTableService.executeSqlToTable).not.toHaveBeenCalled();
    expect(result.tableSources.main).toEqual(preloadedMain);
  });

  it('loads only main when usedSourceKeys contains only main', async () => {
    const {
      service,
      dataMartSqlTableService,
      validationService,
      reportHeadersGeneratorFacade,
      insightArtifactService,
    } = createService();
    const dataMart = createDataMart();
    const secondarySource = {
      templateSourceId: '11111111-1111-1111-1111-111111111111',
      key: 'secondary',
      type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
      artifactId: '22222222-2222-2222-2222-222222222222',
    };
    const insightTemplate = createInsightTemplate([secondarySource]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
    ]);
    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['credits'],
      rows: [[100]],
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate, {
      usedSourceKeys: new Set(['main']),
    });

    expect(validationService.validateSources).toHaveBeenCalledWith([], {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
    });
    expect(insightArtifactService.getByIdAndDataMartIdAndProjectId).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledTimes(1);
    expect(result.tableSources).toEqual({
      main: {
        dataHeaders: [{ name: 'credits', alias: 'Credits' }],
        dataRows: [[100]],
        dataHeadersCount: 1,
        hasMoreRowsThanLimit: false,
        rowsLimit: 100,
      },
    });
  });

  it('loads only selected secondary source when usedSourceKeys excludes main', async () => {
    const { service, dataMartSqlTableService, validationService, reportHeadersGeneratorFacade } =
      createService();
    const dataMart = createDataMart();
    const secondarySource = {
      templateSourceId: '11111111-1111-1111-1111-111111111111',
      key: 'secondary',
      type: InsightTemplateSourceType.CURRENT_DATA_MART,
      artifactId: '22222222-2222-2222-2222-222222222222',
    };
    const insightTemplate = createInsightTemplate([secondarySource]);

    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['credits'],
      rows: [[200]],
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate, {
      usedSourceKeys: new Set(['secondary']),
    });

    expect(validationService.validateSources).toHaveBeenCalledWith([secondarySource], {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
    });
    expect(reportHeadersGeneratorFacade.generateHeadersFromSchema).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledTimes(1);
    expect(result.tableSources).toEqual({
      secondary: {
        dataHeaders: [{ name: 'credits' }],
        dataRows: [[200]],
        dataHeadersCount: 1,
        hasMoreRowsThanLimit: false,
        rowsLimit: 100,
      },
    });
  });

  it('does not load or expose any source when usedSourceKeys is empty, even with preloaded main', async () => {
    const { service, dataMartSqlTableService, validationService, reportHeadersGeneratorFacade } =
      createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([
      {
        templateSourceId: '11111111-1111-1111-1111-111111111111',
        key: 'secondary',
        type: InsightTemplateSourceType.CURRENT_DATA_MART,
        artifactId: '22222222-2222-2222-2222-222222222222',
      },
    ]);
    const preloadedMain = {
      dataHeaders: [{ name: 'credits', alias: 'Credits' }],
      dataRows: [[100]],
      dataHeadersCount: 1,
      hasMoreRowsThanLimit: false,
      rowsLimit: 100,
    };

    const result = await service.buildRenderContext(dataMart, insightTemplate, {
      usedSourceKeys: new Set(),
      preloadedSources: { main: preloadedMain },
    });

    expect(validationService.validateSources).toHaveBeenCalledWith([], {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
    });
    expect(reportHeadersGeneratorFacade.generateHeadersFromSchema).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).not.toHaveBeenCalled();
    expect(result.tableSources).toEqual({});
  });

  it('does not add aliases for non-main sources', async () => {
    const { service, dataMartSqlTableService, reportHeadersGeneratorFacade } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([
      {
        templateSourceId: '11111111-1111-1111-1111-111111111111',
        key: 'secondary',
        type: InsightTemplateSourceType.CURRENT_DATA_MART,
        artifactId: '22222222-2222-2222-2222-222222222222',
      },
    ]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
    ]);
    dataMartSqlTableService.executeSqlToTable
      .mockResolvedValueOnce({
        columns: ['credits'],
        rows: [[100]],
      })
      .mockResolvedValueOnce({
        columns: ['credits'],
        rows: [[200]],
      });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(result.tableSources.main.dataHeaders).toEqual([{ name: 'credits', alias: 'Credits' }]);
    expect(result.tableSources.secondary.dataHeaders).toEqual([{ name: 'credits' }]);
    expect(result.tableSources.secondary.rowsLimit).toBe(100);
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledTimes(2);
    for (const call of dataMartSqlTableService.executeSqlToTable.mock.calls) {
      expect(call[2]).toEqual({ limit: 101 });
    }
  });

  it('still loads secondary sources when main is provided via preloadedSources', async () => {
    const { service, dataMartSqlTableService } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([
      {
        templateSourceId: '11111111-1111-1111-1111-111111111111',
        key: 'secondary',
        type: InsightTemplateSourceType.CURRENT_DATA_MART,
        artifactId: '22222222-2222-2222-2222-222222222222',
      },
    ]);
    const preloadedMain = {
      dataHeaders: [{ name: 'credits', alias: 'Credits' }],
      dataRows: [[100]],
      dataHeadersCount: 1,
      hasMoreRowsThanLimit: false,
      rowsLimit: 100,
    };

    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['credits'],
      rows: [[200]],
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate, {
      preloadedSources: { main: preloadedMain },
    });

    expect(result.tableSources.main).toEqual(preloadedMain);
    expect(result.tableSources.secondary).toEqual({
      dataHeaders: [{ name: 'credits' }],
      dataRows: [[200]],
      dataHeadersCount: 1,
      hasMoreRowsThanLimit: false,
      rowsLimit: 100,
    });
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledTimes(1);
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(dataMart, undefined, {
      limit: 101,
    });
  });

  it('loads only requested main and secondary sources when usedSourceKeys is provided', async () => {
    const { service, dataMartSqlTableService, validationService, reportHeadersGeneratorFacade } =
      createService();
    const dataMart = createDataMart();
    const firstSource = {
      templateSourceId: '11111111-1111-1111-1111-111111111111',
      key: 'secondary',
      type: InsightTemplateSourceType.CURRENT_DATA_MART,
      artifactId: '22222222-2222-2222-2222-222222222222',
    };
    const secondSource = {
      templateSourceId: '33333333-3333-3333-3333-333333333333',
      key: 'unused',
      type: InsightTemplateSourceType.CURRENT_DATA_MART,
      artifactId: '44444444-4444-4444-4444-444444444444',
    };
    const insightTemplate = createInsightTemplate([firstSource, secondSource]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
    ]);
    dataMartSqlTableService.executeSqlToTable
      .mockResolvedValueOnce({
        columns: ['credits'],
        rows: [[100]],
      })
      .mockResolvedValueOnce({
        columns: ['credits'],
        rows: [[200]],
      });

    const result = await service.buildRenderContext(dataMart, insightTemplate, {
      usedSourceKeys: new Set(['main', 'secondary']),
    });

    expect(validationService.validateSources).toHaveBeenCalledWith([firstSource], {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
    });
    expect(result.tableSources.main).toEqual({
      dataHeaders: [{ name: 'credits', alias: 'Credits' }],
      dataRows: [[100]],
      dataHeadersCount: 1,
      hasMoreRowsThanLimit: false,
      rowsLimit: 100,
    });
    expect(result.tableSources.secondary).toEqual({
      dataHeaders: [{ name: 'credits' }],
      dataRows: [[200]],
      dataHeadersCount: 1,
      hasMoreRowsThanLimit: false,
      rowsLimit: 100,
    });
    expect(result.tableSources.unused).toBeUndefined();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledTimes(2);
  });

  it('keeps eager behavior when usedSourceKeys is not provided', async () => {
    const { service, dataMartSqlTableService, validationService, reportHeadersGeneratorFacade } =
      createService();
    const dataMart = createDataMart();
    const secondarySource = {
      templateSourceId: '11111111-1111-1111-1111-111111111111',
      key: 'secondary',
      type: InsightTemplateSourceType.CURRENT_DATA_MART,
      artifactId: '22222222-2222-2222-2222-222222222222',
    };
    const insightTemplate = createInsightTemplate([secondarySource]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
    ]);
    dataMartSqlTableService.executeSqlToTable
      .mockResolvedValueOnce({
        columns: ['credits'],
        rows: [[100]],
      })
      .mockResolvedValueOnce({
        columns: ['credits'],
        rows: [[200]],
      });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(validationService.validateSources).toHaveBeenCalledWith([secondarySource], {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
    });
    expect(result.tableSources.main).toBeDefined();
    expect(result.tableSources.secondary).toBeDefined();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledTimes(2);
  });

  it('falls back to plain headers when alias enrichment fails', async () => {
    const { service, dataMartSqlTableService, reportHeadersGeneratorFacade } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockRejectedValue(
      new Error('schema mismatch')
    );
    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['credits'],
      rows: [[100]],
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(result.tableSources.main.dataHeaders).toEqual([{ name: 'credits' }]);
  });

  it('truncates source rows to 100 and marks overflow when probe row is present', async () => {
    const { service, dataMartSqlTableService, reportHeadersGeneratorFacade } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
    ]);
    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['credits'],
      rows: Array.from({ length: 101 }, (_, i) => [i]),
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(result.tableSources.main.dataRows).toHaveLength(100);
    expect(result.tableSources.main.dataRows[0]).toEqual([0]);
    expect(result.tableSources.main.dataRows[99]).toEqual([99]);
    expect(result.tableSources.main.rowsLimit).toBe(100);
    expect(result.tableSources.main.hasMoreRowsThanLimit).toBe(true);
  });

  it('keeps hasMoreRowsThanLimit=false when source has exactly 100 rows', async () => {
    const { service, dataMartSqlTableService, reportHeadersGeneratorFacade } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([
      new ReportDataHeader('credits', 'Credits'),
    ]);
    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['credits'],
      rows: Array.from({ length: 100 }, (_, i) => [i]),
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(result.tableSources.main.dataRows).toHaveLength(100);
    expect(result.tableSources.main.rowsLimit).toBe(100);
    expect(result.tableSources.main.hasMoreRowsThanLimit).toBe(false);
  });

  it('uses probe limit=101 for INSIGHT_ARTIFACT source and truncates context rows to 100', async () => {
    const {
      service,
      dataMartSqlTableService,
      insightArtifactService,
      reportHeadersGeneratorFacade,
    } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([
      {
        templateSourceId: '11111111-1111-1111-1111-111111111111',
        key: 'artifactSource',
        type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
        artifactId: '22222222-2222-2222-2222-222222222222',
      },
    ]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([]);
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'artifact-1',
      title: 'Artifact',
      sql: 'SELECT * FROM source_table',
      validationStatus: InsightArtifactValidationStatus.VALID,
    });
    dataMartSqlTableService.resolveDataMartTableMacro.mockResolvedValue(
      'SELECT * FROM source_table LIMIT 101'
    );
    dataMartSqlTableService.executeSqlToTable
      .mockResolvedValueOnce({
        columns: ['main_col'],
        rows: [['main']],
      })
      .mockResolvedValueOnce({
        columns: ['artifact_col'],
        rows: Array.from({ length: 101 }, (_, i) => [i]),
      });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenNthCalledWith(
      1,
      dataMart,
      undefined,
      {
        limit: 101,
      }
    );
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenNthCalledWith(
      2,
      dataMart,
      'SELECT * FROM source_table LIMIT 101',
      {
        limit: 101,
      }
    );
    expect(result.tableSources.artifactSource.dataRows).toHaveLength(100);
    expect(result.tableSources.artifactSource.rowsLimit).toBe(100);
    expect(result.tableSources.artifactSource.hasMoreRowsThanLimit).toBe(true);
  });

  it('retries artifact execution even when last validation result is error and clears stale error on success', async () => {
    const {
      service,
      insightArtifactService,
      reportHeadersGeneratorFacade,
      dataMartSqlTableService,
    } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([
      {
        templateSourceId: '11111111-1111-1111-1111-111111111111',
        key: 'artifactSource',
        type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
        artifactId: '22222222-2222-2222-2222-222222222222',
      },
    ]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([]);
    dataMartSqlTableService.executeSqlToTable
      .mockResolvedValueOnce({
        columns: ['main_col'],
        rows: [['main']],
      })
      .mockResolvedValueOnce({
        columns: ['artifact_col'],
        rows: [['resolved']],
      });
    dataMartSqlTableService.resolveDataMartTableMacro.mockResolvedValue(
      'SELECT * FROM source_table'
    );
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'artifact-1',
      title: 'Product Category Comparison (Last 30 vs Previous 30 Days)',
      sql: 'SELECT * FROM source_table',
      validationStatus: InsightArtifactValidationStatus.ERROR,
      validationError: 'Unrecognized name: product_category at [12:5]',
    });

    const result = await service.buildRenderContext(dataMart, insightTemplate);

    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenNthCalledWith(
      2,
      dataMart,
      'SELECT * FROM source_table',
      {
        limit: 101,
      }
    );
    expect(insightArtifactService.markValidationStatus).toHaveBeenCalledWith(
      'artifact-1',
      InsightArtifactValidationStatus.VALID,
      null
    );
    expect(result.tableSources.artifactSource).toEqual({
      dataHeaders: [{ name: 'artifact_col' }],
      dataRows: [['resolved']],
      dataHeadersCount: 1,
      hasMoreRowsThanLimit: false,
      rowsLimit: 100,
    });
  });

  it('updates artifact validation error when execution fails during run', async () => {
    const {
      service,
      insightArtifactService,
      reportHeadersGeneratorFacade,
      dataMartSqlTableService,
    } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate([
      {
        templateSourceId: '11111111-1111-1111-1111-111111111111',
        key: 'artifactSource',
        type: InsightTemplateSourceType.INSIGHT_ARTIFACT,
        artifactId: '22222222-2222-2222-2222-222222222222',
      },
    ]);

    reportHeadersGeneratorFacade.generateHeadersFromSchema.mockResolvedValue([]);
    dataMartSqlTableService.executeSqlToTable
      .mockResolvedValueOnce({
        columns: ['main_col'],
        rows: [['main']],
      })
      .mockRejectedValueOnce(
        new Error(
          "Name source_medium not found inside s; failed to parse view 'owox-demo.owox_internal_us.view_addfa49f_aeb0_4273_a73f_d10ee6ce9edd' at [4:5]"
        )
      );
    dataMartSqlTableService.resolveDataMartTableMacro.mockResolvedValue(
      'SELECT * FROM source_table'
    );
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'artifact-1',
      title: 'Product Category Comparison (Last 30 vs Previous 30 Days)',
      sql: 'SELECT * FROM source_table',
      validationStatus: InsightArtifactValidationStatus.ERROR,
      validationError: 'stale error',
    });

    await expect(service.buildRenderContext(dataMart, insightTemplate)).rejects.toThrow(
      `Failed to execute artifact source "Product Category Comparison (Last 30 vs Previous 30 Days)" (artifactId="artifact-1", sourceKey="artifactSource"): Name source_medium not found inside s; failed to parse view 'owox-demo.owox_internal_us.view_addfa49f_aeb0_4273_a73f_d10ee6ce9edd' at [4:5]`
    );

    expect(insightArtifactService.markValidationStatus).toHaveBeenCalledWith(
      'artifact-1',
      InsightArtifactValidationStatus.ERROR,
      "Name source_medium not found inside s; failed to parse view 'owox-demo.owox_internal_us.view_addfa49f_aeb0_4273_a73f_d10ee6ce9edd' at [4:5]"
    );
  });
});
