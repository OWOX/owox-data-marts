import { PreviewDataMartService, PreviewDataMartCommand } from './preview-data-mart.service';
jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
jest.mock('../../idp/facades/idp-projections.facade', () => ({ IdpProjectionsFacade: jest.fn() }));
import { DataSource, EntitySchema } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { serializeSqliteTransactions } from '../../config/sqlite-transaction-serializer';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMartBusinessOwner } from '../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../entities/data-mart-technical-owner.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { ContextReferenceGuard } from '../entities/context-reference-guard.entity';
import { ConnectorReferenceGuard } from '../entities/connector-reference-guard.entity';
import { DataMartService } from '../services/data-mart.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartModelMutationService } from './data-mart-model-mutation.service';
import { ActualizeDataMartSchemaService } from './actualize-data-mart-schema.service';
import { UpdateDataMartSchemaService } from './update-data-mart-schema.service';
import { UpdateDataMartOwnersService } from './update-data-mart-owners.service';
import { UpdateAvailabilityService } from './update-availability.service';
import { CreateDataMartRelationshipService } from './create-data-mart-relationship.service';
import { UpdateDataMartRelationshipService } from './update-data-mart-relationship.service';
import { DeleteDataMartRelationshipService } from './delete-data-mart-relationship.service';
import { UpdateBlendedFieldsConfigService } from './update-blended-fields-config.service';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { DeleteRelationshipCommand } from '../dto/domain/delete-relationship.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { Action, EntityType } from '../services/access-decision';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';

const storage = new EntitySchema<DataStorage>({
  name: 'A5Storage',
  target: DataStorage,
  columns: {
    id: { type: String, primary: true },
    projectId: { type: String },
    type: { type: String },
    config: { type: 'simple-json', nullable: true },
  },
});
const mart = new EntitySchema<DataMart>({
  name: 'A5Mart',
  target: DataMart,
  columns: {
    id: { type: String, primary: true },
    projectId: { type: String },
    title: { type: String },
    revision: { type: Number, default: 1 },
    status: { type: String, default: 'DRAFT' },
    definitionType: { type: String, nullable: true },
    definition: { type: 'simple-json', nullable: true },
    schema: { type: 'simple-json', nullable: true },
    schemaInputRevision: { type: Number, nullable: true },
    schemaActualizedAt: { type: Date, nullable: true },
    blendedFieldsConfig: { type: 'simple-json', nullable: true },
    availableForReporting: { type: Boolean, default: true },
    availableForMaintenance: { type: Boolean, default: true },
    modifiedAt: { type: Date, updateDate: true },
    deletedAt: { type: Date, deleteDate: true, nullable: true },
  },
  relations: {
    storage: { type: 'many-to-one', target: () => DataStorage, eager: true },
    businessOwners: {
      type: 'one-to-many',
      target: () => DataMartBusinessOwner,
      inverseSide: 'dataMart',
      eager: true,
    },
    technicalOwners: {
      type: 'one-to-many',
      target: () => DataMartTechnicalOwner,
      inverseSide: 'dataMart',
      eager: true,
    },
  },
});
const business = new EntitySchema<DataMartBusinessOwner>({
  name: 'A5Business',
  target: DataMartBusinessOwner,
  columns: { dataMartId: { type: String, primary: true }, userId: { type: String, primary: true } },
  relations: {
    dataMart: { type: 'many-to-one', target: () => DataMart, joinColumn: { name: 'dataMartId' } },
  },
});
const technical = new EntitySchema<DataMartTechnicalOwner>({
  name: 'A5Technical',
  target: DataMartTechnicalOwner,
  columns: { dataMartId: { type: String, primary: true }, userId: { type: String, primary: true } },
  relations: {
    dataMart: { type: 'many-to-one', target: () => DataMart, joinColumn: { name: 'dataMartId' } },
  },
});
const relationship = new EntitySchema<DataMartRelationship>({
  name: 'A5Relationship',
  target: DataMartRelationship,
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    projectId: { type: String },
    targetAlias: { type: String },
    joinConditions: { type: 'simple-json' },
    description: { type: String, nullable: true },
    createdById: { type: String },
    createdAt: { type: Date, createDate: true },
  },
  relations: {
    sourceDataMart: { type: 'many-to-one', target: () => DataMart, eager: true },
    targetDataMart: { type: 'many-to-one', target: () => DataMart, eager: true },
    dataStorage: { type: 'many-to-one', target: () => DataStorage, eager: true },
  },
});
const actor = {
  projectId: 'project',
  userId: 'actor',
  roles: ['editor' as const],
  dataMartId: 'source',
  expectedRevision: 1,
};
const fields = {
  type: 'bigquery-data-mart-schema' as const,
  fields: [
    {
      name: 'id',
      type: 'INTEGER' as const,
      mode: 'NULLABLE' as const,
      status: 'CONNECTED' as const,
    },
  ],
};

describe('Data Mart model real SQLite composition', () => {
  let db: DataSource;
  let marts: DataMartService;
  let model: DataMartModelMutationService;
  let schemaWriter: UpdateDataMartSchemaService;
  let update: UpdateDataMartRelationshipService;
  let remove: DeleteDataMartRelationshipService;
  let denied: (id: string, action: Action, type: EntityType) => boolean;
  let failCache: boolean;
  let provider: jest.Mock;
  let validator: jest.Mock;
  let preview: PreviewDataMartService;
  let warehousePreview: jest.Mock;
  beforeAll(() =>
    initializeTransactionalContext({ storageDriver: StorageDriver.ASYNC_LOCAL_STORAGE })
  );
  beforeEach(async () => {
    db = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        storage,
        mart,
        business,
        technical,
        relationship,
        ContextReferenceGuard,
        ConnectorReferenceGuard,
      ],
      synchronize: true,
    }).initialize();
    serializeSqliteTransactions(addTransactionalDataSource(db));
    denied = () => false;
    failCache = false;
    const access = {
      canAccess: async (_u: string, _r: string[], type: EntityType, id: string, action: Action) =>
        !denied(id, action, type),
      canAccessStored: async (
        _u: string,
        _r: string[],
        type: EntityType,
        id: string,
        action: Action
      ) => !denied(id, action, type),
    };
    await db
      .getRepository(DataStorage)
      .save({ id: 'storage', projectId: 'project', type: DataStorageType.GOOGLE_BIGQUERY });
    for (const id of ['source', 'target', 'other'])
      await db.getRepository(DataMart).save({
        id,
        projectId: 'project',
        title: id,
        storage: { id: 'storage' },
        schema: fields as never,
      });
    await db.getRepository(DataMartBusinessOwner).save({ dataMartId: 'source', userId: 'actor' });
    marts = new DataMartService(db.getRepository(DataMart), {} as never, {} as never);
    jest
      .spyOn(marts, 'getByIdAndProjectId')
      .mockImplementation(async (id, projectId, manager) =>
        (manager ?? db.manager).getRepository(DataMart).findOneByOrFail({ id, projectId })
      );
    const mapper = {
      toDomainDto: (value: DataMart) => ({
        id: value.id,
        revision: value.revision,
        schema: value.schema,
      }),
    };
    const cache = {
      invalidateByDataMartId: async () => {
        if (failCache) throw new Error('cache failure');
      },
    };
    const projections = {
      fetchCreatedByUser: async () => null,
      fetchAllRelevantUserProjections: async () => new UserProjectionsListDto([]),
    };
    const relations = new DataMartRelationshipService(
      db.getRepository(DataMartRelationship),
      {} as never,
      new RelationshipMapper()
    );
    const create = new CreateDataMartRelationshipService(
      relations,
      marts,
      db,
      projections as never,
      new RelationshipMapper(),
      access as never
    );
    update = new UpdateDataMartRelationshipService(
      relations,
      marts,
      db,
      projections as never,
      cache as never,
      new RelationshipMapper(),
      access as never
    );
    remove = new DeleteDataMartRelationshipService(
      relations,
      marts,
      db,
      cache as never,
      access as never
    );
    const ownerWriter = new UpdateDataMartOwnersService(
      marts,
      mapper as never,
      projections as never,
      { getProjectMembers: async () => [{ userId: 'actor' }, { userId: 'new-owner' }] } as never,
      db.getRepository(DataMartBusinessOwner),
      db.getRepository(DataMartTechnicalOwner),
      access as never
    );
    const availability = new UpdateAvailabilityService(
      db.getRepository(DataMart),
      {} as never,
      {} as never,
      access as never,
      marts
    );
    const output = new UpdateBlendedFieldsConfigService(
      marts,
      db,
      cache as never,
      mapper as never,
      access as never
    );
    provider = jest.fn(async (dataMart: DataMart) => {
      dataMart.schemaActualizedAt = new Date();
    });
    jest.spyOn(marts, 'actualizeSchemaInEntity').mockImplementation(provider);
    const actualizer = new ActualizeDataMartSchemaService(
      marts,
      { checkIsValid: async () => undefined } as never,
      mapper as never,
      access as never
    );
    validator = jest.fn(async () => ({ errors: [], warnings: [] }));
    schemaWriter = new UpdateDataMartSchemaService(
      marts,
      cache as never,
      { validateAndParse: async (value: unknown) => value } as never,
      { validate: validator } as never,
      mapper as never,
      access as never,
      { resolve: async () => ({}) } as never,
      db
    );
    model = new DataMartModelMutationService(
      db,
      marts,
      access as never,
      actualizer,
      schemaWriter,
      relations,
      create,
      update,
      remove,
      output,
      ownerWriter,
      availability
    );
    warehousePreview = jest.fn(async () => ({
      dataHeaders: [{ name: 'id', storageFieldType: 'INTEGER' }],
    }));
    preview = new PreviewDataMartService(
      marts,
      {
        computeBlendableSchema: async () => ({
          nativeFields: (await marts.getByIdAndProjectId('source', 'project')).schema?.fields ?? [],
        }),
      } as never,
      { compose: async () => ({ sql: 'SELECT 1' }) } as never,
      {
        resolve: async () => ({
          honorsQueryTimeout: true,
          prepareReportData: warehousePreview,
          readReportDataBatch: async () => ({ dataRows: [[1]], nextDataBatchId: null }),
          finalize: async () => undefined,
        }),
      } as never,
      access as never,
      {} as never,
      { verifyCanPerformOperations: async () => undefined } as never,
      1000
    );
  });
  afterEach(async () => {
    deleteDataSourceByName('default');
    if (db?.isInitialized) await db.destroy();
  });
  const current = () => marts.getByIdAndProjectId('source', 'project');
  const createChange = (targetAlias = 'joined') => ({
    action: 'create' as const,
    targetDataMartId: 'target',
    targetAlias,
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
  });

  it('refreshes against revision N and saves only schema with N binding and N+1 result', async () => {
    expect(await model.actualizeSchema(actor)).toMatchObject({
      revision: 2,
      schema: { inputRevision: 1, freshness: 'current' },
    });
    expect(await current()).toMatchObject({ revision: 2, schemaInputRevision: 1 });
  });
  it('does not overwrite metadata changed while schema provider was pending', async () => {
    provider.mockImplementation(async () => {
      await marts.writeConfiguration(db.manager, 'source', 'project', 1, { title: 'new' });
    });
    await expect(model.actualizeSchema(actor)).rejects.toBeInstanceOf(ConflictException);
    expect(await current()).toMatchObject({ title: 'new', revision: 2, schemaInputRevision: null });
  });
  it('rejects revocation during schema actualization without writing', async () => {
    provider.mockImplementation(async () => {
      denied = (_id, action) => action === Action.EDIT;
    });
    await expect(model.actualizeSchema(actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await current()).revision).toBe(1);
  });
  it('rolls schema changes and revision back when cache invalidation fails', async () => {
    await model.actualizeSchema(actor);
    failCache = true;
    await expect(
      model.updateSchema({ ...actor, expectedRevision: 2, schema: { ...fields, fields: [] } })
    ).rejects.toThrow('cache failure');
    expect((await current()).revision).toBe(2);
    expect((await current()).schema?.fields).toHaveLength(1);
  });
  it('rejects a schema dry-run result when REST advanced the input revision', async () => {
    await model.actualizeSchema(actor);
    validator.mockImplementation(async () => {
      await marts.writeConfiguration(db.manager, 'source', 'project', 2, { title: 'REST' });
      return { errors: [], warnings: [] };
    });
    await expect(
      model.updateSchema({ ...actor, expectedRevision: 2, schema: fields as never })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await current()).toMatchObject({ title: 'REST', revision: 3 });
  });
  it('REST schema saves invalidate an earlier MCP revision', async () => {
    await schemaWriter.run(
      new UpdateDataMartSchemaCommand('source', 'project', fields as never, 'actor', ['editor'])
    );
    await expect(model.actualizeSchema(actor)).rejects.toBeInstanceOf(ConflictException);
  });
  it('applies changes atomically, retains omitted relationships and checks target permissions', async () => {
    await model.setRelationships({ ...actor, changes: [createChange()] });
    const revision = (await current()).revision;
    await model.setRelationships({
      ...actor,
      expectedRevision: revision,
      changes: [createChange('other_join')],
    });
    expect(await db.getRepository(DataMartRelationship).count()).toBe(2);
    denied = id => id === 'target';
    await expect(
      model.setRelationships({
        ...actor,
        expectedRevision: (await current()).revision,
        changes: [createChange('third')],
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await db.getRepository(DataMartRelationship).count()).toBe(2);
  });
  it('validates the entire proposed graph before writes and rejects duplicate aliases', async () => {
    await expect(
      model.setRelationships({ ...actor, changes: [createChange(), createChange()] })
    ).rejects.toThrow('unique');
    expect(await db.getRepository(DataMartRelationship).count()).toBe(0);
    expect((await current()).revision).toBe(1);
  });
  it('rolls relationship creation and configuration bumps back when output invalidation fails', async () => {
    failCache = true;
    await expect(
      model.setRelationships({
        ...actor,
        changes: [createChange()],
        blendedFieldsConfig: { sources: [{ path: 'joined', alias: 'Joined' }] },
      })
    ).rejects.toThrow('cache failure');
    expect(await db.getRepository(DataMartRelationship).count()).toBe(0);
    expect((await current()).revision).toBe(1);
  });
  it.each(['update', 'remove'])(
    'existing REST %s requires target EDIT, not just source EDIT',
    async operation => {
      await model.setRelationships({ ...actor, changes: [createChange()] });
      const rel = await db
        .getRepository(DataMartRelationship)
        .findOneByOrFail({ targetAlias: 'joined' });
      denied = id => id === 'target';
      const work =
        operation === 'update'
          ? update.run(
              new UpdateRelationshipCommand(
                rel.id,
                'source',
                'project',
                'actor',
                ['editor'],
                'renamed'
              )
            )
          : remove.run(
              new DeleteRelationshipCommand(rel.id, 'source', 'project', 'actor', ['editor'])
            );
      await expect(work).rejects.toBeInstanceOf(ForbiddenException);
      expect(await db.getRepository(DataMartRelationship).count()).toBe(1);
    }
  );
  it('checks both access permissions before any write', async () => {
    denied = (_id, action) => action === Action.CONFIGURE_SHARING;
    await expect(
      model.setAccess({
        ...actor,
        mode: 'apply',
        owners: { businessOwnerIds: ['new-owner'], technicalOwnerIds: [] },
        availability: { availableForReporting: false, availableForMaintenance: false },
        impactDigest: 'invalid',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await current()).businessOwnerIds).toEqual(['actor']);
    expect((await current()).revision).toBe(1);
  });
  it('binds access impact to current audience and returns only outcome after self-removal', async () => {
    const request = {
      ...actor,
      mode: 'inspect' as const,
      owners: { businessOwnerIds: ['new-owner'], technicalOwnerIds: [] },
      availability: { availableForReporting: false, availableForMaintenance: false },
    };
    const inspect = await model.setAccess(request);
    expect(inspect).toMatchObject({
      state: 'inspection',
      currentAudience: { businessOwnerIds: ['actor'] },
      proposedAudience: { businessOwnerIds: ['new-owner'], availableForReporting: false },
    });
    expect((await current()).revision).toBe(1);
    const result = await model.setAccess({
      ...request,
      mode: 'apply',
      impactDigest: inspect.impactDigest,
    });
    expect(Object.keys(result).sort()).toEqual(['dataMartId', 'revision', 'state']);
    expect(await current()).toMatchObject({ availableForReporting: false });
    expect((await current()).businessOwnerIds).toEqual(['new-owner']);
  });
  it('rejects an access digest after Context audience changed without mart text changes', async () => {
    const request = {
      ...actor,
      mode: 'inspect' as const,
      availability: { availableForReporting: false, availableForMaintenance: false },
    };
    const inspect = await model.setAccess(request);
    await db.getRepository(ContextReferenceGuard).save({ projectId: 'project', revision: 9 });
    await expect(
      model.setAccess({ ...request, mode: 'apply', impactDigest: inspect.impactDigest })
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await current()).revision).toBe(1);
  });
  it('allows only one of two concurrent access writes with the same revision', async () => {
    const request = {
      ...actor,
      mode: 'inspect' as const,
      availability: { availableForReporting: false, availableForMaintenance: false },
    };
    const inspect = await model.setAccess(request);
    const results = await Promise.allSettled([
      model.setAccess({ ...request, mode: 'apply', impactDigest: inspect.impactDigest }),
      model.setAccess({ ...request, mode: 'apply', impactDigest: inspect.impactDigest }),
    ]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
  });
  it('rolls access flags and revision back if the owner assignment is invalid', async () => {
    const request = {
      ...actor,
      mode: 'inspect' as const,
      owners: { businessOwnerIds: ['outsider'], technicalOwnerIds: [] },
      availability: { availableForReporting: false, availableForMaintenance: false },
    };
    const inspect = await model.setAccess(request);
    await expect(
      model.setAccess({ ...request, mode: 'apply', impactDigest: inspect.impactDigest })
    ).rejects.toThrow('not members');
    expect(await current()).toMatchObject({ revision: 1, availableForReporting: true });
    expect((await current()).businessOwnerIds).toEqual(['actor']);
  });
  it('keeps equal field names independent on distinct relationship paths', async () => {
    await model.setRelationships({
      ...actor,
      changes: [createChange('first'), { ...createChange('second'), targetDataMartId: 'other' }],
      blendedFieldsConfig: {
        sources: [
          { path: 'first', alias: 'First', fields: { id: { alias: 'First ID' } } },
          { path: 'second', alias: 'Second', fields: { id: { alias: 'Second ID' } } },
        ],
      },
    });
    expect(
      (await current()).blendedFieldsConfig?.sources.map(item => item.fields?.id.alias)
    ).toEqual(['First ID', 'Second ID']);
  });
  it('rejects output paths and dependent targets before any model writes', async () => {
    await expect(
      model.setRelationships({
        ...actor,
        changes: [createChange()],
        blendedFieldsConfig: { sources: [{ path: 'absent', alias: 'Absent' }] },
      })
    ).rejects.toThrow('unavailable relationship path');
    expect(await db.getRepository(DataMartRelationship).count()).toBe(0);
    expect((await current()).revision).toBe(1);
  });
  it.each(['actualizeSchema', 'updateSchema', 'setRelationships', 'setAccess'] as const)(
    'rejects anonymous direct %s',
    async method => {
      await expect(
        model[method]({
          ...actor,
          userId: '',
          changes: [],
          schema: fields,
          mode: 'inspect',
          availability: { availableForReporting: true, availableForMaintenance: true },
        } as never)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((await current()).revision).toBe(1);
    }
  );
  it('retains omitted output config and explicitly clears it with null', async () => {
    await model.setRelationships({
      ...actor,
      changes: [createChange()],
      blendedFieldsConfig: { sources: [{ path: 'joined', alias: 'Joined' }] },
    });
    const rel = await db
      .getRepository(DataMartRelationship)
      .findOneByOrFail({ targetAlias: 'joined' });
    await model.setRelationships({
      ...actor,
      expectedRevision: (await current()).revision,
      changes: [{ action: 'update', relationshipId: rel.id, description: 'Updated' }],
    });
    expect((await current()).blendedFieldsConfig?.sources).toHaveLength(1);
    await model.setRelationships({
      ...actor,
      expectedRevision: (await current()).revision,
      changes: [],
      blendedFieldsConfig: null,
    });
    expect((await current()).blendedFieldsConfig).toBeNull();
  });
  it('swaps relationship aliases atomically without merging their output paths', async () => {
    await model.setRelationships({
      ...actor,
      changes: [createChange('first'), { ...createChange('second'), targetDataMartId: 'other' }],
      blendedFieldsConfig: {
        sources: [
          { path: 'first', alias: 'Target' },
          { path: 'second', alias: 'Other' },
        ],
      },
    });
    const all = await db.getRepository(DataMartRelationship).find();
    await model.setRelationships({
      ...actor,
      expectedRevision: (await current()).revision,
      changes: [
        {
          action: 'update',
          relationshipId: all.find(item => item.targetAlias === 'first')!.id,
          targetAlias: 'second',
        },
        {
          action: 'update',
          relationshipId: all.find(item => item.targetAlias === 'second')!.id,
          targetAlias: 'first',
        },
      ],
    });
    expect((await current()).blendedFieldsConfig?.sources).toEqual([
      { path: 'second', alias: 'Target' },
      { path: 'first', alias: 'Other' },
    ]);
  });
  const previewCommand = () =>
    new PreviewDataMartCommand('source', 'project', 'actor', ['editor'], 10, undefined);
  it('blocks Setup schema edits and preview after the definition invalidates its schema', async () => {
    await model.actualizeSchema(actor);
    const existing = (await current()).schema;
    await marts.writeConfiguration(db.manager, 'source', 'project', 2, {
      definitionType: 'TABLE' as never,
      definition: { fullyQualifiedName: 'changed.output' },
    });
    await expect(
      model.updateSchema({ ...actor, expectedRevision: 3, schema: fields as never })
    ).rejects.toMatchObject({ status: 409 });
    await expect(preview.runForSetup(previewCommand())).rejects.toMatchObject({ status: 409 });
    expect(validator).not.toHaveBeenCalled();
    expect(warehousePreview).not.toHaveBeenCalled();
    expect((await current()).schema).toEqual(existing);
  });
  it('a failed actualization preserves stale schema and does not unlock Setup edits or preview', async () => {
    await model.actualizeSchema(actor);
    const existing = (await current()).schema;
    await marts.writeConfiguration(db.manager, 'source', 'project', 2, {
      title: 'Conservative invalidation',
    });
    provider.mockRejectedValue(new Error('warehouse unreachable'));
    await expect(model.actualizeSchema({ ...actor, expectedRevision: 3 })).rejects.toThrow(
      'actualization failed'
    );
    expect(await current()).toMatchObject({
      revision: 3,
      schemaInputRevision: 1,
      schema: existing,
    });
    await expect(
      model.updateSchema({ ...actor, expectedRevision: 3, schema: fields as never })
    ).rejects.toMatchObject({ status: 409 });
    await expect(preview.runForSetup(previewCommand())).rejects.toMatchObject({ status: 409 });
    expect(validator).not.toHaveBeenCalled();
    expect(warehousePreview).not.toHaveBeenCalled();
  });
  it('fresh actualization followed by a metadata-only schema edit retains proof and allows Setup preview', async () => {
    await model.actualizeSchema(actor);
    const edited = {
      ...fields,
      fields: [{ ...fields.fields[0], alias: 'Identifier', description: 'Saved field metadata' }],
    };
    expect(
      await model.updateSchema({ ...actor, expectedRevision: 2, schema: edited as never })
    ).toMatchObject({ revision: 3, schema: { inputRevision: 2, freshness: 'current' } });
    expect(await current()).toMatchObject({ revision: 3, schemaInputRevision: 2 });
    await expect(preview.runForSetup(previewCommand())).resolves.toMatchObject({
      revision: 3,
      schemaFreshness: 'current',
    });
    expect(warehousePreview).toHaveBeenCalledTimes(1);
  });
  it('a new native field has no proof and requires actualization before Setup preview', async () => {
    await model.actualizeSchema(actor);
    await model.updateSchema({
      ...actor,
      expectedRevision: 2,
      schema: {
        ...fields,
        fields: [...fields.fields, { ...fields.fields[0], name: 'new_native' }],
      } as never,
    });
    expect(await current()).toMatchObject({
      revision: 3,
      schemaInputRevision: null,
      schemaActualizedAt: null,
    });
    await expect(preview.runForSetup(previewCommand())).rejects.toMatchObject({ status: 409 });
    expect(warehousePreview).not.toHaveBeenCalled();
  });
  it('a native field type edit cannot manufacture current warehouse schema proof', async () => {
    await model.actualizeSchema(actor);
    const result = await model.updateSchema({
      ...actor,
      expectedRevision: 2,
      schema: { ...fields, fields: [{ ...fields.fields[0], type: 'STRING' }] } as never,
    });
    expect(result).toMatchObject({
      revision: 3,
      schema: { inputRevision: null, freshness: 'stale' },
    });
    await expect(preview.runForSetup(previewCommand())).rejects.toMatchObject({ status: 409 });
    expect(warehousePreview).not.toHaveBeenCalled();
  });
});
