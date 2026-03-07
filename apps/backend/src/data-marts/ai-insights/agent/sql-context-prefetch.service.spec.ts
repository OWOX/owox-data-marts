import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import { AiAssistantSqlContextPrefetchService } from './sql-context-prefetch.service';

describe('AiAssistantSqlContextPrefetchService', () => {
  const createService = () => {
    const dataMartService = {
      actualizeSchemaIfExpired: jest.fn(),
    };
    const tableNameRetrieverTool = {
      retrieveTableName: jest.fn(),
    };

    return {
      service: new AiAssistantSqlContextPrefetchService(
        dataMartService as never,
        tableNameRetrieverTool as never
      ),
      dataMartService,
      tableNameRetrieverTool,
    };
  };

  it('prefetches metadata and fqn in parallel and returns prefetch telemetry', async () => {
    const { service, dataMartService, tableNameRetrieverTool } = createService();

    let metadataStarted = false;
    let fqnStarted = false;

    let resolveMetadata: (value: unknown) => void = () => {};
    let resolveFqn: (value: string) => void = () => {};

    const metadataPromise = new Promise<unknown>(resolve => {
      resolveMetadata = resolve;
    });
    const fqnPromise = new Promise<string>(resolve => {
      resolveFqn = resolve;
    });

    dataMartService.actualizeSchemaIfExpired.mockImplementation(() => {
      metadataStarted = true;
      return metadataPromise;
    });
    tableNameRetrieverTool.retrieveTableName.mockImplementation(() => {
      fqnStarted = true;
      return fqnPromise;
    });

    const prefetchPromise = service.prefetch({
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
    });

    await Promise.resolve();

    expect(metadataStarted).toBe(true);
    expect(fqnStarted).toBe(true);
    expect(dataMartService.actualizeSchemaIfExpired).toHaveBeenCalledWith(
      'data-mart-1',
      'project-1',
      expect.any(Number)
    );

    resolveMetadata({
      title: 'Data Mart',
      description: 'description',
      storage: { type: 'bigquery' },
      schema: {
        fields: [
          { name: 'connected_field', status: DataMartSchemaFieldStatus.CONNECTED },
          { name: 'disconnected_field', status: DataMartSchemaFieldStatus.DISCONNECTED },
        ],
      },
    });
    resolveFqn('project.dataset.table_name');

    const result = await prefetchPromise;

    expect(result.fullyQualifiedTableName).toBe('project.dataset.table_name');
    expect(result.metadata.storageType).toBe('bigquery');
    expect(result.metadata.schema.fields).toEqual([
      { name: 'connected_field', status: DataMartSchemaFieldStatus.CONNECTED },
    ]);

    expect(result.telemetry.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.telemetry.steps).toHaveLength(2);
    expect(result.telemetry.steps.map(step => step.name).sort()).toEqual([
      'load_fqn',
      'load_metadata',
    ]);
  });
});
