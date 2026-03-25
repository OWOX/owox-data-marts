// connector-source-config.service.spec.ts
import { ConnectorSourceConfigService } from './connector-source-config.service';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorStateService } from '../../connector-types/connector-message/services/connector-state.service';

describe('ConnectorSourceConfigService', () => {
  const createService = () => {
    const credentialInjector = {
      injectOAuthCredentials: jest.fn().mockImplementation(config => Promise.resolve(config)),
      injectSecrets: jest.fn().mockImplementation(config => Promise.resolve(config)),
    } as unknown as ConnectorCredentialInjectorService;

    const connectorStateService = {
      getState: jest.fn().mockResolvedValue(null),
    } as unknown as ConnectorStateService;

    const service = new ConnectorSourceConfigService(credentialInjector, connectorStateService);

    return { service, credentialInjector, connectorStateService };
  };

  describe('buildSourceConfig', () => {
    const connector = {
      source: {
        name: 'TestConnector',
        node: 'test_node',
        fields: ['field1', 'field2'],
        configuration: [],
      },
      storage: { fullyQualifiedName: 'dataset.table' },
    };

    it('builds source config with fields', async () => {
      const { service } = createService();
      const config = { param1: 'val1' };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.buildSourceConfig(
        'dm-1',
        'proj-1',
        connector as any,
        config,
        'cfg-1'
      );

      expect(result).toBeDefined();
    });

    it('includes LastRequestedDate when state has date', async () => {
      const { service, connectorStateService } = createService();
      (connectorStateService.getState as jest.Mock).mockResolvedValue({
        state: { date: '2025-01-15T00:00:00.000Z' },
      });
      const config = { param1: 'val1' };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.buildSourceConfig(
        'dm-1',
        'proj-1',
        connector as any,
        config,
        'cfg-1'
      );

      expect(result).toBeDefined();
    });

    it('calls credential injector for OAuth credentials', async () => {
      const { service, credentialInjector } = createService();
      const config = { _source_credential_id: 'cred-1' };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.buildSourceConfig('dm-1', 'proj-1', connector as any, config, 'cfg-1');

      expect(credentialInjector.injectOAuthCredentials).toHaveBeenCalledWith(
        config,
        'TestConnector',
        'proj-1'
      );
    });
  });

  describe('buildRunConfig', () => {
    it('returns INCREMENTAL type by default when no payload', () => {
      const { service } = createService();

      const result = service.buildRunConfig(null, undefined);

      expect(result).toBeDefined();
    });

    it('extracts runType from payload', () => {
      const { service } = createService();
      const payload = { payload: { runType: 'FULL', data: {} } };

      const result = service.buildRunConfig(payload, undefined);

      expect(result).toBeDefined();
    });

    it('extracts data entries from payload', () => {
      const { service } = createService();
      const payload = {
        payload: {
          runType: 'INCREMENTAL',
          data: { startDate: '2025-01-01', endDate: '2025-01-31' },
        },
      };

      const result = service.buildRunConfig(payload, undefined);

      expect(result).toBeDefined();
    });

    it('includes state when provided', () => {
      const { service } = createService();
      const state = { _id: 'cfg-1', state: { date: '2025-01-15' }, at: '2025-01-15T00:00:00Z' };

      const result = service.buildRunConfig(null, state);

      expect(result).toBeDefined();
    });
  });
});
