import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { CreateViewService } from '../use-cases/create-view.service';
import { DataQualitySnapshotTableReferenceService } from './data-quality-snapshot-table-reference.service';

describe('DataQualitySnapshotTableReferenceService', () => {
  const createViewService = {
    runFromSnapshot: jest.fn(),
  };
  const queryBuilder = {
    buildQuery: jest.fn(),
  };
  const identifierEscaper = {
    escapeIdentifier: jest.fn(),
  };
  const service = new DataQualitySnapshotTableReferenceService(
    createViewService as unknown as CreateViewService,
    queryBuilder as unknown as DataMartQueryBuilderFacade,
    identifierEscaper as unknown as IdentifierEscaperFacade
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates deterministic run-scoped SQL views from the saved definition', async () => {
    createViewService.runFromSnapshot.mockImplementation(async command => ({
      fullyQualifiedName: `warehouse.internal.${command.viewName}`,
    }));
    identifierEscaper.escapeIdentifier.mockImplementation(
      async (_storageType, value) => `\`${value}\``
    );
    const input = {
      runId: '9b36d30d-cb98-4ee3-a68f-a72bd222aa30',
      projectId: 'project-1',
      identity: { type: 'SOURCE' as const, dataMartId: 'dm-source' },
      definition: { sqlQuery: 'SELECT saved_value FROM saved_source' },
      storage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
      liveStorage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
    };

    const first = await service.resolve(input);
    const second = await service.resolve(input);
    const viewName = createViewService.runFromSnapshot.mock.calls[0][0].viewName as string;

    expect(viewName).toHaveLength(44);
    expect(viewName).toMatch(/^dq_[a-z0-9_]+$/);
    expect(createViewService.runFromSnapshot.mock.calls[1][0].viewName).toBe(viewName);
    expect(createViewService.runFromSnapshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        projectId: 'project-1',
        storageId: 'storage-1',
        storageType: DataStorageType.GOOGLE_BIGQUERY,
        sql: 'SELECT saved_value FROM saved_source',
      })
    );
    expect(first).toEqual({
      query: `SELECT * FROM \`warehouse.internal.${viewName}\``,
      technicalViewReference: `warehouse.internal.${viewName}`,
    });
    expect(second).toEqual(first);
    expect(queryBuilder.buildQuery).not.toHaveBeenCalled();
  });

  it('builds a non-SQL query from the saved definition after validating storage identity', async () => {
    queryBuilder.buildQuery.mockResolvedValue('SELECT * FROM saved_table');

    await expect(
      service.resolve({
        runId: 'run-1',
        projectId: 'project-1',
        identity: { type: 'SOURCE', dataMartId: 'dm-source' },
        definition: { fullyQualifiedName: 'warehouse.dataset.saved_table' },
        storage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
        liveStorage: {
          id: 'storage-1',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      })
    ).resolves.toEqual({
      query: 'SELECT * FROM saved_table',
      technicalViewReference: null,
    });

    expect(queryBuilder.buildQuery).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY, {
      fullyQualifiedName: 'warehouse.dataset.saved_table',
    });
    expect(createViewService.runFromSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a moved storage before creating a view or building a query', async () => {
    await expect(
      service.resolve({
        runId: 'run-1',
        projectId: 'project-1',
        identity: {
          type: 'RELATIONSHIP_TARGET',
          relationshipId: 'rel-1',
          targetDataMartId: 'dm-target',
        },
        definition: { sqlQuery: 'SELECT saved_value FROM saved_target' },
        storage: {
          id: 'storage-original',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
        liveStorage: {
          id: 'storage-current',
          type: DataStorageType.GOOGLE_BIGQUERY,
        },
      })
    ).rejects.toThrow('Data Storage changed after the run was queued');

    expect(createViewService.runFromSnapshot).not.toHaveBeenCalled();
    expect(queryBuilder.buildQuery).not.toHaveBeenCalled();
    expect(identifierEscaper.escapeIdentifier).not.toHaveBeenCalled();
  });
});
