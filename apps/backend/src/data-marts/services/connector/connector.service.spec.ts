jest.mock('@owox/connectors', () => ({
  AvailableConnectors: ['TestConnector'],
  Connectors: {
    TestConnector: {
      TestConnectorSource: class {
        parameters = {
          AuthType: {
            label: 'Auth Type',
            description: 'Authentication type',
            default: 'oauth2',
            requiredType: 'object',
            isRequired: true,
            oneOf: [
              {
                label: 'OAuth2',
                value: 'oauth2',
                requiredType: 'object',
                attributes: ['OAUTH_FLOW'],
                oauthParams: {
                  vars: {
                    client_id: {
                      store: 'env',
                      key: 'GOOGLE_CLIENT_ID',
                      required: true,
                      attributes: ['UI'],
                    },
                  },
                },
                items: {},
              },
            ],
          },
        };
        getFieldsSchema() {
          return {
            ads: {
              overview: 'Ads data',
              description: 'Advertising data',
              documentation: 'https://docs.example.com',
              uniqueKeys: ['id'],
              destinationName: 'ads',
              fields: {
                id: { type: 'string', description: 'Ad ID' },
              },
            },
          };
        }
        exchangeOauthCredentials = jest.fn();
        refreshCredentials = jest.fn();
      },
      manifest: {
        title: 'Test Connector',
        description: 'A test connector',
        logo: 'https://logo.url',
        docUrl: 'https://docs.url',
        capabilities: {
          singleConfiguration: true,
        },
      },
    },
  },
  Core: {
    AbstractContext: class AbstractContext {
      sourceConfig: Record<string, unknown> = {};
      storageConfig: Record<string, unknown> = {};
      runConfig = { type: 'INCREMENTAL', data: [], state: {} };
      env = { datamartId: null, runId: null };
      constructor(_options: unknown) {}
      registerParameters() {}
      getParameter() {
        return null;
      }
      log() {}
      emit() {}
    },
    // Minimal stand-ins for the declarative pipeline so getSpecificationFromManifest
    // can map a custom manifest without pulling the whole connectors runtime.
    ManifestParser: class ManifestParser {
      parse(json: string) {
        const raw = JSON.parse(json);
        if (!raw || typeof raw !== 'object' || raw.parameters === undefined) {
          throw new Error('ManifestParser: invalid manifest');
        }
        return raw;
      }
    },
    DeclarativeSource: class DeclarativeSource {
      parameters: Record<string, unknown>;
      constructor(_context: unknown, model: { parameters?: Record<string, unknown> }) {
        this.parameters = model.parameters ?? {};
      }
      getFieldsSchema() {
        return {};
      }
    },
    CONFIG_ATTRIBUTES: {
      OAUTH_FLOW: 'OAUTH_FLOW',
    },
    GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD: 'generated_refresh_token',
    GENERATED_REFRESH_TOKEN_CONFIG_FIELD: 'GeneratedRefreshToken',
  },
}));

import { ConnectorService } from './connector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorDefinitionService } from './connector-definition.service';

import { Connectors } from '@owox/connectors';

describe('ConnectorService', () => {
  const tryResolveManifest = jest.fn();
  const connectorDefinitionServiceMock = {
    tryResolveManifest,
  } as unknown as ConnectorDefinitionService;

  const createService = () => {
    const connectorSourceCredentialsService = {
      createCredentials: jest.fn(),
      getCredentialsById: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;

    const service = new ConnectorService(
      connectorSourceCredentialsService,
      connectorDefinitionServiceMock
    );

    return { service, connectorSourceCredentialsService };
  };

  describe('getAvailableConnectors', () => {
    it('returns list of available connectors', async () => {
      const { service } = createService();

      const result = await service.getAvailableConnectors();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'TestConnector',
        title: 'Test Connector',
        description: 'A test connector',
      });
    });
  });

  describe('getConnectorCapabilities', () => {
    it('reads enabled capabilities and defaults missing ones to false', () => {
      const { service } = createService();

      expect(service.getConnectorCapabilities('TestConnector')).toEqual({
        singleConfiguration: true,
        copySecretsByValue: false,
      });
    });
  });

  describe('resolveConnectorCapabilities', () => {
    beforeEach(() => tryResolveManifest.mockReset());

    it('returns the bundled capabilities for a bundled connector (no DB lookup)', async () => {
      const { service } = createService();

      await expect(service.resolveConnectorCapabilities('p1', 'TestConnector')).resolves.toEqual({
        singleConfiguration: true,
        copySecretsByValue: false,
      });
      expect(tryResolveManifest).not.toHaveBeenCalled();
    });

    it('returns no capabilities for a custom connector', async () => {
      const { service } = createService();
      tryResolveManifest.mockResolvedValue({ version: '1.0', name: 'MyCustom', nodes: {} });

      await expect(service.resolveConnectorCapabilities('p1', 'MyCustom', 2)).resolves.toEqual({
        singleConfiguration: false,
        copySecretsByValue: false,
      });
      expect(tryResolveManifest).toHaveBeenCalledWith('p1', 'MyCustom', 2);
    });

    it('ignores a capabilities block carried by a stored custom manifest', async () => {
      const { service } = createService();
      // A stored manifest is unvalidated user JSON: nothing in the connectors Core
      // or ManifestParser reads or checks `capabilities`, so honouring it here would
      // let an author flip flags that relax input validation and steer secret copying.
      tryResolveManifest.mockResolvedValue({
        version: '1.0',
        name: 'MyCustom',
        capabilities: { singleConfiguration: true, copySecretsByValue: true },
        nodes: {},
      });

      await expect(service.resolveConnectorCapabilities('p1', 'MyCustom')).resolves.toEqual({
        singleConfiguration: false,
        copySecretsByValue: false,
      });
    });

    it('throws NotFound for an unknown (neither bundled nor custom) name', async () => {
      const { service } = createService();
      tryResolveManifest.mockResolvedValue(null);

      await expect(service.resolveConnectorCapabilities('p1', 'NoSuchConnector')).rejects.toThrow(
        "Connector 'NoSuchConnector' not found"
      );
    });
  });

  describe('getConnectorSpecification', () => {
    it('returns specification for a known connector', async () => {
      const { service } = createService();

      const result = await service.getConnectorSpecification('TestConnector');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({ name: 'AuthType' });
    });

    it('throws for an unknown connector', async () => {
      const { service } = createService();

      await expect(service.getConnectorSpecification('UnknownConnector')).rejects.toThrow(
        "Connector 'UnknownConnector' not found"
      );
    });
  });

  describe('isOAuthEnabled', () => {
    const envKey = 'GOOGLE_CLIENT_ID';
    const originalValue = process.env[envKey];

    afterEach(() => {
      if (originalValue === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = originalValue;
      }
    });

    it('requires every required environment variable, including UI variables', async () => {
      const { service } = createService();
      delete process.env[envKey];

      await expect(service.isOAuthEnabled('TestConnector', 'AuthType.oauth2')).resolves.toBe(false);
    });

    it('enables OAuth when all required environment variables are configured', async () => {
      const { service } = createService();
      process.env[envKey] = 'client-id';

      await expect(service.isOAuthEnabled('TestConnector', 'AuthType.oauth2')).resolves.toBe(true);
    });
  });

  describe('resolveConnectorSpecification', () => {
    beforeEach(() => tryResolveManifest.mockReset());

    it('returns the bundled specification for a bundled connector (no DB lookup)', async () => {
      const { service } = createService();

      const bundledName = Object.keys(Connectors)[0];
      const spec = await service.resolveConnectorSpecification('p1', bundledName);

      expect(spec).toBeDefined();
      expect(tryResolveManifest).not.toHaveBeenCalled();
    });

    it('resolves a custom connector via its manifest', async () => {
      const { service } = createService();

      // Valid declarative manifest shape reused from connector.service.manifest.spec.ts.
      const manifest = {
        version: '1.0',
        name: 'SampleApisSwitch',
        baseUrl: 'https://api.example.com',
        parameters: { Token: { requiredType: 'string', isRequired: true, label: 'API Token' } },
        nodes: {
          items: {
            fields: { id: { type: 'string' }, name: { type: 'string' } },
            uniqueKeys: ['id'],
            request: { method: 'GET', path: '/items' },
            recordSelector: { recordPath: [] },
          },
        },
      };
      tryResolveManifest.mockResolvedValue(manifest);

      const spec = await service.resolveConnectorSpecification('p1', 'SampleApisSwitch', 2);

      expect(tryResolveManifest).toHaveBeenCalledWith('p1', 'SampleApisSwitch', 2);
      expect(spec).toBeDefined();
    });

    it('throws NotFound for an unknown (neither bundled nor custom) name', async () => {
      const { service } = createService();

      tryResolveManifest.mockResolvedValue(null);

      await expect(service.resolveConnectorSpecification('p1', 'NoSuchConnector')).rejects.toThrow(
        "Connector 'NoSuchConnector' not found"
      );
    });
  });

  describe('validateConnectorExists (via getConnectorSpecification)', () => {
    it('throws for unknown connector name', async () => {
      const { service } = createService();

      await expect(service.getConnectorSpecification('NoSuchConnector')).rejects.toThrow(
        "Connector 'NoSuchConnector' not found"
      );
    });
  });

  describe('getConnectorFieldsSchema', () => {
    it('returns fields schema for a known connector', async () => {
      const { service } = createService();

      const result = await service.getConnectorFieldsSchema('TestConnector');

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toMatchObject({ name: 'ads', destinationName: 'ads' });
    });
  });

  describe('refreshCredentials', () => {
    it('refreshes a credential that belongs to the same project', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
        connectorName: 'TestConnector',
        credentials: {},
        expiresAt: null,
        userId: 'user-1',
      });

      // The connector source mock's refreshCredentials returns undefined (no rotation),
      // so the existing credential id is returned unchanged.
      const result = await service.refreshCredentials('proj-1', 'TestConnector', {}, 'cred-1');

      expect(result).toBe('cred-1');
      expect(connectorSourceCredentialsService.createCredentials).not.toHaveBeenCalled();
    });

    it('rejects a credential that belongs to another project', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        projectId: 'other-proj',
        connectorName: 'TestConnector',
        credentials: { refresh_token: 'secret' },
        expiresAt: null,
        userId: 'user-2',
      });

      await expect(
        service.refreshCredentials('proj-1', 'TestConnector', {}, 'cred-1')
      ).rejects.toThrow('Credential with ID cred-1 not found');
      // A cross-project credential must never be copied into the caller's project.
      expect(connectorSourceCredentialsService.createCredentials).not.toHaveBeenCalled();
    });

    it('rejects a credential issued for a different connector', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
        connectorName: 'OtherConnector',
        credentials: { refresh_token: 'secret' },
        expiresAt: null,
        userId: 'user-1',
      });

      await expect(
        service.refreshCredentials('proj-1', 'TestConnector', {}, 'cred-1')
      ).rejects.toThrow('Credential belongs to connector OtherConnector, not TestConnector');
      // Tokens of one connector must never be rotated under another connector name.
      expect(connectorSourceCredentialsService.createCredentials).not.toHaveBeenCalled();
    });
  });
});

// 'TestConnector' is the only bundled connector name allowed by this file's top-level
// jest.mock('@owox/connectors') → bundled branch (no DB lookup); 'MyCustom' is not
// in that mocked registry → custom branch.
describe('ConnectorService.resolveConnectorFieldsSchema', () => {
  it('resolves a bundled connector via getConnectorFieldsSchema (no DB lookup)', async () => {
    const defService = { tryResolveManifest: jest.fn() };
    const service = new ConnectorService({} as never, defService as never);
    const spy = jest
      .spyOn(service, 'getConnectorFieldsSchema')
      .mockResolvedValue([{ name: 'Repos' }] as never);

    const result = await service.resolveConnectorFieldsSchema('p1', 'TestConnector');

    expect(defService.tryResolveManifest).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('TestConnector');
    expect(result).toEqual([{ name: 'Repos' }]);
  });

  it('resolves a custom connector from its manifest', async () => {
    const manifest = { source: { name: 'Custom' } };
    const defService = { tryResolveManifest: jest.fn().mockResolvedValue(manifest) };
    const service = new ConnectorService({} as never, defService as never);
    jest.spyOn(service, 'getFieldsSchemaFromManifest').mockReturnValue([{ name: 'Rows' }] as never);

    const result = await service.resolveConnectorFieldsSchema('p1', 'MyCustom', 2);

    expect(defService.tryResolveManifest).toHaveBeenCalledWith('p1', 'MyCustom', 2);
    expect(result).toEqual([{ name: 'Rows' }]);
  });
});
