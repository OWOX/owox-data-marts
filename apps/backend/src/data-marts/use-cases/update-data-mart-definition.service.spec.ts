jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UpdateDataMartDefinitionService } from './update-data-mart-definition.service';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

describe('UpdateDataMartDefinitionService', () => {
  const createService = (
    overrides: {
      definitionType?: DataMartDefinitionType;
      definition?: unknown;
      storageType?: DataStorageType;
    } = {}
  ) => {
    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
      createdById: 'user-1',
      storage: {
        id: 'storage-1',
        type: overrides.storageType ?? DataStorageType.GOOGLE_BIGQUERY,
      },
      definitionType: overrides.definitionType as DataMartDefinitionType | undefined,
      definition: overrides.definition as any,
    };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      save: jest.fn().mockResolvedValue(dataMart),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }),
    };
    const connectorSecretService = {
      mergeDefinitionSecretsFromSource: jest.fn(),
      mergeDefinitionSecrets: jest.fn(),
      extractAndSaveSecrets: jest.fn(),
      deleteOrphanedSecrets: jest.fn(),
    };
    const legacyDataMartsService = {
      updateQuery: jest.fn(),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const eventDispatcher = {
      publishExternal: jest.fn(),
    };
    const connectorService = {
      getConnectorCapabilities: jest.fn().mockReturnValue({
        singleConfiguration: false,
        copySecretsByValue: false,
      }),
    };
    const definitionValidatorFacade = {
      checkIsValid: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UpdateDataMartDefinitionService(
      dataMartService as any,
      mapper as any,
      connectorSecretService as any,
      legacyDataMartsService as any,
      accessDecisionService as any,
      definitionValidatorFacade as any,
      eventDispatcher as any,
      connectorService as any
    );

    return {
      service,
      dataMartService,
      accessDecisionService,
      connectorSecretService,
      definitionValidatorFacade,
      eventDispatcher,
      connectorService,
      dataMart,
    };
  };

  const commandFor = (
    definitionType: DataMartDefinitionType,
    definition: unknown
  ): UpdateDataMartDefinitionCommand =>
    new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      definitionType,
      definition as never,
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    DataMartDefinitionType.TABLE,
    DataMartDefinitionType.VIEW,
    DataMartDefinitionType.TABLE_PATTERN,
  ])(
    'should succeed when saving a %s definition type without performing storage validation',
    async definitionType => {
      const { service, dataMartService, dataMart } = createService();
      const definition = {
        tableName: 'my_table',
      };
      const command = new UpdateDataMartDefinitionCommand(
        'dm-1',
        'proj-1',
        definitionType,
        definition,
        undefined,
        undefined,
        'user-1',
        ['editor']
      );

      const result = await service.run(command);

      expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'proj-1');
      expect(dataMart.definitionType).toBe(definitionType);
      expect(dataMart.definition).toBe(definition);
      expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
      expect(result).toEqual({ id: 'dm-1' });
    }
  );

  it('cleans up orphaned secrets against the definition that was actually saved', async () => {
    const { service, dataMartService, connectorSecretService, dataMart } = createService();

    const previousDefinition = {
      connector: {
        source: { name: 'FacebookMarketing', configuration: [{ _id: 'c-1', _secrets_id: 'old' }] },
      },
    };
    dataMart.definitionType = DataMartDefinitionType.CONNECTOR;
    dataMart.definition = previousDefinition;

    const sourceDataMart = {
      id: 'dm-source',
      projectId: 'proj-1',
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: {
            name: 'FacebookMarketing',
            configuration: [{ _id: 'src-1', _secrets_id: 'source-secrets' }],
          },
        },
      },
    };
    dataMartService.getByIdAndProjectId.mockImplementation(async (id: string) =>
      id === 'dm-source' ? sourceDataMart : dataMart
    );

    const mergedFromSource = { merged: 'from-source' };
    const mergedWithPrevious = { merged: 'with-previous' };
    // What extractAndSaveSecrets returns is what gets stored, so it is also
    // what cleanup must be compared against.
    const savedDefinition = {
      connector: {
        source: { name: 'FacebookMarketing', configuration: [{ _id: 'c-2', _secrets_id: 'new' }] },
      },
    };
    connectorSecretService.mergeDefinitionSecretsFromSource.mockResolvedValue(mergedFromSource);
    connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(mergedWithPrevious);
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue(savedDefinition);

    const incomingDefinition = {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: [{ _copiedFrom: { configId: 'src-1' } }],
        },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      incomingDefinition as any,
      'dm-source',
      undefined,
      'user-1',
      ['editor']
    );

    await service.run(command);

    expect(connectorSecretService.mergeDefinitionSecretsFromSource).toHaveBeenCalledWith(
      incomingDefinition,
      sourceDataMart.definition
    );
    expect(connectorSecretService.mergeDefinitionSecrets).toHaveBeenCalledWith(
      mergedFromSource,
      previousDefinition
    );
    expect(connectorSecretService.deleteOrphanedSecrets).toHaveBeenCalledWith(
      'dm-1',
      savedDefinition,
      previousDefinition
    );
    expect(dataMart.definition).toBe(savedDefinition);
  });

  it('should throw ForbiddenException when user has no edit access to data mart', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccess.mockResolvedValue(false);

    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.TABLE,
      { tableName: 'my_table' },
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('rejects multiple configurations when the connector requires exactly one', async () => {
    const { service, dataMartService, connectorService } = createService();
    connectorService.getConnectorCapabilities.mockReturnValue({
      singleConfiguration: true,
      copySecretsByValue: false,
    });
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      {
        connector: {
          source: {
            name: 'SingleConfigurationConnector',
            node: 'sheet',
            fields: ['name'],
            configuration: [{ _id: 'config-1' }, { _id: 'config-2' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(BadRequestException);
    expect(dataMartService.save).not.toHaveBeenCalled();
  });

  it('keeps multiple configurations available when the connector allows them', async () => {
    const { service, dataMartService, dataMart } = createService();
    const definition = {
      connector: {
        source: {
          name: 'GoogleAds',
          node: 'campaigns',
          fields: ['id'],
          configuration: [{ _id: 'config-1' }, { _id: 'config-2' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      definition,
      undefined,
      undefined,
      'user-1',
      ['editor']
    );
    const connectorSecretService = service['connectorSecretService'] as any;
    connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(definition);
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue(definition);

    await service.run(command);

    expect(dataMart.definition).toBe(definition);
    expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
  });

  it('requires edit access when connector secrets are copied by value', async () => {
    const { service, accessDecisionService, connectorSecretService, connectorService } =
      createService();
    connectorService.getConnectorCapabilities.mockReturnValue({
      singleConfiguration: false,
      copySecretsByValue: true,
    });
    accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const definition = {
      connector: {
        source: {
          name: 'CopyByValueConnector',
          node: 'sheet',
          fields: ['name'],
          configuration: [{ _id: 'config-1' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      definition,
      'source-dm-1',
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(
      'You do not have permission to copy connector credentials from the source DataMart'
    );
    expect(accessDecisionService.canAccess).toHaveBeenNthCalledWith(
      2,
      'user-1',
      ['editor'],
      'DATA_MART',
      'source-dm-1',
      'EDIT',
      'proj-1'
    );
    expect(connectorSecretService.mergeDefinitionSecretsFromSource).not.toHaveBeenCalled();
  });

  it('requires edit access on the copy source for every connector', async () => {
    const { service, accessDecisionService, connectorSecretService } = createService();
    accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const definition = {
      connector: {
        source: {
          name: 'src',
          node: 'n',
          fields: ['f'],
          configuration: [{ _id: 'config-1' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      definition,
      'source-dm-1',
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(
      'You do not have permission to copy connector credentials from the source DataMart'
    );
    expect(accessDecisionService.canAccess).toHaveBeenNthCalledWith(
      2,
      'user-1',
      ['editor'],
      'DATA_MART',
      'source-dm-1',
      'EDIT',
      'proj-1'
    );
    expect(connectorSecretService.mergeDefinitionSecretsFromSource).not.toHaveBeenCalled();
  });

  it('rejects an unowned secret reference for connectors that copy secrets by value', async () => {
    const { service, dataMart, connectorSecretService, connectorService } = createService();
    connectorService.getConnectorCapabilities.mockReturnValue({
      singleConfiguration: false,
      copySecretsByValue: true,
    });
    const definition = {
      connector: {
        source: {
          name: 'CopyByValueConnector',
          node: 'sheet',
          fields: ['name'],
          configuration: [{ _id: 'config-1', _secrets_id: 'foreign-secret' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      definition,
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(
      'The selected connector credentials cannot be used for this DataMart'
    );
    expect(connectorSecretService.mergeDefinitionSecrets).not.toHaveBeenCalled();
    expect(connectorSecretService.extractAndSaveSecrets).not.toHaveBeenCalled();

    dataMart.definition = definition;
    connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(definition);
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue(definition);

    await expect(service.run(command)).resolves.toEqual({ id: 'dm-1' });
  });

  it('rejects an unowned secret reference for every connector, not only copy-by-value ones', async () => {
    const { service, dataMart, connectorSecretService } = createService();
    const definition = {
      connector: {
        source: {
          name: 'src',
          node: 'n',
          fields: ['f'],
          configuration: [{ _id: 'config-1', _secrets_id: 'foreign-secret' }],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      definition,
      undefined,
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(
      'The selected connector credentials cannot be used for this DataMart'
    );
    expect(connectorSecretService.extractAndSaveSecrets).not.toHaveBeenCalled();

    // The self-heal of aliased Data Marts stays open: the same pointer is
    // accepted when it comes from the Data Mart's own stored definition.
    dataMart.definition = definition;
    connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(definition);
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue(definition);

    await expect(service.run(command)).resolves.toEqual({ id: 'dm-1' });
  });

  it('allows a secret reference from an authorized copy source', async () => {
    const { service, dataMartService, connectorSecretService, connectorService, dataMart } =
      createService();
    connectorService.getConnectorCapabilities.mockReturnValue({
      singleConfiguration: false,
      copySecretsByValue: true,
    });
    const definition = {
      connector: {
        source: {
          name: 'CopyByValueConnector',
          node: 'sheet',
          fields: ['name'],
          configuration: [
            {
              _secrets_id: 'source-secret',
              _copiedFrom: { configId: 'source-config' },
            },
          ],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const sourceDefinition = {
      connector: {
        source: {
          name: 'CopyByValueConnector',
          node: 'sheet',
          fields: ['name'],
          configuration: [{ _id: 'source-config', _secrets_id: 'source-secret' }],
        },
        storage: { fullyQualifiedName: 'dataset.source_table' },
      },
    };
    dataMartService.getByIdAndProjectId.mockResolvedValueOnce(dataMart).mockResolvedValueOnce({
      id: 'source-dm-1',
      projectId: 'proj-1',
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: sourceDefinition,
    });
    connectorSecretService.mergeDefinitionSecretsFromSource.mockResolvedValue(definition);
    connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(definition);
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue(definition);
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      definition,
      'source-dm-1',
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).resolves.toEqual({ id: 'dm-1' });
    expect(connectorSecretService.mergeDefinitionSecretsFromSource).toHaveBeenCalledWith(
      definition,
      sourceDefinition
    );
  });

  describe('changing the input source type of an existing data mart', () => {
    const STATIC_TYPES = [
      DataMartDefinitionType.SQL,
      DataMartDefinitionType.TABLE,
      DataMartDefinitionType.VIEW,
      DataMartDefinitionType.TABLE_PATTERN,
    ];

    const transitions = STATIC_TYPES.flatMap(from =>
      STATIC_TYPES.filter(to => to !== from).map(to => [from, to] as const)
    );

    it.each(transitions)(
      'allows %s -> %s and persists both type and definition',
      async (from, to) => {
        const { service, dataMartService, dataMart } = createService({
          definitionType: from,
          definition: { fullyQualifiedName: 'project.dataset.old' },
        });
        const definition = { fullyQualifiedName: 'project.dataset.new' };

        await service.run(commandFor(to, definition));

        expect(dataMart.definitionType).toBe(to);
        expect(dataMart.definition).toBe(definition);
        expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
      }
    );

    it.each(STATIC_TYPES)('rejects switching a connector data mart to %s', async to => {
      const { service, dataMartService } = createService({
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: { connector: { source: {}, storage: {} } },
      });

      await expect(service.run(commandFor(to, { fullyQualifiedName: 'a.b.c' }))).rejects.toThrow(
        /cannot be changed to or from a connector/
      );
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it.each(STATIC_TYPES)('rejects switching a %s data mart to a connector', async from => {
      const { service, dataMartService } = createService({
        definitionType: from,
        definition: { fullyQualifiedName: 'a.b.c' },
      });

      const definition = {
        connector: {
          source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
          storage: { fullyQualifiedName: 'a.b.c' },
        },
      };

      await expect(
        service.run(commandFor(DataMartDefinitionType.CONNECTOR, definition))
      ).rejects.toThrow(/cannot be changed to or from a connector/);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('keeps a same-type connector update working, including the secrets flow', async () => {
      const existingDefinition = {
        connector: {
          source: { name: 'src', configuration: [{ _id: 'cfg-1' }], node: 'n', fields: ['f'] },
          storage: { fullyQualifiedName: 'a.b.c' },
        },
      };
      const { service, dataMartService, connectorSecretService, dataMart } = createService({
        definitionType: DataMartDefinitionType.CONNECTOR,
        definition: existingDefinition,
      });

      const nextDefinition = {
        connector: {
          source: { name: 'src', configuration: [{ _id: 'cfg-2' }], node: 'n', fields: ['f'] },
          storage: { fullyQualifiedName: 'a.b.c' },
        },
      };
      connectorSecretService.mergeDefinitionSecrets.mockResolvedValue(nextDefinition);
      connectorSecretService.extractAndSaveSecrets.mockResolvedValue(nextDefinition);

      await service.run(commandFor(DataMartDefinitionType.CONNECTOR, nextDefinition));

      expect(connectorSecretService.mergeDefinitionSecrets).toHaveBeenCalledWith(
        nextDefinition,
        existingDefinition
      );
      expect(connectorSecretService.extractAndSaveSecrets).toHaveBeenCalled();
      expect(connectorSecretService.deleteOrphanedSecrets).toHaveBeenCalledWith(
        'dm-1',
        nextDefinition,
        existingDefinition
      );
      expect(dataMart.definitionType).toBe(DataMartDefinitionType.CONNECTOR);
      expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
    });

    it('rejects a non-SQL type on a legacy BigQuery storage', async () => {
      const { service, dataMartService } = createService({
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'select 1' },
        storageType: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      });

      await expect(
        service.run(commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'a.b.c' }))
      ).rejects.toThrow(/Only SQL definition type is supported/);
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('publishes a definition type changed event only when the type actually changes', async () => {
      const { service, eventDispatcher } = createService({
        definitionType: DataMartDefinitionType.VIEW,
        definition: { fullyQualifiedName: 'project.dataset.view' },
      });

      await service.run(
        commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'project.dataset.table' })
      );

      const events = eventDispatcher.publishExternal.mock.calls.map(([event]) => event.name);
      expect(events).toContain('data-mart.definition-type.changed');
      expect(events).not.toContain('data-mart.definition-type.set');
    });

    it('refuses a new definition the storage cannot resolve, leaving the data mart untouched', async () => {
      const { service, dataMartService, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.VIEW,
        definition: { fullyQualifiedName: 'project.dataset.view' },
      });
      definitionValidatorFacade.checkIsValid.mockRejectedValue(
        new BusinessViolationException('Table not found: project.dataset.missing')
      );

      await expect(
        service.run(
          commandFor(DataMartDefinitionType.TABLE, {
            fullyQualifiedName: 'project.dataset.missing',
          })
        )
      ).rejects.toThrow(/Table not found/);

      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('refuses an invalid SQL target, persisting neither the type nor the definition', async () => {
      // The editor dry run is advisory and API callers skip it entirely, so the server has to be
      // the one that stops an invalid query from replacing a working table definition.
      const existingDefinition = { fullyQualifiedName: 'project.dataset.orders' };
      const { service, dataMartService, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: existingDefinition,
      });
      definitionValidatorFacade.checkIsValid.mockRejectedValue(
        new BusinessViolationException('Syntax error near FROM')
      );

      await expect(
        service.run(commandFor(DataMartDefinitionType.SQL, { sqlQuery: 'select from' }))
      ).rejects.toThrow(/Syntax error/);

      expect(definitionValidatorFacade.checkIsValid).toHaveBeenCalled();
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('validates a SQL target before persisting it', async () => {
      const { service, dataMartService, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName: 'project.dataset.orders' },
      });

      await service.run(commandFor(DataMartDefinitionType.SQL, { sqlQuery: 'select 1' }));

      expect(definitionValidatorFacade.checkIsValid).toHaveBeenCalled();
      expect(dataMartService.save).toHaveBeenCalled();
    });

    it('does not re-validate a same-type edit', async () => {
      const { service, definitionValidatorFacade } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName: 'project.dataset.a' },
      });

      await service.run(
        commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'project.dataset.b' })
      );

      expect(definitionValidatorFacade.checkIsValid).not.toHaveBeenCalled();
    });

    it('does not publish a definition type changed event on a same-type edit', async () => {
      const { service, eventDispatcher } = createService({
        definitionType: DataMartDefinitionType.TABLE,
        definition: { fullyQualifiedName: 'project.dataset.a' },
      });

      await service.run(
        commandFor(DataMartDefinitionType.TABLE, { fullyQualifiedName: 'project.dataset.b' })
      );

      const events = eventDispatcher.publishExternal.mock.calls.map(([event]) => event.name);
      expect(events).not.toContain('data-mart.definition-type.changed');
    });
  });
});
