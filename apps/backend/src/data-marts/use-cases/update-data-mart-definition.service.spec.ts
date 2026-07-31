jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException } from '@nestjs/common';
import { UpdateDataMartDefinitionService } from './update-data-mart-definition.service';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { EntityType, Action } from '../services/access-decision';

describe('UpdateDataMartDefinitionService', () => {
  const createService = () => {
    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
      storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
      definitionType: undefined as DataMartDefinitionType | undefined,
      definition: undefined as any,
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

    const service = new UpdateDataMartDefinitionService(
      dataMartService as any,
      mapper as any,
      connectorSecretService as any,
      legacyDataMartsService as any,
      accessDecisionService as any,
      eventDispatcher as any
    );

    return { service, dataMartService, accessDecisionService, connectorSecretService, dataMart };
  };

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
      'user-1',
      ['editor']
    );

    await service.run(command);

    expect(connectorSecretService.mergeDefinitionSecretsFromSource).toHaveBeenCalledWith(
      incomingDefinition,
      new Map([['dm-source', sourceDataMart.definition]]),
      'dm-source'
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

  it('copies configurations from several Data Marts in one save', async () => {
    const { service, dataMartService, accessDecisionService, connectorSecretService, dataMart } =
      createService();

    dataMart.definitionType = DataMartDefinitionType.CONNECTOR;

    const makeSource = (id: string, configId: string) => ({
      id,
      projectId: 'proj-1',
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: { name: 'FacebookMarketing', configuration: [{ _id: configId }] },
        },
      },
    });
    const sourceA = makeSource('dm-a', 'a-1');
    const sourceB = makeSource('dm-b', 'b-1');
    dataMartService.getByIdAndProjectId.mockImplementation(async (id: string) => {
      if (id === 'dm-a') return sourceA;
      if (id === 'dm-b') return sourceB;
      return dataMart;
    });
    connectorSecretService.extractAndSaveSecrets.mockResolvedValue({
      connector: { source: { name: 'FacebookMarketing', configuration: [] } },
    });

    const incomingDefinition = {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: [
            { _copiedFrom: { dataMartId: 'dm-a', configId: 'a-1' } },
            { _copiedFrom: { dataMartId: 'dm-b', configId: 'b-1' } },
          ],
        },
      },
    };
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      incomingDefinition as any,
      // The client still sends the first source only; the per-item metadata is
      // what actually resolves each copy.
      'dm-a',
      'user-1',
      ['editor']
    );

    await service.run(command);

    // Both sources are authorized, and both definitions reach the merge.
    for (const sourceDataMartId of ['dm-a', 'dm-b']) {
      expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
        'user-1',
        ['editor'],
        EntityType.DATA_MART,
        sourceDataMartId,
        Action.COPY_CREDENTIALS,
        'proj-1'
      );
    }
    expect(connectorSecretService.mergeDefinitionSecretsFromSource).toHaveBeenCalledWith(
      incomingDefinition,
      new Map([
        ['dm-a', sourceA.definition],
        ['dm-b', sourceB.definition],
      ]),
      'dm-a'
    );
    expect(dataMartService.save).toHaveBeenCalled();
  });

  it('refuses the whole save when one of several copy sources is not permitted', async () => {
    const { service, connectorSecretService, accessDecisionService, dataMart } = createService();

    dataMart.definitionType = DataMartDefinitionType.CONNECTOR;
    accessDecisionService.canAccess.mockImplementation(
      async (...args: unknown[]) => args[4] !== Action.COPY_CREDENTIALS || args[3] !== 'dm-b'
    );

    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      {
        connector: {
          source: {
            name: 'FacebookMarketing',
            configuration: [
              { _copiedFrom: { dataMartId: 'dm-a', configId: 'a-1' } },
              { _copiedFrom: { dataMartId: 'dm-b', configId: 'b-1' } },
            ],
          },
        },
      } as any,
      undefined,
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
    expect(connectorSecretService.mergeDefinitionSecretsFromSource).not.toHaveBeenCalled();
  });

  it('refuses to copy a configuration from a Data Mart the user cannot copy credentials from', async () => {
    const { service, dataMartService, accessDecisionService, connectorSecretService, dataMart } =
      createService();

    dataMart.definitionType = DataMartDefinitionType.CONNECTOR;
    // EDIT on the target is granted, COPY_CREDENTIALS on the source is not.
    accessDecisionService.canAccess.mockImplementation(async (...args: unknown[]) =>
      args[4] !== Action.COPY_CREDENTIALS
    );

    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      {
        connector: {
          source: {
            name: 'FacebookMarketing',
            configuration: [{ _copiedFrom: { configId: 'src-1' } }],
          },
        },
      } as any,
      'dm-source',
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-source',
      Action.COPY_CREDENTIALS,
      'proj-1'
    );
    // The source is never read and no secrets are touched.
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalledWith('dm-source', 'proj-1');
    expect(connectorSecretService.mergeDefinitionSecretsFromSource).not.toHaveBeenCalled();
    expect(dataMartService.save).not.toHaveBeenCalled();
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
      'user-1',
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });
});
