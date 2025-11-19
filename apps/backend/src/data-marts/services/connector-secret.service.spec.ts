import type { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ConnectorService } from './connector.service';
import { ConnectorSecretService, SECRET_MASK } from './connector-secret.service';

describe('ConnectorSecretService', () => {
  const createService = (
    secretFields: string[],
    oneOfConfig?: Array<{
      fieldName: string;
      oneOfOptions: Array<{
        label: string;
        value: string;
        items: Record<string, { name: string; attributes?: string[] }>;
      }>;
    }>
  ) => {
    const baseFields = secretFields.map(name => ({ name, attributes: ['SECRET'] }));

    const fieldsWithOneOf = oneOfConfig
      ? oneOfConfig.map(config => ({
          name: config.fieldName,
          oneOf: config.oneOfOptions.map(option => ({
            label: option.label,
            value: option.value,
            items: option.items,
          })),
        }))
      : [];

    const specService = {
      getConnectorSpecification: jest.fn().mockResolvedValue([...baseFields, ...fieldsWithOneOf]),
    } as unknown as ConnectorService;

    const service = new ConnectorSecretService(specService);
    return { service, specService };
  };

  const makeDefinition = (configItems: Array<Record<string, unknown>>): ConnectorDefinition => {
    return {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: configItems,
          node: 'ad-account-user',
          fields: ['id'],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    } as unknown as ConnectorDefinition;
  };

  describe('mask', () => {
    it('masks secret fields using SECRET_MASK', async () => {
      const { service } = createService(['AccessToken']);
      const def = makeDefinition([
        { _id: 'a', AccessToken: 'token-a', AccountIDs: '33' },
        { _id: 'b', AccessToken: 'token-b', AccountIDs: '22' },
      ]);

      const masked = await service.mask(def);
      expect(masked).toBeDefined();
      const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(cfg[1].AccessToken).toBe(SECRET_MASK);
      expect(cfg[0].AccountIDs).toBe('33');
      expect(cfg[1].AccountIDs).toBe('22');
    });

    it('returns original definition if no secret fields in spec', async () => {
      const { service } = createService([]);
      const def = makeDefinition([{ _id: 'a', AccountIDs: '33' }]);
      const masked = await service.mask(def);
      expect(masked).toBe(def);
    });
  });

  describe('mergeDefinitionSecrets', () => {
    it('keeps previous secret when incoming has SECRET_MASK', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([
        { _id: 'a', AccessToken: 'prev-a', AccountIDs: '33' },
        { _id: 'b', AccessToken: 'prev-b', AccountIDs: '22' },
      ]);
      const incoming = makeDefinition([
        { _id: 'a', AccessToken: SECRET_MASK, AccountIDs: '33' },
        { _id: 'b', AccessToken: SECRET_MASK, AccountIDs: '22' },
      ]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('prev-a');
      expect(cfg[1].AccessToken).toBe('prev-b');
    });

    it('keeps previous secret when incoming omits secret field (omit-key)', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a', AccountIDs: '33' }]);
      const incoming = makeDefinition([{ _id: 'a', AccountIDs: '33' }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('prev-a');
      expect(cfg[0].AccountIDs).toBe('33');
    });

    it('updates secret when incoming provides new string', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a' }]);
      const incoming = makeDefinition([{ _id: 'a', AccessToken: 'new-a' }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('new-a');
    });

    it('does not merge when _id is missing (new item) and assigns an _id', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a' }]);
      const incoming = makeDefinition([{ AccountIDs: '33' }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(typeof cfg[0]._id).toBe('string');
      expect((cfg[0]._id as string).length).toBeGreaterThan(0);
      expect(cfg[0].AccountIDs).toBe('33');
    });

    it('keeps current when previous item with same _id not found', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'x', AccessToken: 'prev-x' }]);
      const incoming = makeDefinition([{ _id: 'y', AccessToken: SECRET_MASK }]);

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(cfg[0]._id).toBe('y');
    });
  });

  describe('oneOf fields', () => {
    describe('mask', () => {
      it('masks secret fields inside oneOf nested objects', async () => {
        const { service } = createService(
          [],
          [
            {
              fieldName: 'AuthType',
              oneOfOptions: [
                {
                  label: 'Service Account',
                  value: 'service_account',
                  items: {
                    ServiceAccountKey: { name: 'ServiceAccountKey', attributes: ['SECRET'] },
                    DeveloperToken: { name: 'DeveloperToken', attributes: ['SECRET'] },
                  },
                },
                {
                  label: 'OAuth2',
                  value: 'oauth2',
                  items: {
                    ClientId: { name: 'ClientId' },
                    ClientSecret: { name: 'ClientSecret', attributes: ['SECRET'] },
                  },
                },
              ],
            },
          ]
        );

        const def = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              service_account: {
                _internal: 'oneOf',
                ServiceAccountKey: '{"private_key": "secret-key"}',
                DeveloperToken: 'dev-token-123',
              },
            },
            CustomerId: '123456',
          },
        ]);

        const masked = await service.mask(def);
        expect(masked).toBeDefined();
        const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;
        const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

        expect(authType.service_account.ServiceAccountKey).toBe(SECRET_MASK);
        expect(authType.service_account.DeveloperToken).toBe(SECRET_MASK);
        expect(authType.service_account._internal).toBe('oneOf');
        expect(cfg[0].CustomerId).toBe('123456');
      });

      it('masks different oneOf variants independently', async () => {
        const { service } = createService(
          [],
          [
            {
              fieldName: 'AuthType',
              oneOfOptions: [
                {
                  label: 'Service Account',
                  value: 'service_account',
                  items: {
                    ServiceAccountKey: { name: 'ServiceAccountKey', attributes: ['SECRET'] },
                  },
                },
                {
                  label: 'OAuth2',
                  value: 'oauth2',
                  items: {
                    ClientSecret: { name: 'ClientSecret', attributes: ['SECRET'] },
                  },
                },
              ],
            },
          ]
        );

        const def = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              oauth2: {
                _internal: 'oneOf',
                ClientId: 'client-123',
                ClientSecret: 'secret-456',
              },
            },
          },
        ]);

        const masked = await service.mask(def);
        const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;
        const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

        expect(authType.oauth2.ClientId).toBe('client-123');
        expect(authType.oauth2.ClientSecret).toBe(SECRET_MASK);
      });
    });

    describe('mergeDefinitionSecrets', () => {
      it('merges secret fields inside oneOf nested objects', async () => {
        const { service } = createService(
          [],
          [
            {
              fieldName: 'AuthType',
              oneOfOptions: [
                {
                  label: 'Service Account',
                  value: 'service_account',
                  items: {
                    ServiceAccountKey: { name: 'ServiceAccountKey', attributes: ['SECRET'] },
                    DeveloperToken: { name: 'DeveloperToken', attributes: ['SECRET'] },
                  },
                },
              ],
            },
          ]
        );

        const previous = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              service_account: {
                _internal: 'oneOf',
                ServiceAccountKey: '{"private_key": "prev-key"}',
                DeveloperToken: 'prev-token',
              },
            },
          },
        ]);

        const incoming = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              service_account: {
                _internal: 'oneOf',
                ServiceAccountKey: SECRET_MASK,
                DeveloperToken: SECRET_MASK,
              },
            },
          },
        ]);

        const merged = await service.mergeDefinitionSecrets(incoming, previous);
        const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
        const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

        expect(authType.service_account.ServiceAccountKey).toBe('{"private_key": "prev-key"}');
        expect(authType.service_account.DeveloperToken).toBe('prev-token');
      });

      it('updates nested secret when new value provided', async () => {
        const { service } = createService(
          [],
          [
            {
              fieldName: 'AuthType',
              oneOfOptions: [
                {
                  label: 'Service Account',
                  value: 'service_account',
                  items: {
                    ServiceAccountKey: { name: 'ServiceAccountKey', attributes: ['SECRET'] },
                  },
                },
              ],
            },
          ]
        );

        const previous = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              service_account: {
                ServiceAccountKey: 'old-key',
              },
            },
          },
        ]);

        const incoming = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              service_account: {
                ServiceAccountKey: 'new-key',
              },
            },
          },
        ]);

        const merged = await service.mergeDefinitionSecrets(incoming, previous);
        const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
        const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

        expect(authType.service_account.ServiceAccountKey).toBe('new-key');
      });

      it('keeps previous nested secret when incoming omits it', async () => {
        const { service } = createService(
          [],
          [
            {
              fieldName: 'AuthType',
              oneOfOptions: [
                {
                  label: 'Service Account',
                  value: 'service_account',
                  items: {
                    ServiceAccountKey: { name: 'ServiceAccountKey', attributes: ['SECRET'] },
                    DeveloperToken: { name: 'DeveloperToken', attributes: ['SECRET'] },
                  },
                },
              ],
            },
          ]
        );

        const previous = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              service_account: {
                ServiceAccountKey: 'prev-key',
                DeveloperToken: 'prev-token',
              },
            },
          },
        ]);

        const incoming = makeDefinition([
          {
            _id: 'a',
            AuthType: {
              service_account: {
                ServiceAccountKey: 'new-key',
              },
            },
          },
        ]);

        const merged = await service.mergeDefinitionSecrets(incoming, previous);
        const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
        const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

        expect(authType.service_account.ServiceAccountKey).toBe('new-key');
        expect(authType.service_account.DeveloperToken).toBe('prev-token');
      });
    });
  });

  describe('mergeDefinitionSecretsFromSource', () => {
    it('copies secrets from correct source configurations using _copiedFrom.configId metadata', async () => {
      const { service } = createService(['AccessToken']);

      const sourceDefinition = makeDefinition([
        { _id: 'source-id-1', AccessToken: 'access1', AccountIDs: '1' },
        { _id: 'source-id-2', AccessToken: 'access2', AccountIDs: '2' },
        { _id: 'source-id-3', AccessToken: 'access3', AccountIDs: '3' },
      ]);

      const incoming = makeDefinition([
        {
          AccessToken: SECRET_MASK,
          AccountIDs: '1',
          _copiedFrom: { configId: 'source-id-1' },
        },
        {
          AccessToken: SECRET_MASK,
          AccountIDs: '3',
          _copiedFrom: { configId: 'source-id-3' },
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0].AccessToken).toBe('access1');
      expect(cfg[0].AccountIDs).toBe('1');
      expect(cfg[0]._copiedFrom).toBeUndefined();
      expect(typeof cfg[0]._id).toBe('string');
      expect(cfg[0]._id).not.toBe('source-id-1');

      expect(cfg[1].AccessToken).toBe('access3');
      expect(cfg[1].AccountIDs).toBe('3');
      expect(cfg[1]._copiedFrom).toBeUndefined();
      expect(typeof cfg[1]._id).toBe('string');
      expect(cfg[1]._id).not.toBe('source-id-3');
    });

    it('throws error when connector types do not match', async () => {
      const { service } = createService(['AccessToken']);

      const sourceDefinition = makeDefinition([{ _id: 'source-1', AccessToken: 'access1' }]);

      const incoming = {
        connector: {
          source: {
            name: 'GoogleAds',
            configuration: [
              {
                AccessToken: SECRET_MASK,
                _copiedFrom: { configId: 'source-1' },
              },
            ],
            node: 'campaigns',
            fields: ['id'],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      } as unknown as ConnectorDefinition;

      await expect(
        service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition)
      ).rejects.toThrow('Cannot copy secrets from different connector type');
    });

    it('returns configuration as is when _copiedFrom.configId metadata is missing (existing config)', async () => {
      const { service } = createService(['AccessToken']);

      const sourceDefinition = makeDefinition([{ _id: 'source-1', AccessToken: 'access1' }]);

      const incoming = makeDefinition([
        {
          _id: 'existing-1',
          AccessToken: SECRET_MASK,
          AccountIDs: '1',
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      // Should return the item unchanged (will be merged with previous in the next step)
      expect(cfg[0]._id).toBe('existing-1');
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(cfg[0].AccountIDs).toBe('1');
    });

    it('throws error when source configuration with specified configId is not found', async () => {
      const { service } = createService(['AccessToken']);

      const sourceDefinition = makeDefinition([{ _id: 'source-1', AccessToken: 'access1' }]);

      const incoming = makeDefinition([
        {
          AccessToken: SECRET_MASK,
          _copiedFrom: { configId: 'non-existent-id' },
        },
      ]);

      await expect(
        service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition)
      ).rejects.toThrow('Source configuration with _id "non-existent-id" not found');
    });

    it('generates new _id for each copied configuration', async () => {
      const { service } = createService(['AccessToken']);

      const sourceDefinition = makeDefinition([{ _id: 'source-1', AccessToken: 'access1' }]);

      const incoming = makeDefinition([
        {
          AccessToken: SECRET_MASK,
          _copiedFrom: { configId: 'source-1' },
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]._id).not.toBe('source-1');
      expect(typeof cfg[0]._id).toBe('string');
      expect((cfg[0]._id as string).length).toBeGreaterThan(0);
    });

    it('handles self-copy scenario with mixed configurations (existing + copied)', async () => {
      const { service } = createService(['AccessToken', 'RefreshToken']);

      // Source definition has 2 configurations
      const sourceDefinition = makeDefinition([
        { _id: 'source-id-1', AccessToken: 'access1', RefreshToken: 'refresh1', AccountIDs: '1' },
        { _id: 'source-id-2', AccessToken: 'access2', RefreshToken: 'refresh2', AccountIDs: '2' },
      ]);

      // Incoming has 3 configurations:
      // 1. Existing config (no _copiedFrom) - should be returned as is
      // 2. New copied config from source-id-1
      // 3. New copied config from source-id-2
      const incoming = makeDefinition([
        {
          _id: 'existing-id',
          AccessToken: SECRET_MASK,
          RefreshToken: SECRET_MASK,
          AccountIDs: '999',
        },
        {
          AccessToken: SECRET_MASK,
          RefreshToken: SECRET_MASK,
          AccountIDs: '1',
          _copiedFrom: { configId: 'source-id-1' },
        },
        {
          AccessToken: SECRET_MASK,
          RefreshToken: SECRET_MASK,
          AccountIDs: '2',
          _copiedFrom: { configId: 'source-id-2' },
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      // First config (existing) should be unchanged
      expect(cfg[0]._id).toBe('existing-id');
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(cfg[0].RefreshToken).toBe(SECRET_MASK);
      expect(cfg[0].AccountIDs).toBe('999');
      expect(cfg[0]._copiedFrom).toBeUndefined();

      // Second config (copied from source-id-1)
      expect(cfg[1].AccessToken).toBe('access1');
      expect(cfg[1].RefreshToken).toBe('refresh1');
      expect(cfg[1].AccountIDs).toBe('1');
      expect(cfg[1]._copiedFrom).toBeUndefined();
      expect(typeof cfg[1]._id).toBe('string');
      expect(cfg[1]._id).not.toBe('source-id-1');

      // Third config (copied from source-id-2)
      expect(cfg[2].AccessToken).toBe('access2');
      expect(cfg[2].RefreshToken).toBe('refresh2');
      expect(cfg[2].AccountIDs).toBe('2');
      expect(cfg[2]._copiedFrom).toBeUndefined();
      expect(typeof cfg[2]._id).toBe('string');
      expect(cfg[2]._id).not.toBe('source-id-2');
    });
  });
});
