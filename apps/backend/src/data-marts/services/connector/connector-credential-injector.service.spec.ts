// connector-credential-injector.service.spec.ts
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorService } from './connector.service';
import { ConnectorSecretService } from './connector-secret.service';
import { ConnectorCredentialBoundaryError } from '../../errors/connector-credential-boundary.error';

describe('ConnectorCredentialInjectorService', () => {
  const createService = () => {
    const connectorSourceCredentialsService = {
      getCredentialsById: jest.fn(),
      isExpired: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;

    const connectorService = {
      getItemByFieldPath: jest.fn(),
      refreshCredentials: jest.fn(),
    } as unknown as ConnectorService;

    const connectorSecretService = {
      injectSecretsAtPaths: jest.fn(),
    } as unknown as ConnectorSecretService;

    const service = new ConnectorCredentialInjectorService(
      connectorSourceCredentialsService,
      connectorService,
      connectorSecretService
    );

    return { service, connectorSourceCredentialsService, connectorService, connectorSecretService };
  };

  describe('injectOAuthCredentials', () => {
    it('returns config unchanged when no _source_credential_id', async () => {
      const { service } = createService();
      const config = { field1: 'value1', field2: 'value2' };

      const result = await service.injectOAuthCredentials(config, 'TestConnector', 'proj-1');

      expect(result).toEqual(config);
    });

    it('injects credentials when _source_credential_id is present', async () => {
      const { service, connectorSourceCredentialsService, connectorService } = createService();
      const config = { AuthType: { oauth2: { _source_credential_id: 'cred-1' } } };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
        connectorName: 'TestConnector',
        credentials: {
          accessToken: 'token123',
          generated_refresh_token: 'generated-refresh-token',
        },
      });
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);
      (connectorService.getItemByFieldPath as jest.Mock).mockResolvedValue({
        oauthParams: { mapping: { AccessToken: { key: 'accessToken' } } },
      });

      const result = await service.injectOAuthCredentials(config, 'TestConnector', 'proj-1');

      const authType = result.AuthType as Record<string, Record<string, unknown>>;
      expect(authType.oauth2).not.toHaveProperty('_source_credential_id');
      expect(authType.oauth2.AccessToken).toBe('token123');
      expect(authType.oauth2.GeneratedRefreshToken).toEqual({
        value: 'generated-refresh-token',
      });
      expect(authType.oauth2).not.toHaveProperty('generated_refresh_token');
    });

    it('returns config unchanged when credential not found', async () => {
      const { service, connectorSourceCredentialsService } = createService();
      const config = { _source_credential_id: 'missing-cred' };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(null);

      const result = await service.injectOAuthCredentials(config, 'TestConnector', 'proj-1');

      expect(result).toHaveProperty('_source_credential_id');
    });

    it('returns config unchanged when credential belongs to different project', async () => {
      const { service, connectorSourceCredentialsService } = createService();
      const config = { _source_credential_id: 'cred-1' };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        projectId: 'other-proj',
        connectorName: 'TestConnector',
        credentials: { token: 'tok' },
      });

      const result = await service.injectOAuthCredentials(config, 'TestConnector', 'proj-1');

      expect(result).toHaveProperty('_source_credential_id');
    });

    it('injects credentials directly when no mapping found', async () => {
      const { service, connectorSourceCredentialsService, connectorService } = createService();
      const config = { _source_credential_id: 'cred-1' };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
        connectorName: 'TestConnector',
        credentials: {
          accessToken: 'token123',
          generated_refresh_token: 'generated-refresh-token',
        },
      });
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);
      (connectorService.getItemByFieldPath as jest.Mock).mockResolvedValue({
        oauthParams: {},
      });

      const result = await service.injectOAuthCredentials(config, 'TestConnector', 'proj-1');

      expect(result.accessToken).toBe('token123');
      expect(result.GeneratedRefreshToken).toEqual({ value: 'generated-refresh-token' });
      expect(result).not.toHaveProperty('generated_refresh_token');
      expect(result).not.toHaveProperty('_source_credential_id');
    });
  });

  describe('injectOAuthCredentials connector boundary', () => {
    const VICTIM_TOKEN = 'victim-access-token';

    // `_source_credential_id` is returned unmasked by the definition API, so any project
    // member can learn the id of a credential issued for another connector. Pointing a
    // connector they control at that id must not resolve it.
    const arrangeForeignCredential = (
      connectorSourceCredentialsService: ConnectorSourceCredentialsService,
      connectorService: ConnectorService,
      spec: unknown
    ) => {
      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'victim-cred',
        projectId: 'proj-1',
        connectorName: 'FacebookMarketing',
        credentials: { accessToken: VICTIM_TOKEN },
      });
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);
      (connectorService.getItemByFieldPath as jest.Mock).mockResolvedValue(spec);
    };

    it('rejects a credential issued for a different connector', async () => {
      const { service, connectorSourceCredentialsService, connectorService } = createService();
      arrangeForeignCredential(connectorSourceCredentialsService, connectorService, {
        oauthParams: {},
      });

      await expect(
        service.injectOAuthCredentials(
          { AuthType: { _source_credential_id: 'victim-cred' } },
          'AttackerConnector',
          'proj-1'
        )
      ).rejects.toThrow(/FacebookMarketing.*AttackerConnector/);
    });

    it('keeps the foreign credential secret out of the resolved config', async () => {
      const { service, connectorSourceCredentialsService, connectorService } = createService();
      // No mapping for this path is what makes the unguarded code spread the whole
      // credentials record into the config, so this is the disclosure path.
      arrangeForeignCredential(connectorSourceCredentialsService, connectorService, {
        oauthParams: {},
      });

      const outcome = await service
        .injectOAuthCredentials(
          { AuthType: { _source_credential_id: 'victim-cred' } },
          'AttackerConnector',
          'proj-1'
        )
        .then(value => ({ rejected: false, value: value as unknown }))
        .catch((error: unknown) => ({ rejected: true, value: error }));

      const exposed =
        outcome.value instanceof Error ? outcome.value.message : JSON.stringify(outcome.value);
      expect(exposed).not.toContain(VICTIM_TOKEN);
      expect(outcome.rejected).toBe(true);
    });

    it('rejects a foreign connector credential even when the field declares a mapping', async () => {
      const { service, connectorSourceCredentialsService, connectorService } = createService();
      arrangeForeignCredential(connectorSourceCredentialsService, connectorService, {
        oauthParams: { mapping: { AccessToken: { key: 'accessToken' } } },
      });

      const outcome = await service
        .injectOAuthCredentials(
          { AuthType: { _source_credential_id: 'victim-cred' } },
          'AttackerConnector',
          'proj-1'
        )
        .then(value => ({ rejected: false, value: value as unknown }))
        .catch((error: unknown) => ({ rejected: true, value: error }));

      const exposed =
        outcome.value instanceof Error ? outcome.value.message : JSON.stringify(outcome.value);
      expect(exposed).not.toContain(VICTIM_TOKEN);
      expect(outcome.rejected).toBe(true);
    });
  });

  describe('injectSecrets', () => {
    it('returns config as-is when no _secrets_id present', async () => {
      const { service } = createService();
      const config = { field1: 'value1', field2: 'value2' };

      const result = await service.injectSecrets(config, 'proj-1');

      expect(result).toEqual(config);
    });

    it('injects secrets when _secrets_id is present and credentials found', async () => {
      const { service, connectorSourceCredentialsService, connectorSecretService } =
        createService();
      const config = { _secrets_id: 'secret-1', field1: 'value1' };
      const secrets = { 'AuthType.oauth2.RefreshToken': 'tok123' };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secret-1',
        projectId: 'proj-1',
        credentials: secrets,
      });
      (connectorSecretService.injectSecretsAtPaths as jest.Mock).mockImplementation(
        () => undefined
      );

      const result = await service.injectSecrets(config, 'proj-1');

      expect(result).not.toHaveProperty('_secrets_id');
      expect(connectorSecretService.injectSecretsAtPaths).toHaveBeenCalledWith(
        expect.objectContaining({ field1: 'value1' }),
        secrets
      );
    });

    it('injects generated refresh token from externalized secrets', async () => {
      const { service, connectorSourceCredentialsService, connectorSecretService } =
        createService();
      const config = { _secrets_id: 'secret-1', field1: 'value1' };
      const secrets = {
        'AuthType.oauth2.RefreshToken': 'original-refresh-token',
        generated_refresh_token: 'generated-refresh-token',
      };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secret-1',
        projectId: 'proj-1',
        credentials: secrets,
      });
      (connectorSecretService.injectSecretsAtPaths as jest.Mock).mockImplementation(
        () => undefined
      );

      const result = await service.injectSecrets(config, 'proj-1');

      expect(result.GeneratedRefreshToken).toEqual({ value: 'generated-refresh-token' });
      expect(result).not.toHaveProperty('generated_refresh_token');
      expect(connectorSecretService.injectSecretsAtPaths).toHaveBeenCalledWith(
        expect.objectContaining({ field1: 'value1' }),
        { 'AuthType.oauth2.RefreshToken': 'original-refresh-token' }
      );
    });

    it('returns config when secrets entity not found', async () => {
      const { service, connectorSourceCredentialsService } = createService();
      const config = { _secrets_id: 'missing-secret', field1: 'value1' };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(null);

      const result = await service.injectSecrets(config, 'proj-1');

      expect(result).toHaveProperty('_secrets_id');
      expect(result).toEqual(config);
    });

    it('returns config when secrets belong to different project', async () => {
      const { service, connectorSourceCredentialsService } = createService();
      const config = { _secrets_id: 'secret-1', field1: 'value1' };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'secret-1',
        projectId: 'other-proj',
        credentials: { key: 'value' },
      });

      const result = await service.injectSecrets(config, 'proj-1');

      expect(result).toHaveProperty('_secrets_id');
      expect(result).toEqual(config);
    });

    it('returns config on error', async () => {
      const { service, connectorSourceCredentialsService } = createService();
      const config = { _secrets_id: 'secret-1', field1: 'value1' };

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockRejectedValue(
        new Error('database error')
      );

      const result = await service.injectSecrets(config, 'proj-1');

      expect(result).toHaveProperty('_secrets_id');
      expect(result).toEqual(config);
    });
  });

  describe('refreshCredentialsForConfig', () => {
    it('returns same config when no _source_credential_id', async () => {
      const { service } = createService();
      const config = { field: 'value' };

      const result = await service.refreshCredentialsForConfig('proj-1', 'TestConnector', config);

      expect(result).toEqual(config);
    });

    it('updates _source_credential_id when credential is refreshed', async () => {
      const { service, connectorService } = createService();
      const config = { _source_credential_id: 'old-cred' };

      (connectorService.refreshCredentials as jest.Mock).mockResolvedValue('new-cred');

      const result = await service.refreshCredentialsForConfig('proj-1', 'TestConnector', config);

      expect(result._source_credential_id).toBe('new-cred');
    });

    it('keeps original credential when refresh returns same id', async () => {
      const { service, connectorService } = createService();
      const config = { _source_credential_id: 'same-cred' };

      (connectorService.refreshCredentials as jest.Mock).mockResolvedValue('same-cred');

      const result = await service.refreshCredentialsForConfig('proj-1', 'TestConnector', config);

      expect(result._source_credential_id).toBe('same-cred');
    });

    it('keeps original credential on transient refresh error', async () => {
      const { service, connectorService } = createService();
      const config = { _source_credential_id: 'cred-1' };

      (connectorService.refreshCredentials as jest.Mock).mockRejectedValue(
        new Error('refresh failed')
      );

      const result = await service.refreshCredentialsForConfig('proj-1', 'TestConnector', config);

      expect(result._source_credential_id).toBe('cred-1');
    });

    it('propagates a boundary violation instead of continuing with the credential', async () => {
      const { service, connectorService } = createService();
      const config = { _source_credential_id: 'victim-cred' };

      (connectorService.refreshCredentials as jest.Mock).mockRejectedValue(
        new ConnectorCredentialBoundaryError(
          'Credential belongs to connector FacebookMarketing, not AttackerConnector'
        )
      );

      await expect(
        service.refreshCredentialsForConfig('proj-1', 'AttackerConnector', config)
      ).rejects.toBeInstanceOf(ConnectorCredentialBoundaryError);
    });
  });
});
