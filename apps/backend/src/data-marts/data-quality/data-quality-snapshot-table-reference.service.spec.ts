import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartTableReferenceService } from '../services/data-mart-table-reference.service';
import { DataQualitySnapshotTableReferenceService } from './data-quality-snapshot-table-reference.service';

describe('DataQualitySnapshotTableReferenceService', () => {
  const tableReferenceService = {
    resolveTableName: jest.fn(),
  };
  const queryBuilder = {
    buildQuery: jest.fn(),
  };
  const identifierEscaper = {
    escapeIdentifier: jest.fn(),
  };
  const service = new DataQualitySnapshotTableReferenceService(
    tableReferenceService as unknown as DataMartTableReferenceService,
    queryBuilder as unknown as DataMartQueryBuilderFacade,
    identifierEscaper as unknown as IdentifierEscaperFacade
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('builds an explicit projection from the stable SQL Data Mart view', async () => {
    tableReferenceService.resolveTableName.mockResolvedValue('warehouse.internal.view_dm_source');
    identifierEscaper.escapeIdentifier.mockResolvedValue('`warehouse`.`internal`.`view_dm_source`');
    const reference = await service.resolve({
      dataMartId: 'dm-source',
      projectId: 'project-1',
      definition: { sqlQuery: 'SELECT saved_value FROM saved_source' },
      storage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
      liveStorage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
    });

    expect(reference).toEqual({ buildQuery: expect.any(Function) });
    await expect(reference.buildQuery(['`customer_id`', '`source_pk`'])).resolves.toBe(
      'SELECT `customer_id`, `source_pk` FROM `warehouse`.`internal`.`view_dm_source`'
    );
    expect(queryBuilder.buildQuery).not.toHaveBeenCalled();
    expect(tableReferenceService.resolveTableName).toHaveBeenCalledTimes(1);
  });

  it('builds a non-SQL query from the saved definition after validating storage identity', async () => {
    queryBuilder.buildQuery.mockResolvedValue('SELECT `id` FROM saved_table');

    const reference = await service.resolve({
      dataMartId: 'dm-source',
      projectId: 'project-1',
      definition: { fullyQualifiedName: 'warehouse.dataset.saved_table' },
      storage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
      liveStorage: {
        id: 'storage-1',
        type: DataStorageType.GOOGLE_BIGQUERY,
      },
    });

    await expect(reference.buildQuery(['`id`'])).resolves.toBe('SELECT `id` FROM saved_table');
    expect(queryBuilder.buildQuery).toHaveBeenCalledWith(
      DataStorageType.GOOGLE_BIGQUERY,
      { fullyQualifiedName: 'warehouse.dataset.saved_table' },
      { columns: ['`id`'] }
    );
    expect(tableReferenceService.resolveTableName).not.toHaveBeenCalled();
  });

  it('rejects a moved storage before resolving a view or building a query', async () => {
    await expect(
      service.resolve({
        dataMartId: 'dm-target',
        projectId: 'project-1',
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

    expect(tableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(queryBuilder.buildQuery).not.toHaveBeenCalled();
    expect(identifierEscaper.escapeIdentifier).not.toHaveBeenCalled();
  });
});
