jest.mock('snowflake-sdk', () => ({}));
jest.mock('@owox/connectors', () => ({ AvailableConnectors: [], Connectors: {}, Core: {} }));
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SetupDiscoveryService } from '../use-cases/setup-discovery.service';
import { McpSetupDiscoveryFacadeImpl } from './mcp-setup-discovery.facade.impl';
import { McpSetupDiscoveryMapper } from '../mappers/mcp-setup-discovery.mapper';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
describe('McpSetupDiscoveryFacadeImpl', () => {
  const storages = { getByProjectIdAndId: jest.fn(), listSetupMetadata: jest.fn() };
  const access = { canAccessStored: jest.fn() };
  const browser = { listNamespaces: jest.fn(), listLeafResources: jest.fn() };
  const connectors = {
    getAvailableConnectors: jest.fn(),
    resolveConnectorSpecification: jest.fn(),
    resolveConnectorCapabilities: jest.fn(),
  };
  const definitions = {
    listByProject: jest.fn(),
    listVersions: jest.fn(),
    getActiveVersionNumbersByDefId: jest.fn(),
    getActiveVersionNumberForDef: jest.fn(),
  };
  const origin = { getPublicOrigin: () => 'https://app.example' };
  const facade = new McpSetupDiscoveryFacadeImpl(
    new SetupDiscoveryService(
      storages as never,
      access as never,
      browser as never,
      connectors as never,
      definitions as never,
      origin as never,
      new McpSetupDiscoveryMapper()
    )
  );
  beforeEach(() => {
    jest.resetAllMocks();
    storages.getByProjectIdAndId.mockResolvedValue({
      id: 's',
      projectId: 'project',
      type: DataStorageType.GOOGLE_BIGQUERY,
      credentials: 'secret',
    });
    access.canAccessStored.mockResolvedValue(true);
    browser.listNamespaces.mockResolvedValue([{ id: 'warehouse', credentials: 'secret' }]);
    connectors.getAvailableConnectors.mockResolvedValue([{ name: 'BuiltIn', title: 'Built in' }]);
    definitions.listByProject.mockResolvedValue([]);
    definitions.getActiveVersionNumbersByDefId.mockResolvedValue(new Map());
  });
  it('checks project and USE authority before external discovery', async () => {
    access.canAccessStored.mockResolvedValue(false);
    await expect(
      facade.listStorageResources({ ...actor, storageId: 's', level: 'namespaces', limit: 10 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(browser.listNamespaces).not.toHaveBeenCalled();
    expect(storages.getByProjectIdAndId).toHaveBeenCalledWith('project', 's');
  });
  it('propagates stored-read failures without provider work', async () => {
    const error = new NotFoundException('missing');
    storages.getByProjectIdAndId.mockRejectedValue(error);
    await expect(
      facade.listStorageResources({ ...actor, storageId: 's', level: 'namespaces', limit: 10 })
    ).rejects.toBe(error);
    expect(browser.listNamespaces).not.toHaveBeenCalled();
  });
  it('reports unsupported provider action explicitly', async () => {
    storages.getByProjectIdAndId.mockResolvedValue({ id: 's', type: DataStorageType.SNOWFLAKE });
    await expect(
      facade.listStorageResources({ ...actor, storageId: 's', level: 'namespaces', limit: 10 })
    ).rejects.toThrow('Resource browsing is not supported');
    expect(browser.listNamespaces).not.toHaveBeenCalled();
  });
  it('sanitizes expired credentials and every external error', async () => {
    browser.listNamespaces.mockRejectedValue({ code: 401, message: 'TOKEN=secret' });
    await expect(
      facade.listStorageResources({ ...actor, storageId: 's', level: 'namespaces', limit: 10 })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    browser.listNamespaces.mockRejectedValue(new Error('TOKEN=secret'));
    await expect(
      facade.listStorageResources({ ...actor, storageId: 's', level: 'namespaces', limit: 10 })
    ).rejects.toThrow('Storage discovery failed');
  });
  it('bounds resources and projects explicit metadata only', async () => {
    browser.listNamespaces.mockResolvedValue([{ id: 'one', secret: 'secret' }, { id: 'two' }]);
    const result = await facade.listStorageResources({
      ...actor,
      storageId: 's',
      level: 'namespaces',
      limit: 1,
    });
    expect(result.items).toEqual([{ id: 'one' }]);
    expect(result.hasMore).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('never converts connector stored-read errors to empty success', async () => {
    definitions.listByProject.mockRejectedValue(new Error('database unavailable'));
    await expect(facade.listConnectors({ ...actor, storageId: 's', limit: 10 })).rejects.toThrow(
      'database unavailable'
    );
  });
  it.each([undefined, null, ''])('uses the app storage name fallback for title %s', async title => {
    storages.listSetupMetadata.mockResolvedValue([
      { id: 's', title, type: DataStorageType.GOOGLE_BIGQUERY, projectId: 'project' },
    ]);
    const result = await facade.listStorages({ ...actor, limit: 5 });
    expect(result.items).toEqual([expect.objectContaining({ id: 's', title: 'Google BigQuery' })]);
  });
  it('uses effective read-only SEE/USE/EDIT without returning storage configuration', async () => {
    storages.listSetupMetadata.mockResolvedValue([
      {
        id: 's',
        title: 'Warehouse',
        type: DataStorageType.GOOGLE_BIGQUERY,
        projectId: 'project',
        config: { token: 'secret' },
      },
      { id: 'hidden', title: 'Hidden', type: DataStorageType.SNOWFLAKE },
    ]);
    access.canAccessStored.mockImplementation((_user, _roles, _entity, id, action) =>
      Promise.resolve(id === 's' && action !== 'EDIT')
    );
    const result = await facade.listStorages({ ...actor, limit: 5 });
    expect(result.items).toEqual([
      {
        id: 's',
        title: 'Warehouse',
        type: DataStorageType.GOOGLE_BIGQUERY,
        availableForUse: true,
        availableForMaintenance: false,
        capabilities: {
          liveResourceBrowsing: true,
          connectorLoad: true,
          definitionTypes: ['SQL', 'TABLE', 'VIEW', 'TABLE_PATTERN', 'CONNECTOR'],
        },
      },
    ]);
    expect(storages.listSetupMetadata).toHaveBeenCalledWith('project');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('lists compatible built-in and project custom published versions without manifests', async () => {
    definitions.listByProject.mockResolvedValue([
      { id: 'c', name: 'Custom', title: 'Custom', manifest: { token: 'secret' } },
    ]);
    definitions.getActiveVersionNumbersByDefId.mockResolvedValue(new Map([['c', 2]]));
    definitions.listVersions.mockResolvedValue([
      { version: 1, status: 'draft' },
      { version: 2, status: 'published' },
    ]);
    const result = await facade.listConnectors({ ...actor, storageId: 's', limit: 10 });
    expect(result.items).toEqual([
      {
        name: 'BuiltIn',
        title: 'Built in',
        kind: 'built-in',
        activeVersion: null,
        publishedVersions: [],
        versionsTruncated: false,
      },
      {
        name: 'Custom',
        title: 'Custom',
        kind: 'custom',
        activeVersion: 2,
        publishedVersions: [2],
        versionsTruncated: false,
      },
    ]);
    expect(definitions.listVersions).toHaveBeenCalledWith('project', 'c');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('returns parameter and auth descriptors without values or OAuth variables', async () => {
    connectors.resolveConnectorSpecification.mockResolvedValue([
      {
        name: 'account',
        required: true,
        requiredType: 'string',
        default: 'secret',
        options: ['secret'],
      },
      { name: 'token', required: true, attributes: ['SECRET'], default: 'secret' },
      {
        name: 'AuthType',
        oneOf: [
          {
            value: 'oauth',
            attributes: ['OAUTH_FLOW'],
            oauthParams: { vars: { secret: 'secret' } },
            items: { refresh: { name: 'refresh', default: 'secret' } },
          },
        ],
      },
    ]);
    connectors.resolveConnectorCapabilities.mockResolvedValue({
      singleConfiguration: true,
      copySecretsByValue: false,
      raw: 'secret',
    });
    const result = await facade.getConnectorRequirements({
      ...actor,
      storageId: 's',
      connectorName: 'BuiltIn',
    });
    expect(result.parameters).toContainEqual({
      path: 'account',
      required: true,
      type: 'string',
      dynamicOptions: false,
    });
    expect(result.authorization).toEqual(
      expect.arrayContaining([
        { path: 'token', required: true, method: 'credential' },
        { path: 'AuthType.oauth', required: false, method: 'oauth' },
      ])
    );
    expect(result.credentialState).toBe('not_checked');
    expect(result.appUrl).toBe('https://app.example/ui/project/data-marts');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('pins only published custom versions and refuses unsupported built-in pinning', async () => {
    await expect(
      facade.getConnectorRequirements({
        ...actor,
        storageId: 's',
        connectorName: 'BuiltIn',
        version: 1,
      })
    ).rejects.toThrow('do not support version pinning');
    definitions.listByProject.mockResolvedValue([{ id: 'c', name: 'Custom', title: 'Custom' }]);
    definitions.getActiveVersionNumberForDef.mockResolvedValue(2);
    definitions.listVersions.mockResolvedValue([
      { version: 1, status: 'draft' },
      { version: 2, status: 'published' },
    ]);
    await expect(
      facade.getConnectorRequirements({
        ...actor,
        storageId: 's',
        connectorName: 'Custom',
        version: 1,
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(connectors.resolveConnectorSpecification).not.toHaveBeenCalled();
  });
  it('denies connector selection on unavailable or legacy storage', async () => {
    access.canAccessStored.mockResolvedValue(false);
    await expect(
      facade.listConnectors({ ...actor, storageId: 's', limit: 1 })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(connectors.getAvailableConnectors).not.toHaveBeenCalled();
    access.canAccessStored.mockResolvedValue(true);
    storages.getByProjectIdAndId.mockResolvedValue({
      id: 's',
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
    });
    await expect(facade.listConnectors({ ...actor, storageId: 's', limit: 1 })).rejects.toThrow(
      'Connector loads are not supported'
    );
  });
  it('sanitizes malformed manifest diagnostics while preserving database failures', async () => {
    connectors.resolveConnectorSpecification.mockRejectedValue(
      new BadRequestException('token=secret')
    );
    await expect(
      facade.getConnectorRequirements({ ...actor, storageId: 's', connectorName: 'BuiltIn' })
    ).rejects.toThrow('Connector requirements are invalid');
    const error = new Error('database unavailable');
    connectors.resolveConnectorSpecification.mockRejectedValue(error);
    await expect(
      facade.getConnectorRequirements({ ...actor, storageId: 's', connectorName: 'BuiltIn' })
    ).rejects.toBe(error);
  });
  it('rejects invalid pagination before any stored reads', async () => {
    await expect(facade.listStorages({ ...actor, limit: 101 })).rejects.toThrow(
      'Invalid result bounds'
    );
    expect(storages.listSetupMetadata).not.toHaveBeenCalled();
  });
});
