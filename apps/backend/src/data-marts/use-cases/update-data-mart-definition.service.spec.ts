jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UpdateDataMartDefinitionService } from './update-data-mart-definition.service';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

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

    return {
      service,
      dataMartService,
      connectorSecretService,
      accessDecisionService,
      dataMart,
    };
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

  it('rejects multiple GoogleSheets source configurations before processing secrets', async () => {
    const { service, dataMartService } = createService();
    const command = new UpdateDataMartDefinitionCommand(
      'dm-1',
      'proj-1',
      DataMartDefinitionType.CONNECTOR,
      {
        connector: {
          source: {
            name: 'GoogleSheets',
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

  it('keeps multiple configurations available for connectors other than GoogleSheets', async () => {
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

  it('requires edit access to copy Google Sheets credentials from another Data Mart', async () => {
    const { service, accessDecisionService, connectorSecretService } = createService();
    accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const definition = {
      connector: {
        source: {
          name: 'GoogleSheets',
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
      'You do not have permission to copy Google Sheets credentials from the source DataMart'
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
});
