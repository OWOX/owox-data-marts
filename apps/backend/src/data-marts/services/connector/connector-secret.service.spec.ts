import type { ConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ConnectorService } from './connector.service';
import { ConnectorSecretService, SECRET_MASK } from './connector-secret.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';

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

    const specification = [...baseFields, ...fieldsWithOneOf];
    const specService = {
      getConnectorSpecification: jest.fn().mockResolvedValue(specification),
      resolveConnectorSpecification: jest.fn().mockResolvedValue(specification),
      resolveSourceKeys: jest.fn().mockResolvedValue({ fields: [], model: null }),
      getConnectorCapabilities: jest.fn().mockReturnValue({
        singleConfiguration: false,
        copySecretsByValue: false,
      }),
    } as unknown as ConnectorService;

    const credentialsService = {
      getCredentialsById: jest.fn().mockResolvedValue(null),
      getCredentialsByIds: jest.fn().mockResolvedValue(new Map()),
      getDataMartIdsByCredentialsIds: jest.fn().mockResolvedValue(new Map()),
      createSecretsForConfig: jest.fn().mockResolvedValue({ id: 'mock-secrets-id' }),
      updateSecretsForConfig: jest.fn().mockResolvedValue({}),
      deleteCredentialsByIdsAndDataMart: jest.fn().mockResolvedValue(0),
    } as unknown as ConnectorSourceCredentialsService;

    const service = new ConnectorSecretService(specService, credentialsService);
    return { service, specService, credentialsService };
  };

  const makeDefinition = (
    configItems: Array<Record<string, unknown>>,
    connectorName = 'FacebookMarketing'
  ): ConnectorDefinition => {
    return {
      connector: {
        source: {
          name: connectorName,
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

      const masked = await service.mask(undefined, def);
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
      const masked = await service.mask(undefined, def);
      expect(masked).toBe(def);
    });

    it('removes generated refresh token even when it is not a spec secret field', async () => {
      const { service } = createService([]);
      const def = makeDefinition([
        {
          _id: 'a',
          AccountIDs: '33',
          generated_refresh_token: 'generated-refresh-token',
        },
      ]);

      const masked = await service.mask(undefined, def);
      const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('generated_refresh_token');
    });

    it('resolves a custom connector secret fields via resolveConnectorSpecification', async () => {
      const { service, specService } = createService([]);
      (specService.resolveConnectorSpecification as jest.Mock).mockResolvedValue([
        { name: 'ApiKey', attributes: ['SECRET'] },
      ]);
      const def = {
        connector: {
          source: {
            name: 'SampleApisSwitch',
            version: 2,
            configuration: [{ _id: 'c1', ApiKey: 'super-secret' }],
            node: 'node',
            fields: ['id'],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      } as unknown as ConnectorDefinition;

      const masked = await service.mask('p1', def);
      const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].ApiKey).toBe(SECRET_MASK);
      expect(specService.resolveConnectorSpecification).toHaveBeenCalledWith(
        'p1',
        'SampleApisSwitch',
        2
      );
    });

    // A run list masks every run it returns and is polled every few seconds, and most of its
    // runs share one connector and version: each used to resolve the specification again,
    // reading the manifest and parsing it once per run.
    it('resolves the specification once per connector version when given a cache to share', async () => {
      const { service, specService } = createService(['ApiKey']);
      const def = (version: number) =>
        ({
          connector: {
            source: {
              name: 'SampleApisSwitch',
              version,
              configuration: [{ _id: 'c1', ApiKey: 'super-secret' }],
              node: 'node',
              fields: ['id'],
            },
            storage: { fullyQualifiedName: 'dataset.table' },
          },
        }) as unknown as ConnectorDefinition;
      const cache = new Map();

      const masked = await Promise.all([
        service.mask('p1', def(2), cache),
        service.mask('p1', def(2), cache),
        service.mask('p1', def(3), cache),
      ]);

      expect(specService.resolveConnectorSpecification).toHaveBeenCalledTimes(2);
      for (const result of masked) {
        const cfg = result!.connector.source.configuration as Array<Record<string, unknown>>;
        expect(cfg[0].ApiKey).toBe(SECRET_MASK);
      }
    });

    // Fails closed. Without the specification there is nothing to say WHICH fields are
    // secret, so the only sound assumption is that any configuration value could be one.
    // Returning the definition untouched handed a viewer every secret still stored inline —
    // a parameter the manifest never marked SECRET, or a row saved before the value was
    // externalised — through a @Auth(Role.viewer()) endpoint.
    it('masks every configuration value instead of returning secrets when the specification cannot be resolved', async () => {
      const { service, specService } = createService(['ApiKey']);
      const notFound = new Error("Connector 'SampleApisSwitch' not found");
      (specService.resolveConnectorSpecification as jest.Mock).mockRejectedValue(notFound);
      (specService.getConnectorSpecification as jest.Mock).mockRejectedValue(notFound);
      const def = makeDefinition([{ _id: 'a', ApiKey: 'super-secret', AccountIDs: '33' }]);

      const masked = await service.mask(undefined, def);

      const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].ApiKey).toBe(SECRET_MASK);
      expect(cfg[0].AccountIDs).toBe(SECRET_MASK);
      expect(JSON.stringify(masked)).not.toContain('super-secret');
      // Still readable rather than a 500: throwing here would hide the very Data Mart whose
      // connector the author has to repair.
      expect(cfg[0]._id).toBe('a');
    });

    it('masks nested values, keeps bookkeeping keys and still drops the generated refresh token when the specification cannot be resolved', async () => {
      const { service, specService } = createService([]);
      const notFound = new Error("Connector 'SampleApisSwitch' not found");
      (specService.getConnectorSpecification as jest.Mock).mockRejectedValue(notFound);
      const def = makeDefinition([
        {
          _id: 'a',
          _secrets_id: 'secrets-1',
          AuthType: { oauth2: { RefreshToken: 'nested-secret', ClientId: 'client-1' } },
          AccountIDs: ['acc-1', 'acc-2'],
          Empty: '',
          generated_refresh_token: 'rotated-token',
        },
      ]);

      const masked = await service.mask(undefined, def);

      const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;
      const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;
      expect(authType.oauth2.RefreshToken).toBe(SECRET_MASK);
      expect(authType.oauth2.ClientId).toBe(SECRET_MASK);
      expect(cfg[0].AccountIDs).toEqual([SECRET_MASK, SECRET_MASK]);
      // "No value" stays distinguishable from "a value being hidden", as on the normal path.
      expect(cfg[0].Empty).toBe('');
      // The client needs these to round-trip the item; they are not user-entered values.
      expect(cfg[0]._id).toBe('a');
      expect(cfg[0]._secrets_id).toBe('secrets-1');
      expect(cfg[0]).not.toHaveProperty('generated_refresh_token');
      expect(JSON.stringify(masked)).not.toContain('nested-secret');
      expect(JSON.stringify(masked)).not.toContain('rotated-token');
    });

    describe('a configuration bound to a Credential', () => {
      const keyFields = [
        { path: ['AuthType', 'oauth2'], parameters: ['ClientId', 'RefreshToken'] },
      ];

      it('returns its _credential_id and neither its key values nor its old key', async () => {
        const { service, specService, credentialsService } = createService(['RefreshToken']);
        (specService.resolveSourceKeys as jest.Mock).mockResolvedValue({
          fields: keyFields,
          model: null,
        });
        (credentialsService.getCredentialsByIds as jest.Mock).mockResolvedValue(
          new Map([['old-row', { credentials: { 'AuthType.oauth2.RefreshToken': 'old' } }]])
        );
        const def = makeDefinition([
          {
            _id: 'bound',
            _secrets_id: 'old-row',
            AuthType: { oauth2: { _source_credential_id: 'oauth-row', ClientId: 'client-1' } },
            AccountIDs: '33',
          },
          { _id: 'unbound', _secrets_id: 'old-row', AccountIDs: '22' },
        ]);

        const masked = await service.mask(
          'project-1',
          def,
          undefined,
          new Map([['bound', 'cred-1']])
        );

        const [bound, unbound] = masked!.connector.source.configuration as Array<
          Record<string, unknown>
        >;
        expect(bound).toEqual({
          _id: 'bound',
          _credential_id: 'cred-1',
          AuthType: { oauth2: {} },
          AccountIDs: '33',
        });
        expect(unbound).toEqual({
          _id: 'unbound',
          _secrets_id: 'old-row',
          AuthType: { oauth2: { RefreshToken: SECRET_MASK } },
          AccountIDs: '22',
        });
        expect(specService.resolveSourceKeys).toHaveBeenCalledWith(
          'project-1',
          'FacebookMarketing',
          undefined
        );
      });

      it('shows a configuration whose Credential was deleted without a _credential_id', async () => {
        const { service } = createService(['AccessToken']);
        const def = makeDefinition([{ _id: 'gone', _secrets_id: 'old-row', AccountIDs: '33' }]);

        const masked = await service.mask('project-1', def, undefined, new Map([['gone', null]]));

        expect(masked!.connector.source.configuration).toEqual([{ _id: 'gone', AccountIDs: '33' }]);
      });

      it('returns _credential_id for a connector without secret fields', async () => {
        const { service } = createService([]);
        const def = makeDefinition([{ _id: 'bound', AccountIDs: '33' }]);

        const masked = await service.mask(
          'project-1',
          def,
          undefined,
          new Map([['bound', 'cred-1']])
        );

        expect(masked!.connector.source.configuration).toEqual([
          { _id: 'bound', _credential_id: 'cred-1', AccountIDs: '33' },
        ]);
      });
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

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('prev-a');
      expect(cfg[1].AccessToken).toBe('prev-b');
    });

    it('keeps previous secret when incoming omits secret field (omit-key)', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a', AccountIDs: '33' }]);
      const incoming = makeDefinition([{ _id: 'a', AccountIDs: '33' }]);

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('prev-a');
      expect(cfg[0].AccountIDs).toBe('33');
    });

    it('updates secret when incoming provides new string', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a' }]);
      const incoming = makeDefinition([{ _id: 'a', AccessToken: 'new-a' }]);

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe('new-a');
    });

    it('does not merge when _id is missing (new item) and assigns an _id', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'a', AccessToken: 'prev-a' }]);
      const incoming = makeDefinition([{ AccountIDs: '33' }]);

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(typeof cfg[0]._id).toBe('string');
      expect((cfg[0]._id as string).length).toBeGreaterThan(0);
      expect(cfg[0].AccountIDs).toBe('33');
    });

    it('keeps current when previous item with same _id not found', async () => {
      const { service } = createService(['AccessToken']);
      const previous = makeDefinition([{ _id: 'x', AccessToken: 'prev-x' }]);
      const incoming = makeDefinition([{ _id: 'y', AccessToken: SECRET_MASK }]);

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(cfg[0]._id).toBe('y');
    });

    // Only a hand-made request keeps a configuration's _id while switching its connector. The
    // new connector would receive the old one's secrets in any parameter with the same name,
    // and a custom connector sends them wherever its manifest says.
    it('does not carry secrets over to another connector', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      const previous = makeDefinition(
        [{ _id: 'a', _secrets_id: 'shop-secrets', AccessToken: SECRET_MASK, ShopDomain: 'x' }],
        'Shopify'
      );
      const incoming = makeDefinition(
        [{ _id: 'a', _secrets_id: 'shop-secrets', AccessToken: SECRET_MASK }],
        'MyCustomConnector'
      );

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('_secrets_id');
      expect(cfg[0].AccessToken).toBe(SECRET_MASK);
      expect(credentialsService.getCredentialsById).not.toHaveBeenCalled();
    });

    it('takes no old key values into a configuration that selects a Credential', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      const previous = makeDefinition([
        { _id: 'a', _secrets_id: 'old-row', AccessToken: 'prev-a', AccountIDs: '33' },
      ]);
      const incoming = makeDefinition([
        { _id: 'a', _credential_id: 'cred-1', AccountIDs: '44' },
        { _credential_id: 'cred-2' },
      ]);

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).toEqual({ _id: 'a', _credential_id: 'cred-1', AccountIDs: '44' });
      expect(cfg[1]).toEqual({ _id: expect.any(String), _credential_id: 'cred-2' });
      expect(credentialsService.getCredentialsById).not.toHaveBeenCalled();
    });

    it('drops stale _secrets_id when an item switches to OAuth credentials', async () => {
      const { service, credentialsService } = createService(['RefreshToken']);
      const previous = makeDefinition([
        { _id: 'a', _secrets_id: 'manual-secrets-id', RefreshToken: SECRET_MASK },
      ]);
      const incoming = makeDefinition([
        {
          _id: 'a',
          AuthType: { oauth2: { _source_credential_id: 'oauth-cred' } },
        },
      ]);

      const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('_secrets_id');
      expect(authType.oauth2._source_credential_id).toBe('oauth-cred');
      expect(credentialsService.getCredentialsById).not.toHaveBeenCalled();
    });
  });

  describe('hasTypedSecrets', () => {
    it.each([
      ['a typed secret', { _id: 'a', AccessToken: 'typed' }, true],
      ['a nested typed secret', { _id: 'a', AuthType: { oauth2: { AccessToken: 'typed' } } }, true],
      ['a rotated refresh token', { _id: 'a', generated_refresh_token: 'rotated' }, true],
      ['a mask', { _id: 'a', AccessToken: SECRET_MASK }, false],
      ['an empty secret', { _id: 'a', AccessToken: '' }, false],
      ['no secret', { _id: 'a', AccountIDs: '33' }, false],
    ])('%s: %s', async (_case, item, expected) => {
      const { service } = createService(['AccessToken']);

      await expect(
        service.hasTypedSecrets('project-1', makeDefinition([item as Record<string, unknown>]))
      ).resolves.toBe(expected);
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

        const masked = await service.mask(undefined, def);
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

        const masked = await service.mask(undefined, def);
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

        const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
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

        const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
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

        const merged = await service.mergeDefinitionSecrets('project-1', incoming, previous);
        const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
        const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

        expect(authType.service_account.ServiceAccountKey).toBe('new-key');
        expect(authType.service_account.DeveloperToken).toBe('prev-token');
      });
    });
  });

  describe('extractAndSaveSecrets', () => {
    it('externalizes and removes generated refresh token even when connector has no secret fields', async () => {
      const { service, credentialsService } = createService([]);
      const definition = makeDefinition([
        {
          _id: 'config-1',
          AccountIDs: '123',
          generated_refresh_token: 'generated-refresh-token',
        },
      ]);

      const processed = await service.extractAndSaveSecrets(
        'dm-1',
        'proj-1',
        'FacebookMarketing',
        definition,
        'user-1'
      );
      const cfg = processed.connector.source.configuration as Array<Record<string, unknown>>;

      expect(credentialsService.createSecretsForConfig).toHaveBeenCalledWith(
        'proj-1',
        'FacebookMarketing',
        'dm-1',
        'config-1',
        { generated_refresh_token: 'generated-refresh-token' },
        'user-1'
      );
      expect(cfg[0]).not.toHaveProperty('generated_refresh_token');
      expect(cfg[0]._secrets_id).toBe('mock-secrets-id');
    });

    // A connector version that made AccountId secret stored it apart; a later version that does
    // not left the pointer behind, and every run injected the old value over the one the user
    // had just entered.
    it('drops the pointer to stored secrets once the connector version declares none', async () => {
      const { service, credentialsService } = createService([]);
      const definition = makeDefinition(
        [{ _id: 'config-1', _secrets_id: 'secrets-1', AccountId: 'typed-now' }],
        'MyCustomApi'
      );

      const processed = await service.extractAndSaveSecrets(
        'dm-1',
        'proj-1',
        'MyCustomApi',
        definition,
        'user-1'
      );
      const cfg = processed.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('_secrets_id');
      expect(cfg[0]).toMatchObject({ _id: 'config-1', AccountId: 'typed-now' });
      expect(credentialsService.createSecretsForConfig).not.toHaveBeenCalled();
    });

    it('updates the existing secrets record when it belongs to this DataMart', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      (credentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secrets-1',
        projectId: 'proj-1',
        dataMartId: 'dm-1',
      });

      const definition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccessToken: 'token' },
      ]);

      const processed = await service.extractAndSaveSecrets(
        'dm-1',
        'proj-1',
        'FacebookMarketing',
        definition
      );
      const cfg = processed.connector.source.configuration as Array<Record<string, unknown>>;

      expect(credentialsService.updateSecretsForConfig).toHaveBeenCalledWith(
        'secrets-1',
        'proj-1',
        {
          AccessToken: 'token',
        }
      );
      expect(credentialsService.createSecretsForConfig).not.toHaveBeenCalled();
      expect(cfg[0]._secrets_id).toBe('secrets-1');
    });

    it('forks onto its own record instead of writing through another DataMart’s pointer', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      // The stored pointer belongs to another DataMart - the shape a copy
      // produced before the pointer was stripped.
      (credentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secrets-of-dm-2',
        projectId: 'proj-1',
        dataMartId: 'dm-2',
      });

      const definition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-of-dm-2', AccessToken: 'token' },
      ]);

      const processed = await service.extractAndSaveSecrets(
        'dm-1',
        'proj-1',
        'FacebookMarketing',
        definition,
        'user-1'
      );
      const cfg = processed.connector.source.configuration as Array<Record<string, unknown>>;

      expect(credentialsService.updateSecretsForConfig).not.toHaveBeenCalled();
      expect(credentialsService.createSecretsForConfig).toHaveBeenCalledWith(
        'proj-1',
        'FacebookMarketing',
        'dm-1',
        'config-1',
        { AccessToken: 'token' },
        'user-1'
      );
      expect(cfg[0]._secrets_id).toBe('mock-secrets-id');
    });

    it('drops a foreign pointer even when every secret field is masked', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      (credentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secrets-of-dm-2',
        projectId: 'proj-1',
        dataMartId: 'dm-2',
      });

      // A hand-crafted request: a pointer lifted from another DataMart, no
      // _copiedFrom, secret fields left as the mask. With no values to extract
      // there is nothing to fork, but the pointer must not survive either —
      // stored as-is it would be dereferenced at run time with the other
      // DataMart's credentials behind it.
      const definition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-of-dm-2', AccessToken: SECRET_MASK },
      ]);

      const processed = await service.extractAndSaveSecrets(
        'dm-1',
        'proj-1',
        'FacebookMarketing',
        definition
      );
      const cfg = processed.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('_secrets_id');
      expect(cfg[0]).not.toHaveProperty('AccessToken');
      expect(credentialsService.createSecretsForConfig).not.toHaveBeenCalled();
      expect(credentialsService.updateSecretsForConfig).not.toHaveBeenCalled();
    });

    it('still rejects a pointer into another project', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      (credentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secrets-1',
        projectId: 'other-project',
        dataMartId: 'dm-9',
      });

      const definition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccessToken: 'token' },
      ]);

      await expect(
        service.extractAndSaveSecrets('dm-1', 'proj-1', 'FacebookMarketing', definition)
      ).rejects.toThrow('do not belong to project proj-1');
      expect(credentialsService.createSecretsForConfig).not.toHaveBeenCalled();
    });

    it('drops a secret field left holding only a mask', async () => {
      const { service, credentialsService } = createService(['AccessToken']);

      // No stored record backs this item, so the mask stands for nothing.
      const definition = makeDefinition([{ _id: 'config-1', AccessToken: SECRET_MASK }]);

      const processed = await service.extractAndSaveSecrets(
        'dm-1',
        'proj-1',
        'FacebookMarketing',
        definition
      );
      const cfg = processed.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('AccessToken');
      expect(credentialsService.createSecretsForConfig).not.toHaveBeenCalled();
    });

    it('removes generated refresh token from OAuth configs skipped by secret extraction', async () => {
      const { service } = createService(['RefreshToken']);
      const definition = makeDefinition([
        {
          _id: 'config-1',
          AuthType: { oauth2: { _source_credential_id: 'oauth-cred' } },
          generated_refresh_token: 'generated-refresh-token',
        },
      ]);

      const processed = await service.extractAndSaveSecrets(
        'dm-1',
        'proj-1',
        'FacebookMarketing',
        definition,
        'user-1'
      );
      const cfg = processed.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('generated_refresh_token');
    });

    it('throws Unauthorized when _secrets_id belongs to a different project', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      (credentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secrets-from-other-project',
        projectId: 'other-project',
        credentials: { AccessToken: 'someone-elses-secret' },
      });

      const definition = makeDefinition([
        {
          _id: 'config-1',
          _secrets_id: 'secrets-from-other-project',
          AccessToken: 'new-value',
        },
      ]);

      await expect(
        service.extractAndSaveSecrets('dm-1', 'proj-1', 'FacebookMarketing', definition, 'user-1')
      ).rejects.toThrow(
        'Unauthorized: secrets secrets-from-other-project do not belong to project proj-1'
      );

      expect(credentialsService.updateSecretsForConfig).not.toHaveBeenCalled();
      expect(credentialsService.createSecretsForConfig).not.toHaveBeenCalled();
    });
  });

  describe('deleteOrphanedSecrets', () => {
    // Mocks the owner of each secrets record. Records left out of the map do
    // not exist any more, which is what a soft-deleted row looks like here.
    const mockOwners = (
      credentialsService: ConnectorSourceCredentialsService,
      ownerBySecretsId: Record<string, string | undefined>
    ) => {
      (credentialsService.getDataMartIdsByCredentialsIds as jest.Mock).mockResolvedValue(
        new Map(Object.entries(ownerBySecretsId))
      );
    };

    const deletedSecretsIds = (credentialsService: ConnectorSourceCredentialsService): string[] => {
      const calls = (credentialsService.deleteCredentialsByIdsAndDataMart as jest.Mock).mock.calls;
      return calls.flatMap(([ids]: [string[]]) => ids);
    };

    it('deletes secrets for configuration items that were removed', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      mockOwners(credentialsService, { 'secrets-2': 'datamart-1' });

      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
        { _id: 'config-2', _secrets_id: 'secrets-2', AccountIDs: '2' },
        { _id: 'config-3', _secrets_id: 'secrets-3', AccountIDs: '3' },
      ]);
      const currentDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
        { _id: 'config-3', _secrets_id: 'secrets-3', AccountIDs: '3' },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', currentDefinition, previousDefinition);

      expect(deletedSecretsIds(credentialsService)).toEqual(['secrets-2']);
      expect(credentialsService.deleteCredentialsByIdsAndDataMart).toHaveBeenCalledWith(
        ['secrets-2'],
        'datamart-1'
      );
    });

    it('does not delete secrets when no configuration items were removed', async () => {
      const { service, credentialsService } = createService(['AccessToken']);

      const definition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
        { _id: 'config-2', _secrets_id: 'secrets-2', AccountIDs: '2' },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', definition, definition);

      expect(credentialsService.deleteCredentialsByIdsAndDataMart).not.toHaveBeenCalled();
    });

    it('does nothing when previous definition is undefined', async () => {
      const { service, credentialsService } = createService(['AccessToken']);

      const currentDefinition = makeDefinition([{ _id: 'config-1', _secrets_id: 'secrets-1' }]);

      await service.deleteOrphanedSecrets('datamart-1', currentDefinition, undefined);

      expect(credentialsService.deleteCredentialsByIdsAndDataMart).not.toHaveBeenCalled();
    });

    it('ignores configuration items without _secrets_id', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      mockOwners(credentialsService, { 'secrets-1': 'datamart-1' });

      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
        { _id: 'config-2', AccountIDs: '2' }, // No _secrets_id (inline secrets or no secrets)
      ]);

      await service.deleteOrphanedSecrets('datamart-1', makeDefinition([]), previousDefinition);

      expect(deletedSecretsIds(credentialsService)).toEqual(['secrets-1']);
    });

    it('deletes multiple orphaned secrets when multiple configs removed', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      mockOwners(credentialsService, {
        'secrets-1': 'datamart-1',
        'secrets-3': 'datamart-1',
        'secrets-4': 'datamart-1',
      });

      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
        { _id: 'config-2', _secrets_id: 'secrets-2', AccountIDs: '2' },
        { _id: 'config-3', _secrets_id: 'secrets-3', AccountIDs: '3' },
        { _id: 'config-4', _secrets_id: 'secrets-4', AccountIDs: '4' },
      ]);
      const currentDefinition = makeDefinition([
        { _id: 'config-2', _secrets_id: 'secrets-2', AccountIDs: '2' },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', currentDefinition, previousDefinition);

      expect(deletedSecretsIds(credentialsService)).toEqual([
        'secrets-1',
        'secrets-3',
        'secrets-4',
      ]);
    });

    it('does not delete a secrets record that belongs to a different DataMart', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      // secrets-2 is a stale copy-from pointer into another DataMart's record
      mockOwners(credentialsService, { 'secrets-2': 'other-datamart' });

      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-2', AccountIDs: '1' },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', makeDefinition([]), previousDefinition);

      expect(deletedSecretsIds(credentialsService)).toEqual([]);
    });

    it('deletes own secrets and keeps another DataMart’s in the same save', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      mockOwners(credentialsService, {
        'secrets-own': 'datamart-1',
        'secrets-foreign': 'other-datamart',
      });

      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-own', AccountIDs: '1' },
        { _id: 'config-2', _secrets_id: 'secrets-foreign', AccountIDs: '2' },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', makeDefinition([]), previousDefinition);

      expect(deletedSecretsIds(credentialsService)).toEqual(['secrets-own']);
    });

    it('keeps a record that another configuration item still references', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      mockOwners(credentialsService, { 'secrets-1': 'datamart-1' });

      // Both items point at one record - the shape a copy within the same
      // DataMart used to produce.
      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
        { _id: 'config-2', _secrets_id: 'secrets-1', AccountIDs: '2' },
      ]);
      const currentDefinition = makeDefinition([
        { _id: 'config-2', _secrets_id: 'secrets-1', AccountIDs: '2' },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', currentDefinition, previousDefinition);

      expect(credentialsService.deleteCredentialsByIdsAndDataMart).not.toHaveBeenCalled();
    });

    it('reclaims the record of an item that kept its _id but dropped the pointer', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      mockOwners(credentialsService, { 'secrets-1': 'datamart-1' });

      // config-1 switched to OAuth: same _id, no _secrets_id any more.
      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
      ]);
      const currentDefinition = makeDefinition([
        { _id: 'config-1', AuthType: { oauth2: { _source_credential_id: 'oauth-cred' } } },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', currentDefinition, previousDefinition);

      expect(deletedSecretsIds(credentialsService)).toEqual(['secrets-1']);
    });

    it('skips records that no longer exist', async () => {
      const { service, credentialsService } = createService(['AccessToken']);
      // secrets-1 is absent from the map: the row is already gone.
      mockOwners(credentialsService, {});

      const previousDefinition = makeDefinition([
        { _id: 'config-1', _secrets_id: 'secrets-1', AccountIDs: '1' },
      ]);

      await service.deleteOrphanedSecrets('datamart-1', makeDefinition([]), previousDefinition);

      expect(deletedSecretsIds(credentialsService)).toEqual([]);
    });
  });
});
