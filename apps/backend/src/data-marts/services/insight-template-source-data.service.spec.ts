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
});
