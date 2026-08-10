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

    const specService = {
      getConnectorSpecification: jest.fn().mockResolvedValue([...baseFields, ...fieldsWithOneOf]),
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

    it('removes generated refresh token even when it is not a spec secret field', async () => {
      const { service } = createService([]);
      const def = makeDefinition([
        {
          _id: 'a',
          AccountIDs: '33',
          generated_refresh_token: 'generated-refresh-token',
        },
      ]);

      const masked = await service.mask(def);
      const cfg = masked!.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('generated_refresh_token');
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

      const merged = await service.mergeDefinitionSecrets(incoming, previous);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('_secrets_id');
      expect(authType.oauth2._source_credential_id).toBe('oauth-cred');
      expect(credentialsService.getCredentialsById).not.toHaveBeenCalled();
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

    it('copies secrets by value without retaining the source secret record', async () => {
      const { service, specService, credentialsService } = createService(['ServiceAccountKey']);
      (specService.getConnectorCapabilities as jest.Mock).mockReturnValue({
        singleConfiguration: false,
        copySecretsByValue: true,
      });

      (credentialsService.getCredentialsByIds as jest.Mock).mockResolvedValue(
        new Map([
          [
            'secrets-1',
            {
              id: 'secrets-1',
              credentials: {
                'AuthType.service_account.ServiceAccountKey': 'stored-service-account-key',
              },
            },
          ],
        ])
      );

      const sourceDefinition = makeDefinition(
        [{ _id: 'source-id-1', _secrets_id: 'secrets-1', AuthType: { service_account: {} } }],
        'CopyByValueConnector'
      );

      const incoming = makeDefinition(
        [
          {
            _secrets_id: 'secrets-1',
            AuthType: { service_account: { ServiceAccountKey: SECRET_MASK } },
            _copiedFrom: { configId: 'source-id-1' },
          },
        ],
        'CopyByValueConnector'
      );

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

      expect(authType.service_account.ServiceAccountKey).toBe('stored-service-account-key');
      expect(cfg[0]).not.toHaveProperty('_secrets_id');
    });

    it('seeds the copy with the source generated refresh token in its own record', async () => {
      const { service, credentialsService } = createService(['RefreshToken']);

      (credentialsService.getCredentialsByIds as jest.Mock).mockResolvedValue(
        new Map([
          [
            'secrets-1',
            {
              id: 'secrets-1',
              credentials: {
                'AuthType.oauth2.RefreshToken': 'stored-refresh-token',
                generated_refresh_token: 'generated-refresh-token',
              },
            },
          ],
        ])
      );

      const sourceDefinition = makeDefinition([
        { _id: 'source-id-1', _secrets_id: 'secrets-1', AuthType: { oauth2: {} } },
      ]);

      const incoming = makeDefinition([
        {
          _secrets_id: 'secrets-1',
          AuthType: { oauth2: { RefreshToken: SECRET_MASK } },
          _copiedFrom: { configId: 'source-id-1' },
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

      // The copy keeps the same auth chain, so it takes the rotated token as
      // the seed of its own record — Microsoft does not revoke a redeemed
      // refresh token, so the two records rotate independent lineages — but it
      // never keeps the pointer to the source's record.
      expect(authType.oauth2.RefreshToken).toBe('stored-refresh-token');
      expect(cfg[0].generated_refresh_token).toBe('generated-refresh-token');
      expect(cfg[0]).not.toHaveProperty('_secrets_id');
    });

    it('does not copy source generated refresh token when incoming copied refresh token changes', async () => {
      const { service, credentialsService } = createService(['RefreshToken']);

      (credentialsService.getCredentialsByIds as jest.Mock).mockResolvedValue(
        new Map([
          [
            'secrets-1',
            {
              id: 'secrets-1',
              credentials: {
                'AuthType.oauth2.RefreshToken': 'stored-refresh-token',
                generated_refresh_token: 'generated-refresh-token',
              },
            },
          ],
        ])
      );

      const sourceDefinition = makeDefinition([
        { _id: 'source-id-1', _secrets_id: 'secrets-1', AuthType: { oauth2: {} } },
      ]);

      const incoming = makeDefinition([
        {
          AuthType: { oauth2: { RefreshToken: 'new-refresh-token' } },
          _copiedFrom: { configId: 'source-id-1' },
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;
      const authType = cfg[0].AuthType as Record<string, Record<string, unknown>>;

      expect(authType.oauth2.RefreshToken).toBe('new-refresh-token');
      expect(cfg[0]).not.toHaveProperty('generated_refresh_token');
    });

    it('does not inline generated refresh token into copied OAuth configs', async () => {
      const { service, credentialsService } = createService(['RefreshToken']);

      (credentialsService.getCredentialsByIds as jest.Mock).mockResolvedValue(
        new Map([
          [
            'secrets-1',
            {
              id: 'secrets-1',
              credentials: {
                'AuthType.oauth2.RefreshToken': 'stored-refresh-token',
                generated_refresh_token: 'generated-refresh-token',
              },
            },
          ],
        ])
      );

      const sourceDefinition = makeDefinition([
        {
          _id: 'source-id-1',
          _secrets_id: 'secrets-1',
          AuthType: { oauth2: { _source_credential_id: 'oauth-cred' } },
        },
      ]);

      const incoming = makeDefinition([
        {
          AuthType: { oauth2: { _source_credential_id: 'oauth-cred' } },
          _copiedFrom: { configId: 'source-id-1' },
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      expect(cfg[0]).not.toHaveProperty('generated_refresh_token');
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

    it('strips a copied _secrets_id so the target DataMart gets its own secrets record', async () => {
      const { service, credentialsService } = createService(['AccessToken']);

      // Production shape: the source's secret value lives in the credentials
      // record, not inline in the definition.
      (credentialsService.getCredentialsByIds as jest.Mock).mockResolvedValue(
        new Map([
          [
            'source-secrets-id',
            { id: 'source-secrets-id', credentials: { AccessToken: 'access1' } },
          ],
        ])
      );

      const sourceDefinition = makeDefinition([
        { _id: 'source-1', _secrets_id: 'source-secrets-id', AccountIDs: '1' },
      ]);

      // The frontend "Copy from..." feature spreads every field of the source
      // config except _id/_copiedFrom, so _secrets_id leaks into the incoming
      // item pointing at the SOURCE DataMart's own secrets record.
      const incoming = makeDefinition([
        {
          AccessToken: SECRET_MASK,
          AccountIDs: '1',
          _secrets_id: 'source-secrets-id',
          _copiedFrom: { configId: 'source-1' },
        },
      ]);

      const merged = await service.mergeDefinitionSecretsFromSource(incoming, sourceDefinition);
      const cfg = merged.connector.source.configuration as Array<Record<string, unknown>>;

      // The value is carried over from the source's credentials record, but the
      // pointer to that record is not.
      expect(cfg[0].AccessToken).toBe('access1');
      expect(cfg[0]).not.toHaveProperty('_secrets_id');
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
