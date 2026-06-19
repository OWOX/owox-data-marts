import { GenerateDataMartMetadataOrchestratorService } from './generate-data-mart-metadata.orchestrator.service';
import { DataMartMetadataScope, GenerateDataMartMetadataRequest } from './ai-insights-types';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataMart } from '../entities/data-mart.entity';

describe('GenerateDataMartMetadataOrchestratorService', () => {
  const METADATA_SAMPLE_ROW_LIMIT = 30;

  const buildSchema = (
    fields: Array<{
      name: string;
      status: DataMartSchemaFieldStatus;
      isHiddenForReporting?: boolean;
    }>
  ) => ({
    type: 'bigquery-data-mart-schema',
    fields: fields.map(f => ({
      name: f.name,
      type: 'STRING',
      status: f.status,
      isHiddenForReporting: f.isHiddenForReporting ?? false,
    })),
  });

  const createService = (schema: unknown) => {
    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
      definitionType: DataMartDefinitionType.SQL,
      title: 'Test Mart',
      description: 'desc',
      schema,
    } as unknown as DataMart;

    const dataMartService = {
      actualizeSchemaIfExpired: jest.fn().mockResolvedValue(dataMart),
    };
    const dataMartSampleDataService = {
      sampleColumns: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
    };
    const definitionValidatorFacade = {
      checkIsValid: jest.fn().mockResolvedValue(undefined),
    };
    const generateDataMartMetadataAgent = {
      run: jest.fn().mockResolvedValue({ fields: [] }),
    };

    const service = new GenerateDataMartMetadataOrchestratorService(
      dataMartService as never,
      dataMartSampleDataService as never,
      definitionValidatorFacade as never,
      generateDataMartMetadataAgent as never,
      {} as never,
      {} as never
    );

    return { service, dataMartSampleDataService, generateDataMartMetadataAgent };
  };

  const request: GenerateDataMartMetadataRequest = {
    dataMartId: 'dm-1',
    projectId: 'proj-1',
    scope: DataMartMetadataScope.ALL_FIELD_METADATA,
    useSample: true,
  };

  it('excludes DISCONNECTED fields from the sample query', async () => {
    const schema = buildSchema([
      { name: 'campaign', status: DataMartSchemaFieldStatus.CONNECTED },
      { name: 'country', status: DataMartSchemaFieldStatus.CONNECTED },
      { name: 'clicks', status: DataMartSchemaFieldStatus.CONNECTED },
      { name: 'impressions', status: DataMartSchemaFieldStatus.DISCONNECTED },
    ]);
    const { service, dataMartSampleDataService } = createService(schema);

    await service.run(request);

    expect(dataMartSampleDataService.sampleColumns).toHaveBeenCalledWith(
      'dm-1',
      'proj-1',
      ['campaign', 'country', 'clicks'],
      undefined,
      METADATA_SAMPLE_ROW_LIMIT
    );
  });

  it('keeps isHiddenForReporting fields in the sample query (AI may still alias/describe them)', async () => {
    const schema = buildSchema([
      { name: 'campaign', status: DataMartSchemaFieldStatus.CONNECTED },
      {
        name: 'internal_id',
        status: DataMartSchemaFieldStatus.CONNECTED,
        isHiddenForReporting: true,
      },
      { name: 'clicks', status: DataMartSchemaFieldStatus.CONNECTED },
    ]);
    const { service, dataMartSampleDataService } = createService(schema);

    await service.run(request);

    expect(dataMartSampleDataService.sampleColumns).toHaveBeenCalledWith(
      'dm-1',
      'proj-1',
      ['campaign', 'internal_id', 'clicks'],
      undefined,
      METADATA_SAMPLE_ROW_LIMIT
    );
  });

  it('keeps CONNECTED_WITH_DEFINITION_MISMATCH fields in the sample query', async () => {
    const schema = buildSchema([
      { name: 'campaign', status: DataMartSchemaFieldStatus.CONNECTED },
      { name: 'clicks', status: DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH },
    ]);
    const { service, dataMartSampleDataService } = createService(schema);

    await service.run(request);

    expect(dataMartSampleDataService.sampleColumns).toHaveBeenCalledWith(
      'dm-1',
      'proj-1',
      ['campaign', 'clicks'],
      undefined,
      METADATA_SAMPLE_ROW_LIMIT
    );
  });

  it('skips the sample fetch when every field is DISCONNECTED', async () => {
    const schema = buildSchema([
      { name: 'campaign', status: DataMartSchemaFieldStatus.DISCONNECTED },
      { name: 'impressions', status: DataMartSchemaFieldStatus.DISCONNECTED },
    ]);
    const { service, dataMartSampleDataService, generateDataMartMetadataAgent } =
      createService(schema);

    await service.run(request);

    expect(dataMartSampleDataService.sampleColumns).not.toHaveBeenCalled();
    expect(generateDataMartMetadataAgent.run).toHaveBeenCalledWith(
      expect.objectContaining({ sampleColumns: null, sampleRows: null }),
      expect.anything()
    );
  });
});
