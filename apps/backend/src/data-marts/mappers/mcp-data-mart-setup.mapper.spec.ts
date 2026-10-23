import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import type { DataMartDto } from '../dto/domain/data-mart.dto';
import type { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { McpDataMartSetupMapper } from './mcp-data-mart-setup.mapper';

describe('McpDataMartSetupMapper', () => {
  const connectorDefinition = {
    connector: {
      source: {
        name: 'test',
        configuration: [{ token: 'raw-secret' }],
        node: 'items',
        fields: ['id'],
      },
      storage: { fullyQualifiedName: 'project.dataset.table' },
    },
  };
  const masked = {
    connector: {
      ...connectorDefinition.connector,
      source: { ...connectorDefinition.connector.source, configuration: [{ token: '***' }] },
    },
  };
  const dto = {
    id: 'mart-1',
    projectId: 'project-1',
    title: 'Draft',
    status: 'DRAFT',
    storage: {
      id: 'storage-1',
      title: 'Warehouse',
      type: 'GOOGLE_BIGQUERY',
      config: { privateKey: 'storage-secret' },
      credentialId: 'credential-1',
    },
    definitionType: DataMartDefinitionType.CONNECTOR,
    definition: connectorDefinition,
    connectorState: { secret: 'state-secret' },
    createdAt: new Date('2026-10-21T00:00:00Z'),
    modifiedAt: new Date('2026-10-21T01:00:00Z'),
    businessOwnerUsers: [{ userId: 'business-1' }],
    technicalOwnerUsers: [{ userId: 'tech-1' }],
    availableForReporting: true,
    availableForMaintenance: false,
    contexts: [],
    icon: null,
  } as unknown as DataMartDto;

  it('masks connector secrets and only returns storage identity and configuration DTO fields', async () => {
    const secrets = { mask: jest.fn().mockResolvedValue(masked) };
    const mapper = new McpDataMartSetupMapper(secrets as unknown as ConnectorSecretService);
    const result = await mapper.toConfiguration(dto);
    expect(result).toMatchObject({
      id: 'mart-1',
      status: 'DRAFT',
      definition: masked,
      storage: { id: 'storage-1', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' },
      description: null,
      schema: null,
      businessOwnerIds: ['business-1'],
      technicalOwnerIds: ['tech-1'],
      createdAt: '2026-10-21T00:00:00.000Z',
    });
    expect(secrets.mask).toHaveBeenCalledWith('project-1', connectorDefinition);
    expect(JSON.stringify(result)).not.toMatch(
      /raw-secret|storage-secret|state-secret|credential-1/
    );
  });

  it('fails closed if connector masking fails', async () => {
    const mapper = new McpDataMartSetupMapper({
      mask: jest.fn().mockRejectedValue(new Error('Unavailable')),
    } as unknown as ConnectorSecretService);
    await expect(mapper.toConfiguration(dto)).rejects.toThrow('Unavailable');
  });
});
