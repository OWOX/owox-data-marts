jest.mock('@owox/connectors', () => ({
  AvailableConnectors: ['TestConnector'],
  Connectors: {
    TestConnector: {
      TestConnectorSource: class {
        config = {
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
      },
    },
  },
  Core: {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    AbstractConfig: class AbstractConfig {
      constructor(_config: unknown) {}
    },
    CONFIG_ATTRIBUTES: {
      OAUTH_FLOW: 'OAUTH_FLOW',
    },
  },
}));

import { ConnectorService } from './connector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';

describe('ConnectorService', () => {
  const createService = () => {
    const connectorSourceCredentialsService = {
      createCredentials: jest.fn(),
      getCredentialsById: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;

    const service = new ConnectorService(connectorSourceCredentialsService);

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
});
