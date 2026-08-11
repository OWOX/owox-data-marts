import type { ConnectorService } from '../services/connector/connector.service';
import type { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import { McpConnectorsFacadeImpl } from './mcp-connectors.facade.impl';

const req = { projectId: 'p1', userId: 'u1', roles: ['viewer'] };

const connectorService = (bundled: unknown[]) =>
  ({ getAvailableConnectors: jest.fn().mockResolvedValue(bundled) }) as unknown as ConnectorService;
const defService = (custom: unknown[]) =>
  ({
    listByProject: jest.fn().mockResolvedValue(custom),
    tryResolveManifest: jest.fn().mockResolvedValue(null),
  }) as unknown as ConnectorDefinitionService;

describe('McpConnectorsFacadeImpl.listConnectors', () => {
  it('merges bundled and custom connectors, tagging each kind', async () => {
    const facade = new McpConnectorsFacadeImpl(
      connectorService([
        { name: 'GitHub', title: 'GitHub', description: 'Repos', logo: null, docUrl: null },
      ]),
      defService([{ id: 'def-1', name: 'MyApi', title: 'My API', description: null }])
    );

    await expect(facade.listConnectors(req)).resolves.toEqual({
      connectors: [
        {
          name: 'GitHub',
          title: 'GitHub',
          description: 'Repos',
          kind: 'bundled',
          connectorId: null,
        },
        { name: 'MyApi', title: 'My API', description: null, kind: 'custom', connectorId: 'def-1' },
      ],
    });
  });

  it('yields null connectorId for bundled and the definition id for custom', async () => {
    const facade = new McpConnectorsFacadeImpl(
      connectorService([
        { name: 'GitHub', title: 'GitHub', description: null, logo: null, docUrl: null },
      ]),
      defService([{ id: 'def-42', name: 'CocCocAds', title: 'CocCoc Ads', description: null }])
    );

    const { connectors } = await facade.listConnectors(req);
    const byName = Object.fromEntries(connectors.map(c => [c.name, c.connectorId]));
    expect(byName['GitHub']).toBeNull();
    expect(byName['CocCocAds']).toBe('def-42');
  });
});

describe('McpConnectorsFacadeImpl.matchByPrompt', () => {
  const facade = () =>
    new McpConnectorsFacadeImpl(
      connectorService([
        {
          name: 'FacebookMarketing',
          title: 'Facebook Marketing',
          description: 'Ads data',
          logo: null,
          docUrl: null,
        },
        { name: 'GitHub', title: 'GitHub', description: 'Repositories', logo: null, docUrl: null },
      ]),
      defService([])
    );

  it('ranks connectors matching the prompt and drops non-matches', async () => {
    const res = await facade().matchByPrompt({ ...req, prompt: 'facebook ads' });
    expect(res.connectors.map(c => c.name)).toEqual(['FacebookMarketing']);
    expect(res.connectors[0].relevanceScore).toBeGreaterThan(0);
  });

  it('honors the limit', async () => {
    const res = await facade().matchByPrompt({ ...req, prompt: 'data repositories ads', limit: 1 });
    expect(res.connectors).toHaveLength(1);
  });
});

describe('McpConnectorsFacadeImpl.matchByPrompt connectorId', () => {
  it('carries connectorId through from listConnectors (id for custom, null for bundled)', async () => {
    const facade = new McpConnectorsFacadeImpl(
      connectorService([
        { name: 'GitHub', title: 'GitHub', description: 'ads', logo: null, docUrl: null },
      ]),
      defService([{ id: 'def-9', name: 'AdsApi', title: 'Ads Api', description: 'ads' }])
    );

    const res = await facade.matchByPrompt({ ...req, prompt: 'ads' });
    const byName = Object.fromEntries(res.connectors.map(c => [c.name, c.connectorId]));
    expect(byName['AdsApi']).toBe('def-9');
    expect(byName['GitHub']).toBeNull();
  });
});

describe('McpConnectorsFacadeImpl.getConnectorDetails', () => {
  it('returns config fields and nodes for a connector', async () => {
    const cs = {
      getAvailableConnectors: jest.fn(),
      resolveConnectorSpecification: jest.fn().mockResolvedValue([{ name: 'apiKey' }]),
      resolveConnectorFieldsSchema: jest.fn().mockResolvedValue([{ name: 'Repos' }]),
    } as unknown as ConnectorService;
    const facade = new McpConnectorsFacadeImpl(cs, defService([]));

    await expect(
      facade.getConnectorDetails({ ...req, connector: 'GitHub', version: 3 })
    ).resolves.toEqual({
      name: 'GitHub',
      connectorId: null,
      configFields: [{ name: 'apiKey' }],
      nodes: [{ name: 'Repos' }],
      manifest: null,
    });
    expect(cs.resolveConnectorSpecification).toHaveBeenCalledWith('p1', 'GitHub', 3);
    expect(cs.resolveConnectorFieldsSchema).toHaveBeenCalledWith('p1', 'GitHub', 3);
  });
});

describe('McpConnectorsFacadeImpl.getConnectorDetails manifest', () => {
  const cs = () =>
    ({
      resolveConnectorSpecification: jest.fn().mockResolvedValue([]),
      resolveConnectorFieldsSchema: jest.fn().mockResolvedValue([]),
    }) as unknown as ConnectorService;

  it('returns the manifest for a custom connector', async () => {
    const ds = {
      tryResolveManifest: jest.fn().mockResolvedValue({ name: 'CocCocAds', version: '1.0' }),
      listByProject: jest.fn().mockResolvedValue([{ id: 'def-cc', name: 'CocCocAds' }]),
    } as unknown as ConnectorDefinitionService;
    const facade = new McpConnectorsFacadeImpl(cs(), ds);

    const result = await facade.getConnectorDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connector: 'CocCocAds',
    });

    expect(result.manifest).toEqual({ name: 'CocCocAds', version: '1.0' });
    expect(result.connectorId).toBe('def-cc');
  });

  it('returns null manifest and null connectorId for a bundled connector', async () => {
    const ds = {
      tryResolveManifest: jest.fn().mockResolvedValue(null),
      listByProject: jest.fn().mockResolvedValue([]),
    } as unknown as ConnectorDefinitionService;
    const facade = new McpConnectorsFacadeImpl(cs(), ds);

    const result = await facade.getConnectorDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connector: 'GoogleAds',
    });

    expect(result.manifest).toBeNull();
    expect(result.connectorId).toBeNull();
  });

  /**
   * The MCP twin of GET /connectors/custom/:id/versions/:version, which is
   * @Auth(Role.editor()) for exactly this reason: a manifest is author-written JSON that
   * can carry a literal credential, and nothing downstream masks it. The guard in front
   * of this tool checks OAuth SCOPES (`mcp:read`), which say what the client application
   * asked for, not who the user is — so without a role check here a project viewer whose
   * client holds mcp:read reads the connector body the REST endpoint refuses them.
   *
   * The derived halves stay open, matching the REST split: configFields and nodes are
   * what a viewer needs to understand a connector, and neither can carry the body.
   */
  it('withholds the manifest from a viewer while still answering with the derived details', async () => {
    const ds = {
      tryResolveManifest: jest
        .fn()
        .mockResolvedValue({ name: 'CocCocAds', baseUrl: 'https://secret.example.test' }),
      listByProject: jest.fn().mockResolvedValue([{ id: 'def-cc', name: 'CocCocAds' }]),
    } as unknown as ConnectorDefinitionService;
    const connectorService = {
      resolveConnectorSpecification: jest.fn().mockResolvedValue([{ name: 'apiKey' }]),
      resolveConnectorFieldsSchema: jest.fn().mockResolvedValue([{ name: 'Repos' }]),
    } as unknown as ConnectorService;
    const facade = new McpConnectorsFacadeImpl(connectorService, ds);

    const result = await facade.getConnectorDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      connector: 'CocCocAds',
    });

    expect(result.manifest).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret.example.test');
    expect(result.configFields).toEqual([{ name: 'apiKey' }]);
    expect(result.nodes).toEqual([{ name: 'Repos' }]);
    expect(result.connectorId).toBe('def-cc');
  });

  it('passes the requested version through to the manifest lookup', async () => {
    const tryResolveManifest = jest.fn().mockResolvedValue({});
    const ds = {
      tryResolveManifest,
      listByProject: jest.fn().mockResolvedValue([]),
    } as unknown as ConnectorDefinitionService;
    const facade = new McpConnectorsFacadeImpl(cs(), ds);

    await facade.getConnectorDetails({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connector: 'CocCocAds',
      version: 3,
    });

    expect(tryResolveManifest).toHaveBeenCalledWith('project-1', 'CocCocAds', 3);
  });
});
