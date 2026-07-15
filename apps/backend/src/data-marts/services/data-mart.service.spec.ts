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
  let repository: { findOne: jest.Mock; save: jest.Mock };
  let schemaProvider: { getActualDataMartSchema: jest.Mock };
  let schemaMerger: { mergeSchemas: jest.Mock };
  let searchIndexInvalidation: { scheduleDataMartSchemaChanged: jest.Mock };
  let service: DataMartService;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn(async (dataMart: DataMart) => dataMart),
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
    definitionType: { type: String, nullable: true },
    dataQualityConfig: { type: 'simple-json', nullable: true },
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
