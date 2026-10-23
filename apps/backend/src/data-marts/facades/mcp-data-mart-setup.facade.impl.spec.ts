import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { DataMartSchemaSchema } from '../data-storage-types/data-mart-schema.type';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartIcon } from '../enums/data-mart-icon.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { McpDataMartSetupMapper } from '../mappers/mcp-data-mart-setup.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { ContextAccessService } from '../services/context/context-access.service';
import { ActualizeDataMartSchemaService } from '../use-cases/actualize-data-mart-schema.service';
import { CreateDataMartService } from '../use-cases/create-data-mart.service';
import { DeleteDataMartService } from '../use-cases/delete-data-mart.service';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { ListDataStoragesService } from '../use-cases/list-data-storages.service';
import { ListStorageResourcesService } from '../use-cases/list-storage-resources.service';
import { PublishDataMartService } from '../use-cases/publish-data-mart.service';
import { UpdateAvailabilityService } from '../use-cases/update-availability.service';
import { UpdateBlendedFieldsConfigService } from '../use-cases/update-blended-fields-config.service';
import { UpdateDataMartDefinitionService } from '../use-cases/update-data-mart-definition.service';
import { UpdateDataMartDescriptionService } from '../use-cases/update-data-mart-description.service';
import { UpdateDataMartIconService } from '../use-cases/update-data-mart-icon.service';
import { UpdateDataMartOwnersService } from '../use-cases/update-data-mart-owners.service';
import { UpdateDataMartSchemaService } from '../use-cases/update-data-mart-schema.service';
import { UpdateDataMartTitleService } from '../use-cases/update-data-mart-title.service';
import { ValidateDataMartDefinitionService } from '../use-cases/validate-data-mart-definition.service';
import { ValidateFormulaService } from '../use-cases/validate-formula.service';
import { McpDataMartSetupContext } from './mcp-data-mart-setup.facade';
import { McpDataMartSetupFacadeImpl } from './mcp-data-mart-setup.facade.impl';

describe('McpDataMartSetupFacadeImpl', () => {
  let module: TestingModule;
  let facade: McpDataMartSetupFacadeImpl;
  const ctx: McpDataMartSetupContext = {
    projectId: 'project-1',
    userId: 'actor-1',
    roles: ['editor'],
  };
  const target = { dataMartId: 'mart-1' };
  const schema = { type: 'bigquery-data-mart-schema', fields: [] };
  const dto = new DataMartDto(
    'mart-1',
    'project-1',
    'Draft',
    DataMartStatus.DRAFT,
    {
      id: 'storage-1',
      title: 'Warehouse',
      type: DataStorageType.GOOGLE_BIGQUERY,
    } as DataStorageDto,
    new Date('2026-10-21T00:00:00Z'),
    new Date('2026-10-21T01:00:00Z')
  );
  const runServices = [
    GetDataMartService,
    CreateDataMartService,
    UpdateDataMartTitleService,
    UpdateDataMartDescriptionService,
    UpdateDataMartIconService,
    UpdateDataMartDefinitionService,
    UpdateDataMartSchemaService,
    UpdateDataMartOwnersService,
    UpdateBlendedFieldsConfigService,
    PublishDataMartService,
    DeleteDataMartService,
    ValidateDataMartDefinitionService,
    ValidateFormulaService,
    ActualizeDataMartSchemaService,
    ListDataStoragesService,
    ListStorageResourcesService,
  ];
  const editorOperations: Array<{
    name: string;
    invoke: (context: McpDataMartSetupContext) => Promise<unknown>;
  }> = [
    {
      name: 'create',
      invoke: c => facade.createDataMart(c, { title: 'Draft', storageId: 'storage-1' }),
    },
    {
      name: 'metadata',
      invoke: c =>
        facade.updateDataMartMetadata(c, {
          ...target,
          title: 'New title',
          description: null,
          icon: null,
        }),
    },
    {
      name: 'definition',
      invoke: c =>
        facade.updateDataMartDefinition(c, {
          ...target,
          definitionType: DataMartDefinitionType.SQL,
          definition: { sqlQuery: 'SELECT 1' },
        }),
    },
    { name: 'schema', invoke: c => facade.updateDataMartSchema(c, { ...target, schema }) },
    {
      name: 'owners',
      invoke: c =>
        facade.updateDataMartOwners(c, { ...target, businessOwnerIds: [], technicalOwnerIds: [] }),
    },
    {
      name: 'contexts',
      invoke: c => facade.updateDataMartContexts(c, { ...target, contextIds: [] }),
    },
    {
      name: 'blended fields',
      invoke: c =>
        facade.updateDataMartBlendedFieldsConfig(c, { ...target, blendedFieldsConfig: null }),
    },
    { name: 'publish', invoke: c => facade.publishDataMart(c, target) },
    { name: 'delete', invoke: c => facade.deleteDataMart(c, target) },
    { name: 'definition validation', invoke: c => facade.validateDataMartDefinition(c, target) },
    {
      name: 'formula validation',
      invoke: c =>
        facade.validateDataMartFormula(c, {
          ...target,
          name: 'ratio',
          type: 'FLOAT',
          formula: '{{revenue}} / {{cost}}',
        }),
    },
    { name: 'actualize schema', invoke: c => facade.actualizeDataMartSchema(c, target) },
  ];
  const viewerOperations = [
    { name: 'get', invoke: (c: McpDataMartSetupContext) => facade.getDataMart(c, target) },
    {
      name: 'sharing',
      invoke: (c: McpDataMartSetupContext) =>
        facade.updateDataMartAvailability(c, {
          ...target,
          availableForReporting: false,
          availableForMaintenance: false,
        }),
    },
    { name: 'storages', invoke: (c: McpDataMartSetupContext) => facade.listDataStorages(c) },
    {
      name: 'resources',
      invoke: (c: McpDataMartSetupContext) =>
        facade.listStorageResources(c, { storageId: 'storage-1', level: 'namespaces' }),
    },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        McpDataMartSetupFacadeImpl,
        McpDataMartSetupMapper,
        ...runServices.map(service => ({
          provide: service,
          useValue: { run: jest.fn().mockResolvedValue(dto) },
        })),
        { provide: UpdateAvailabilityService, useValue: { updateDataMartSharing: jest.fn() } },
        { provide: ContextAccessService, useValue: { updateDataMartContexts: jest.fn() } },
        { provide: AccessDecisionService, useValue: { canAccessMany: jest.fn() } },
        { provide: ConnectorSecretService, useValue: { mask: jest.fn() } },
      ],
    }).compile();
    facade = module.get(McpDataMartSetupFacadeImpl);
  });

  afterEach(async () => {
    await module.close();
  });

  it.each(editorOperations)(
    'rejects a viewer before $name reaches domain services',
    async ({ invoke }) => {
      await expect(invoke({ ...ctx, roles: ['viewer'] })).rejects.toThrow(ForbiddenException);
      for (const service of runServices) expect(module.get(service).run).not.toHaveBeenCalled();
      expect(module.get(ContextAccessService).updateDataMartContexts).not.toHaveBeenCalled();
    }
  );

  it.each([...editorOperations, ...viewerOperations])(
    'requires an actor, project and known role before $name',
    async ({ invoke }) => {
      for (const invalid of [
        { ...ctx, userId: ' ' },
        { ...ctx, projectId: '' },
        { ...ctx, roles: [] },
        { ...ctx, roles: ['owner'] },
      ]) {
        await expect(invoke(invalid)).rejects.toThrow(ForbiddenException);
      }
      for (const service of runServices) expect(module.get(service).run).not.toHaveBeenCalled();
      expect(module.get(UpdateAvailabilityService).updateDataMartSharing).not.toHaveBeenCalled();
      expect(module.get(ContextAccessService).updateDataMartContexts).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      name: 'get',
      service: GetDataMartService,
      invoke: () => facade.getDataMart(ctx, target),
      command: {},
    },
    {
      name: 'title',
      service: UpdateDataMartTitleService,
      invoke: () => facade.updateDataMartMetadata(ctx, { ...target, title: 'New title' }),
      command: { title: 'New title' },
    },
    {
      name: 'description',
      service: UpdateDataMartDescriptionService,
      invoke: () => facade.updateDataMartMetadata(ctx, { ...target, description: null }),
      command: { description: null },
    },
    {
      name: 'icon',
      service: UpdateDataMartIconService,
      invoke: () => facade.updateDataMartMetadata(ctx, { ...target, icon: null }),
      command: { icon: null },
    },
    {
      name: 'definition',
      service: UpdateDataMartDefinitionService,
      invoke: () =>
        facade.updateDataMartDefinition(ctx, {
          ...target,
          definitionType: DataMartDefinitionType.SQL,
          definition: { sqlQuery: 'SELECT 1' },
          sourceDataMartId: 'source-mart',
          sourceConfigurationId: 'config-1',
        }),
      command: {
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
        sourceDataMartId: 'source-mart',
        sourceConfigurationId: 'config-1',
      },
    },
    {
      name: 'owners',
      service: UpdateDataMartOwnersService,
      invoke: () =>
        facade.updateDataMartOwners(ctx, {
          ...target,
          businessOwnerIds: ['business-1'],
          technicalOwnerIds: ['tech-1'],
        }),
      command: { businessOwnerIds: ['business-1'], technicalOwnerIds: ['tech-1'] },
    },
    {
      name: 'blended fields',
      service: UpdateBlendedFieldsConfigService,
      invoke: () =>
        facade.updateDataMartBlendedFieldsConfig(ctx, { ...target, blendedFieldsConfig: null }),
      command: { blendedFieldsConfig: null },
    },
    {
      name: 'publish',
      service: PublishDataMartService,
      invoke: () => facade.publishDataMart(ctx, target),
      command: { createdById: 'actor-1' },
    },
    {
      name: 'schema actualization',
      service: ActualizeDataMartSchemaService,
      invoke: () => facade.actualizeDataMartSchema(ctx, target),
      command: {},
    },
  ])(
    'forwards actor authorization for $name and maps the domain result',
    async ({ service, invoke, command }) => {
      const result = await invoke();
      expect(module.get(service).run).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mart-1',
          projectId: 'project-1',
          userId: 'actor-1',
          roles: ['editor'],
          ...command,
        })
      );
      expect(result).toMatchObject({
        id: 'mart-1',
        status: 'DRAFT',
        definition: null,
        schema: null,
      });
      expect(result).not.toHaveProperty('projectId');
    }
  );

  it('allows admins through the editor gate and returns only the created identity', async () => {
    const result = await facade.createDataMart(
      { ...ctx, roles: ['admin'] },
      { title: 'Draft', storageId: 'storage-1', icon: null }
    );
    expect(module.get(CreateDataMartService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['admin'],
        storageId: 'storage-1',
        title: 'Draft',
        icon: null,
      })
    );
    expect(result).toEqual({ id: 'mart-1', title: 'Draft' });
  });

  it.each([
    { properties: { title: 'New title' }, changed: UpdateDataMartTitleService },
    { properties: { description: null }, changed: UpdateDataMartDescriptionService },
    { properties: { icon: null }, changed: UpdateDataMartIconService },
  ])('does not write omitted metadata fields: $properties', async ({ properties, changed }) => {
    await facade.updateDataMartMetadata(ctx, { ...target, ...properties });
    for (const service of [
      UpdateDataMartTitleService,
      UpdateDataMartDescriptionService,
      UpdateDataMartIconService,
    ]) {
      expect(module.get(service).run).toHaveBeenCalledTimes(service === changed ? 1 : 0);
    }
    expect(module.get(GetDataMartService).run).toHaveBeenCalledTimes(1);
  });

  it('applies all supplied metadata through authorized domain operations and reads once', async () => {
    await facade.updateDataMartMetadata(ctx, {
      ...target,
      title: 'New title',
      description: null,
      icon: DataMartIcon.PURCHASES,
    });
    for (const [service, properties] of [
      [UpdateDataMartTitleService, { title: 'New title' }],
      [UpdateDataMartDescriptionService, { description: null }],
      [UpdateDataMartIconService, { icon: 'purchases' }],
    ] as const) {
      expect(module.get(service).run).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mart-1',
          projectId: ctx.projectId,
          userId: ctx.userId,
          roles: ctx.roles,
          ...properties,
        })
      );
    }
    expect(module.get(GetDataMartService).run).toHaveBeenCalledTimes(1);
  });

  it('propagates a domain denial before applying later metadata fields', async () => {
    jest
      .mocked(module.get(UpdateDataMartTitleService).run)
      .mockRejectedValue(new ForbiddenException());
    await expect(
      facade.updateDataMartMetadata(ctx, {
        ...target,
        title: 'New title',
        description: null,
        icon: null,
      })
    ).rejects.toThrow(ForbiddenException);
    expect(module.get(UpdateDataMartDescriptionService).run).not.toHaveBeenCalled();
    expect(module.get(UpdateDataMartIconService).run).not.toHaveBeenCalled();
    expect(module.get(GetDataMartService).run).not.toHaveBeenCalled();
  });

  it('does not map or return configuration when the domain read denies access', async () => {
    jest.mocked(module.get(GetDataMartService).run).mockRejectedValue(new ForbiddenException());
    const map = jest.spyOn(module.get(McpDataMartSetupMapper), 'toConfiguration');
    await expect(facade.getDataMart({ ...ctx, roles: ['viewer'] }, target)).rejects.toThrow(
      ForbiddenException
    );
    expect(map).not.toHaveBeenCalled();
  });

  it('returns draft SQL and the full stored schema to an authorized viewer', async () => {
    const fullSchema = DataMartSchemaSchema.parse({
      type: 'bigquery-data-mart-schema',
      fields: [
        { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE', isHiddenForReporting: true },
        {
          name: 'ratio',
          type: 'FLOAT',
          mode: 'NULLABLE',
          alias: 'ROI',
          calculated: {
            formula: '{{revenue}} / NULLIF({{cost}}, 0)',
            level: 'column',
            warehouseValidation: 'skipped',
          },
        },
      ],
    });
    jest.mocked(module.get(GetDataMartService).run).mockResolvedValue({
      ...dto,
      definitionType: DataMartDefinitionType.SQL,
      definition: { sqlQuery: 'SELECT revenue, cost FROM orders' },
      schema: fullSchema,
    });
    await expect(facade.getDataMart({ ...ctx, roles: ['viewer'] }, target)).resolves.toMatchObject({
      status: 'DRAFT',
      definitionType: 'SQL',
      definition: { sqlQuery: 'SELECT revenue, cost FROM orders' },
      schema: fullSchema,
    });
    expect(module.get(GetDataMartService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart-1',
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['viewer'],
      })
    );
    expect(module.get(ConnectorSecretService).mask).not.toHaveBeenCalled();
  });

  it('returns current owners after a title update whose mutation DTO has no owner projections', async () => {
    jest.mocked(module.get(GetDataMartService).run).mockResolvedValue({
      ...dto,
      title: 'New title',
      businessOwnerUsers: [new UserProjectionDto('business-1')],
      technicalOwnerUsers: [new UserProjectionDto('tech-1')],
    });
    await expect(
      facade.updateDataMartMetadata(ctx, { ...target, title: 'New title' })
    ).resolves.toMatchObject({
      title: 'New title',
      businessOwnerIds: ['business-1'],
      technicalOwnerIds: ['tech-1'],
    });
    expect(module.get(GetDataMartService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart-1',
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['editor'],
      })
    );
  });

  it('returns the complete owner mutation result without rereading after ownership changes', async () => {
    jest.mocked(module.get(UpdateDataMartOwnersService).run).mockResolvedValue({
      ...dto,
      businessOwnerUsers: [new UserProjectionDto('business-2')],
      technicalOwnerUsers: [new UserProjectionDto('tech-2')],
    });
    jest.mocked(module.get(GetDataMartService).run).mockRejectedValue(new ForbiddenException());
    await expect(
      facade.updateDataMartOwners(ctx, {
        ...target,
        businessOwnerIds: ['business-2'],
        technicalOwnerIds: ['tech-2'],
      })
    ).resolves.toMatchObject({ businessOwnerIds: ['business-2'], technicalOwnerIds: ['tech-2'] });
    expect(module.get(GetDataMartService).run).not.toHaveBeenCalled();
  });

  it('preserves schema warnings and forwards the parsed schema to the authoritative use case', async () => {
    const warnings = [
      { code: 'warehouse-check-skipped', message: 'Check skipped', field: 'ratio' },
    ];
    jest
      .mocked(module.get(UpdateDataMartSchemaService).run)
      .mockResolvedValue({ ...dto, schema: DataMartSchemaSchema.parse(schema), warnings });
    jest.mocked(module.get(GetDataMartService).run).mockResolvedValue({
      ...dto,
      schema: DataMartSchemaSchema.parse(schema),
    });
    const result = await facade.updateDataMartSchema(ctx, { ...target, schema });
    expect(module.get(UpdateDataMartSchemaService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart-1',
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['editor'],
        schema,
      })
    );
    expect(result).toMatchObject({ id: 'mart-1', schema, warnings });
  });

  it('rejects malformed schema before the save use case', async () => {
    await expect(
      facade.updateDataMartSchema(ctx, { ...target, schema: { type: 'unknown', fields: [] } })
    ).rejects.toThrow();
    expect(module.get(UpdateDataMartSchemaService).run).not.toHaveBeenCalled();
  });

  it('lets domain sharing authorization decide for viewers and does not reread after changing sharing', async () => {
    await expect(
      facade.updateDataMartAvailability(
        { ...ctx, roles: ['viewer'] },
        { ...target, availableForReporting: false, availableForMaintenance: false }
      )
    ).resolves.toBeUndefined();
    expect(module.get(UpdateAvailabilityService).updateDataMartSharing).toHaveBeenCalledWith(
      'mart-1',
      'project-1',
      'actor-1',
      ['viewer'],
      false,
      false
    );
    expect(module.get(GetDataMartService).run).not.toHaveBeenCalled();
  });

  it('propagates a sharing access denial', async () => {
    jest
      .mocked(module.get(UpdateAvailabilityService).updateDataMartSharing)
      .mockRejectedValue(new ForbiddenException());
    await expect(
      facade.updateDataMartAvailability(ctx, {
        ...target,
        availableForReporting: true,
        availableForMaintenance: true,
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it('verifies the Data Mart in the caller project before changing contexts, with no followup read', async () => {
    const read = jest.mocked(module.get(GetDataMartService).run);
    const update = jest.mocked(module.get(ContextAccessService).updateDataMartContexts);
    await expect(
      facade.updateDataMartContexts(ctx, { ...target, contextIds: ['context-1'] })
    ).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart-1',
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['editor'],
      })
    );
    expect(update).toHaveBeenCalledWith('mart-1', 'project-1', ['context-1'], 'actor-1', [
      'editor',
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  });

  it('never changes contexts when the target belongs to a different project', async () => {
    jest.mocked(module.get(GetDataMartService).run).mockRejectedValue(new NotFoundException());
    await expect(facade.updateDataMartContexts(ctx, { ...target, contextIds: [] })).rejects.toThrow(
      NotFoundException
    );
    expect(module.get(ContextAccessService).updateDataMartContexts).not.toHaveBeenCalled();
  });

  it('deletes with the caller authorization and without rereading', async () => {
    await expect(facade.deleteDataMart(ctx, target)).resolves.toBeUndefined();
    expect(module.get(DeleteDataMartService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart-1',
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['editor'],
        disableLegacySync: false,
      })
    );
    expect(module.get(GetDataMartService).run).not.toHaveBeenCalled();
  });

  it('runs definition validation with the actor and emits the public result fields', async () => {
    jest.mocked(module.get(ValidateDataMartDefinitionService).run).mockResolvedValue({
      valid: false,
      errorMessage: 'Invalid table',
      details: { table: 'orders' },
      reason: { missing: true },
    });
    await expect(facade.validateDataMartDefinition(ctx, target)).resolves.toEqual({
      valid: false,
      errorMessage: 'Invalid table',
      details: { table: 'orders' },
      reason: { missing: true },
    });
    expect(module.get(ValidateDataMartDefinitionService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mart-1',
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['editor'],
      })
    );
  });

  it('forwards unsaved calculated siblings and preserves formula errors and warnings', async () => {
    const result = {
      errors: [{ code: 'invalid', message: 'Unknown field', field: 'ratio', subject: 'cost' }],
      warnings: [],
      otherFieldErrors: [{ code: 'invalid', message: 'Invalid sibling', field: 'total' }],
    };
    const calculatedFields = [{ name: 'cost', type: 'FLOAT', formula: '1' }];
    jest.mocked(module.get(ValidateFormulaService).run).mockResolvedValue(result);
    await expect(
      facade.validateDataMartFormula(ctx, {
        ...target,
        name: 'ratio',
        type: 'FLOAT',
        formula: '{{revenue}} / {{cost}}',
        calculatedFields,
      })
    ).resolves.toEqual(result);
    expect(module.get(ValidateFormulaService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMartId: 'mart-1',
        projectId: 'project-1',
        userId: 'actor-1',
        roles: ['editor'],
        name: 'ratio',
        type: 'FLOAT',
        formula: '{{revenue}} / {{cost}}',
        calculatedFields,
      })
    );
  });

  it('filters visible storages through USE access and returns no config or credentials', async () => {
    const storages = [
      {
        id: 'usable',
        title: 'Warehouse',
        type: DataStorageType.GOOGLE_BIGQUERY,
        config: { privateKey: 'secret' },
      },
      { id: 'discoverable', title: 'Restricted warehouse', type: DataStorageType.GOOGLE_BIGQUERY },
      { id: 'unknown', title: 'Unknown permissions', type: DataStorageType.GOOGLE_BIGQUERY },
    ] as DataStorageDto[];
    jest.mocked(module.get(ListDataStoragesService).run).mockResolvedValue(storages);
    jest.mocked(module.get(AccessDecisionService).canAccessMany).mockResolvedValue(
      new Map([
        ['usable', true],
        ['discoverable', false],
      ])
    );
    await expect(facade.listDataStorages({ ...ctx, roles: ['viewer'] })).resolves.toEqual([
      { id: 'usable', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' },
    ]);
    expect(module.get(ListDataStoragesService).run).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', userId: 'actor-1', roles: ['viewer'] })
    );
    expect(module.get(AccessDecisionService).canAccessMany).toHaveBeenCalledWith(
      'actor-1',
      ['viewer'],
      EntityType.STORAGE,
      ['usable', 'discoverable', 'unknown'],
      Action.USE,
      'project-1'
    );
  });

  it('maps namespaces without leaking unlisted domain fields', async () => {
    jest.mocked(module.get(ListStorageResourcesService).run).mockResolvedValue({
      namespaces: [{ id: 'project', label: 'Warehouse project', secret: 'hidden' }],
    } as never);
    await expect(
      facade.listStorageResources(
        { ...ctx, roles: ['viewer'] },
        { storageId: 'storage-1', level: 'namespaces' }
      )
    ).resolves.toEqual({ namespaces: [{ id: 'project', label: 'Warehouse project' }] });
    expect(module.get(ListStorageResourcesService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: 'storage-1',
        projectIdContext: 'project-1',
        userId: 'actor-1',
        roles: ['viewer'],
        level: 'namespaces',
      })
    );
  });

  it('forwards resource filters and only publishes declared resource fields', async () => {
    jest.mocked(module.get(ListStorageResourcesService).run).mockResolvedValue({
      resources: [
        {
          id: 'orders',
          groupId: 'dataset',
          type: 'TABLE',
          fullyQualifiedName: 'project.dataset.orders',
          location: 'EU',
          locationMismatch: true,
          config: { secret: 'hidden' },
        },
      ],
    } as never);
    await expect(
      facade.listStorageResources(ctx, {
        storageId: 'storage-1',
        level: 'resources',
        namespaceId: 'project',
        resourceType: 'TABLE_PATTERN',
      })
    ).resolves.toEqual({
      resources: [
        {
          id: 'orders',
          groupId: 'dataset',
          type: 'TABLE',
          fullyQualifiedName: 'project.dataset.orders',
          location: 'EU',
          locationMismatch: true,
        },
      ],
    });
    expect(module.get(ListStorageResourcesService).run).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: 'storage-1',
        projectIdContext: 'project-1',
        userId: 'actor-1',
        roles: ['editor'],
        level: 'resources',
        namespaceId: 'project',
        resourceType: 'TABLE_PATTERN',
      })
    );
  });

  it('does not return resources when the use case denies storage access', async () => {
    jest
      .mocked(module.get(ListStorageResourcesService).run)
      .mockRejectedValue(new ForbiddenException());
    await expect(
      facade.listStorageResources(ctx, { storageId: 'storage-1', level: 'namespaces' })
    ).rejects.toThrow(ForbiddenException);
  });
});
