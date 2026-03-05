import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { InsightTemplateSourceType } from '../dto/schemas/insight-template/insight-template-source.schema';
import { DataMart } from '../entities/data-mart.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightTemplateSourceDataService } from './insight-template-source-data.service';

describe('InsightTemplateSourceDataService', () => {
  const createService = () => {
    const dataMartSqlTableService = {
      executeSqlToTable: jest.fn(),
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
    expect(result.tableSources.main.dataHeaders).toEqual([
      { name: 'credits', alias: 'Credits' },
      { name: 'units' },
    ]);
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
});
