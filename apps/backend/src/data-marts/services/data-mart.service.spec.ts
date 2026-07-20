import { DataMartService } from './data-mart.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import type { DataMart } from '../entities/data-mart.entity';
import { DataSource, EntitySchema, type Repository } from 'typeorm';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { RoleScope } from '../enums/role-scope.enum';

function makeDataMart(overrides: Partial<DataMart> = {}): DataMart {
  return {
    id: 'dm-1',
    projectId: 'proj-1',
    storage: { type: DataStorageType.GOOGLE_BIGQUERY },
    schema: null,
    schemaActualizedAt: undefined,
    ...overrides,
  } as unknown as DataMart;
}

describe('DataMartService schema actualization', () => {
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    manager: { connection: { options: { type: string } } };
  };
  let schemaProvider: { getActualDataMartSchema: jest.Mock };
  let schemaMerger: { mergeSchemas: jest.Mock };
  let searchIndexInvalidation: { scheduleDataMartSchemaChanged: jest.Mock };
  let service: DataMartService;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn(async (dataMart: DataMart) => dataMart),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: { connection: { options: { type: 'mysql' } } },
    };
    schemaProvider = {
      getActualDataMartSchema: jest.fn().mockResolvedValue({ fields: [{ name: 'amount' }] }),
    };
    schemaMerger = {
      mergeSchemas: jest.fn().mockResolvedValue({ fields: [{ name: 'amount' }] }),
    };
    searchIndexInvalidation = {
      scheduleDataMartSchemaChanged: jest.fn().mockResolvedValue(undefined),
    };
    service = new DataMartService(
      repository as any,
      schemaProvider as any,
      schemaMerger as any,
      searchIndexInvalidation as any
    );
  });

  it('schedules search invalidation after saving an actualized schema', async () => {
    const dataMart = makeDataMart();
    repository.findOne.mockResolvedValue(dataMart);

    await service.actualizeSchema('dm-1', 'proj-1');

    expect(schemaProvider.getActualDataMartSchema).toHaveBeenCalledWith(dataMart);
    expect(schemaMerger.mergeSchemas).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY, null, {
      fields: [{ name: 'amount' }],
    });
    expect(repository.save).toHaveBeenCalledWith(dataMart);
    expect(searchIndexInvalidation.scheduleDataMartSchemaChanged).toHaveBeenCalledWith(
      'dm-1',
      'proj-1'
    );
  });

  it('does not save or invalidate when schema is still fresh', async () => {
    const dataMart = makeDataMart({ schemaActualizedAt: new Date() });
    repository.findOne.mockResolvedValue(dataMart);

    await service.actualizeSchemaIfExpired('dm-1', 'proj-1', 60_000);

    expect(schemaProvider.getActualDataMartSchema).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(searchIndexInvalidation.scheduleDataMartSchemaChanged).not.toHaveBeenCalled();
  });

  it('does not fail schema actualization when search invalidation fails', async () => {
    const dataMart = makeDataMart();
    repository.findOne.mockResolvedValue(dataMart);
    searchIndexInvalidation.scheduleDataMartSchemaChanged.mockRejectedValue(
      new Error('queue down')
    );
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await expect(service.actualizeSchema('dm-1', 'proj-1')).resolves.toBe(dataMart);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('queue down'));
    warnSpy.mockRestore();
  });

  it('reports a concurrent field edit when the conditional update loses the race', async () => {
    const sourceAtRunStart = {
      name: 'GoogleSheets',
      node: 'sheet',
      fields: ['old_field'],
      configuration: [{ _id: 'config-1', SpreadsheetId: 'sheet-1' }],
    };
    const modifiedAt = new Date('2026-07-14T10:00:00.000Z');
    const dataMart = makeDataMart({
      modifiedAt,
      definition: {
        connector: {
          source: sourceAtRunStart,
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });
    repository.update.mockResolvedValue({ affected: 0 });

    const updated = await service.updateConnectorSourceFields(dataMart, ['discovered_field']);

    expect(updated).toBe(false);
    expect(repository.update).toHaveBeenCalledWith(
      {
        id: 'dm-1',
        projectId: 'proj-1',
        modifiedAt,
      },
      expect.objectContaining({ definition: expect.any(Object) })
    );
  });

  it('treats an already synchronized field list as successful without writing', async () => {
    const fields = ['_owox_row_number', 'name'];
    const dataMart = makeDataMart({
      definition: {
        connector: {
          source: {
            name: 'GoogleSheets',
            node: 'sheet',
            fields,
            configuration: [{ _id: 'config-1' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });

    await expect(service.updateConnectorSourceFields(dataMart, fields)).resolves.toBe(true);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('matches SQLite timestamps stored without milliseconds during the conditional update', async () => {
    const entitySchema = new EntitySchema<{ id: string; modifiedAt: Date; value: string }>({
      name: 'ConditionalUpdateTest',
      tableName: 'conditional_update_test',
      columns: {
        id: { type: String, primary: true },
        modifiedAt: { type: Date },
        value: { type: String },
      },
    });
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [entitySchema],
      synchronize: true,
    });

    await dataSource.initialize();
    try {
      await dataSource.query(
        "INSERT INTO conditional_update_test (id, modifiedAt, value) VALUES ('dm-1', '2026-07-14 10:00:00', 'old')"
      );
      const sqliteRepository = dataSource.getRepository(entitySchema);
      const sqliteService = new DataMartService(
        sqliteRepository as any,
        schemaProvider as any,
        schemaMerger as any
      );
      const modifiedAtCriterion = sqliteService['createModifiedAtUpdateCriterion'](
        new Date('2026-07-14T10:00:00.000Z')
      );

      const result = await sqliteRepository.update(
        { id: 'dm-1', modifiedAt: modifiedAtCriterion },
        { value: 'updated' }
      );

      expect(result.affected).toBe(1);
      await expect(sqliteRepository.findOneByOrFail({ id: 'dm-1' })).resolves.toMatchObject({
        value: 'updated',
      });
    } finally {
      await dataSource.destroy();
    }
  });

  it('updates fields without rewriting connector configuration', async () => {
    const sourceAtRunStart = {
      name: 'GoogleSheets',
      node: 'sheet',
      fields: ['old_field'],
      configuration: [
        {
          _id: 'config-1',
          ImportAllColumns: true,
        },
      ],
    };
    const modifiedAt = new Date('2026-07-14T10:00:00.000Z');
    const dataMart = makeDataMart({
      modifiedAt,
      definition: {
        connector: {
          source: sourceAtRunStart,
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });

    const updated = await service.updateConnectorSourceFields(dataMart, ['new_field']);

    expect(updated).toBe(true);
    expect(repository.update).toHaveBeenCalledWith(
      { id: 'dm-1', projectId: 'proj-1', modifiedAt },
      {
        definition: {
          connector: {
            source: { ...sourceAtRunStart, fields: ['new_field'] },
            storage: { fullyQualifiedName: 'dataset.table' },
          },
        },
      }
    );
  });
});

describe('DataMartService list filtering', () => {
  it('applies a status filter before the page limit', async () => {
    const countQueryBuilder = {
      take: jest.fn(),
      skip: jest.fn(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    countQueryBuilder.take.mockReturnValue(countQueryBuilder);
    countQueryBuilder.skip.mockReturnValue(countQueryBuilder);

    const queryBuilder = {
      leftJoin: jest.fn(),
      leftJoinAndSelect: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      setParameter: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      take: jest.fn(),
      skip: jest.fn(),
      clone: jest.fn(),
      getRawAndEntities: jest.fn().mockResolvedValue({ raw: [], entities: [] }),
    };
    queryBuilder.leftJoin.mockReturnValue(queryBuilder);
    queryBuilder.leftJoinAndSelect.mockReturnValue(queryBuilder);
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.addSelect.mockReturnValue(queryBuilder);
    queryBuilder.setParameter.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder);
    queryBuilder.take.mockReturnValue(queryBuilder);
    queryBuilder.skip.mockReturnValue(queryBuilder);
    queryBuilder.clone.mockReturnValue(countQueryBuilder);

    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new DataMartService(repository as never, null as never, null as never);

    await service.findByProjectIdForList('project-1', {
      limit: 1_000,
      roles: ['admin'],
      status: DataMartStatus.PUBLISHED,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('dm.status = :status', {
      status: DataMartStatus.PUBLISHED,
    });
    expect(queryBuilder.take).toHaveBeenCalledWith(1_000);
    expect(queryBuilder.andWhere.mock.invocationCallOrder[1]).toBeLessThan(
      queryBuilder.take.mock.invocationCallOrder[0]
    );
  });
});

const canvasDataMartSchema = new EntitySchema<DataMart>({
  name: 'CanvasDataMart',
  tableName: 'data_mart',
  columns: {
    id: { type: String, primary: true },
    title: { type: String },
    projectId: { type: String },
    storage: { name: 'storageId', type: String },
    schema: { type: 'simple-json', nullable: true },
    status: { type: String },
    description: { type: String, nullable: true },
    availableForReporting: { type: Boolean, default: false },
    availableForMaintenance: { type: Boolean, default: false },
    deletedAt: { type: Date, nullable: true, deleteDate: true },
  },
});

describe('DataMartService canvas visibility queries', () => {
  let dataSource: DataSource;
  let repository: Repository<DataMart>;
  let service: DataMartService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [canvasDataMartSchema],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    repository = dataSource.getRepository<DataMart>('CanvasDataMart');
    service = new DataMartService(repository, null as never, null as never, null as never);

    await createCanvasVisibilityTables(dataSource);
    await seedCanvasDataMarts(repository, dataSource);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('applies project, storage, soft-delete, ownership, sharing, context, count, and ordering', async () => {
    const result = await service.findByProjectIdAndStorageIdForCanvas('project-1', 'storage-1', {
      userId: 'viewer-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
      limit: 1,
      offset: 1,
    });

    expect(result.total).toBe(2);
    expect(result.items.map(item => item.id)).toEqual(['shared-context']);
  });

  it('gives editors maintenance visibility while admins bypass the ownership/share gate', async () => {
    const editor = await service.findByProjectIdAndStorageIdForCanvas('project-1', 'storage-1', {
      userId: 'editor-1',
      roles: ['editor'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
    });
    const admin = await service.findByProjectIdAndStorageIdForCanvas('project-1', 'storage-1', {
      userId: 'admin-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
    });

    expect(editor.items.map(item => item.id)).toEqual([
      'owned',
      'shared-context',
      'maintenance-context',
    ]);
    expect(admin.items.map(item => item.id)).toEqual([
      'owned',
      'shared-context',
      'maintenance-context',
      'shared-other-context',
    ]);
  });

  it('uses the same scoped visibility gate when selecting edge endpoint IDs', async () => {
    const ids = await service.findVisibleIdsByProjectIdAndStorageId('project-1', 'storage-1', {
      userId: 'viewer-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
    });

    expect(new Set(ids)).toEqual(new Set(['owned', 'shared-context']));
  });
});

async function createCanvasVisibilityTables(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'CREATE TABLE data_mart_technical_owners (data_mart_id varchar, user_id varchar)'
  );
  await dataSource.query(
    'CREATE TABLE data_mart_business_owners (data_mart_id varchar, user_id varchar)'
  );
  await dataSource.query(
    'CREATE TABLE data_mart_contexts (data_mart_id varchar, context_id varchar)'
  );
  await dataSource.query(
    'CREATE TABLE member_role_contexts (user_id varchar, project_id varchar, context_id varchar)'
  );
  await dataSource.query('CREATE TABLE context (id varchar PRIMARY KEY, deletedAt datetime)');
}

async function seedCanvasDataMarts(
  repository: Repository<DataMart>,
  dataSource: DataSource
): Promise<void> {
  const rows = [
    canvasRow('owned', 'Alpha'),
    canvasRow('shared-context', 'Beta', { availableForReporting: true }),
    canvasRow('maintenance-context', 'Delta', { availableForMaintenance: true }),
    canvasRow('shared-other-context', 'Gamma', { availableForReporting: true }),
    canvasRow('deleted', 'Deleted', { availableForReporting: true, deletedAt: new Date() }),
    canvasRow('other-storage', 'Other storage', {
      storage: 'storage-2' as unknown as DataMart['storage'],
      availableForReporting: true,
    }),
    canvasRow('other-project', 'Other project', {
      projectId: 'project-2',
      availableForReporting: true,
    }),
  ];
  await repository.insert(rows);

  await dataSource.query(
    "INSERT INTO data_mart_technical_owners (data_mart_id, user_id) VALUES ('owned', 'viewer-1'), ('owned', 'editor-1')"
  );
  await dataSource.query(
    "INSERT INTO context (id, deletedAt) VALUES ('context-1', NULL), ('context-2', NULL)"
  );
  await dataSource.query(
    "INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES ('viewer-1', 'project-1', 'context-1'), ('editor-1', 'project-1', 'context-1')"
  );
  await dataSource.query(
    "INSERT INTO data_mart_contexts (data_mart_id, context_id) VALUES ('shared-context', 'context-1'), ('maintenance-context', 'context-1'), ('shared-other-context', 'context-2')"
  );
}

function canvasRow(id: string, title: string, overrides: Partial<DataMart> = {}): DataMart {
  return {
    id,
    title,
    projectId: 'project-1',
    storage: 'storage-1' as unknown as DataMart['storage'],
    schema: { fields: [{ name: `${id}-field` }] },
    status: DataMartStatus.PUBLISHED,
    description: null,
    availableForReporting: false,
    availableForMaintenance: false,
    deletedAt: null,
    ...overrides,
  } as unknown as DataMart;
}
