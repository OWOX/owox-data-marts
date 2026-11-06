import { McpDataMartManagementMapper } from './mcp-data-mart-management.mapper';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataStorageDto } from '../dto/domain/data-storage.dto';
import { SourceCredentialBindingService } from '../connector-types/source-credential-binding.service';
import { McpConnectorConfigurationService } from '../services/connector/mcp-connector-configuration.service';
import { ConnectorService } from '../services/connector/connector.service';

describe('McpDataMartManagementMapper', () => {
  const bindings = { boundCredentialIds: jest.fn() };
  const configuration = { toPublicConfigurations: jest.fn() };
  const mapper = new McpDataMartManagementMapper(
    bindings as unknown as SourceCredentialBindingService,
    configuration as unknown as McpConnectorConfigurationService
  );
  const mart = () =>
    new DataMartDto(
      'mart',
      'project',
      'Orders',
      DataMartStatus.DRAFT,
      {
        id: 'storage',
        title: 'Warehouse',
        type: 'GOOGLE_BIGQUERY',
        credentials: { secret: 'never expose' },
      } as unknown as DataStorageDto,
      new Date('2026-11-05T10:00:00Z'),
      new Date('2026-11-05T10:00:00Z'),
      DataMartDefinitionType.SQL,
      { sqlQuery: 'SELECT 1' }
    );

  it('does not expose storage credentials or unknown definition properties', async () => {
    const dto = { ...mart(), definition: { sqlQuery: 'SELECT 1', internal: 'private' } };
    const result = await mapper.toSetup(dto);
    expect(result.storage).toEqual({ id: 'storage', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' });
    expect(result.definition).toEqual({ sqlQuery: 'SELECT 1' });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('never expose');
  });

  it('adds the current Credential reference before sanitizing connector settings', async () => {
    bindings.boundCredentialIds.mockResolvedValue(new Map([['config', 'credential']]));
    configuration.toPublicConfigurations.mockResolvedValue([
      {
        _id: 'config',
        _credential_id: 'credential',
        Region: 'eu',
      },
    ]);
    const dto = {
      ...mart(),
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: {
            name: 'Custom',
            version: 2,
            configuration: [{ _id: 'config', Token: 'secret' }],
            node: 'orders',
            fields: ['id'],
          },
          storage: { fullyQualifiedName: 'p.d.t' },
        },
      },
    };
    const result = await mapper.toSetup(dto);
    expect(configuration.toPublicConfigurations).toHaveBeenCalledWith(
      'project',
      'Custom',
      [{ _id: 'config', Token: 'secret', _credential_id: 'credential' }],
      2
    );
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).toContain('credential');
  });

  it('keeps setup metadata but omits the entire definition when any configuration is unreadable', async () => {
    bindings.boundCredentialIds.mockResolvedValue(new Map());
    configuration.toPublicConfigurations.mockResolvedValueOnce(null);
    const dto = {
      ...mart(),
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: {
            name: 'Unavailable',
            configuration: [{ _id: 'readable' }, { _id: 'unreadable', Token: 'secret' }],
            node: 'orders',
            fields: ['id'],
          },
          storage: { fullyQualifiedName: 'p.d.t' },
        },
      },
    };

    const result = await mapper.toSetup(dto);

    expect(result).toMatchObject({ id: 'mart', title: 'Orders', definition: null });
    expect(result.definitionReadError).toContain('could not be read safely');
    expect(result.storage.id).toBe('storage');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('resolves metadata once per setup while sanitizing every configuration', async () => {
    const connectors = {
      resolveConnectorSpecification: jest.fn().mockResolvedValue([
        { name: 'Region', requiredType: 'string' },
        { name: 'Token', attributes: ['SECRET'] },
      ]),
      resolveSourceKeys: jest.fn().mockResolvedValue({
        fields: [{ path: [], parameters: ['Account'] }],
        model: null,
      }),
    };
    const realMapper = new McpDataMartManagementMapper(
      bindings as unknown as SourceCredentialBindingService,
      new McpConnectorConfigurationService(connectors as unknown as ConnectorService)
    );
    bindings.boundCredentialIds.mockResolvedValue(new Map([['0', 'credential']]));
    const dto = {
      ...mart(),
      definitionType: DataMartDefinitionType.CONNECTOR,
      definition: {
        connector: {
          source: {
            name: 'Custom',
            node: 'orders',
            fields: ['id'],
            configuration: Array.from({ length: 100 }, (_, index) => ({
              _id: String(index),
              Region: 'eu',
              Token: 'private-token',
              Account: 'private-account',
              _secrets_id: 'legacy',
            })),
          },
          storage: { fullyQualifiedName: 'p.d.t' },
        },
      },
    };

    const result = await realMapper.toSetup(dto);

    expect(result.definition).toEqual({
      connector: {
        source: {
          name: 'Custom',
          node: 'orders',
          fields: ['id'],
          configuration: [
            { _id: '0', _credential_id: 'credential', Region: 'eu' },
            ...Array.from({ length: 99 }, (_, index) => ({ _id: String(index + 1), Region: 'eu' })),
          ],
        },
        storage: { fullyQualifiedName: 'p.d.t' },
      },
    });
    expect(connectors.resolveConnectorSpecification).toHaveBeenCalledTimes(1);
    expect(connectors.resolveSourceKeys).toHaveBeenCalledTimes(1);

    connectors.resolveConnectorSpecification.mockResolvedValue([
      { name: 'Region', attributes: ['SECRET'] },
      { name: 'Token', attributes: ['SECRET'] },
    ]);
    const nextRead = await realMapper.toSetup(dto);
    expect(nextRead.definition).not.toBeNull();
    expect(JSON.stringify(nextRead.definition)).not.toContain('Region');
    expect(connectors.resolveConnectorSpecification).toHaveBeenCalledTimes(2);
    expect(connectors.resolveSourceKeys).toHaveBeenCalledTimes(2);
  });
});
