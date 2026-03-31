// connector-credential-injector.service.spec.ts
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorService } from './connector.service';
import { ConnectorSecretService } from './connector-secret.service';

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
        credentials: { accessToken: 'token123' },
      });
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);
      (connectorService.getItemByFieldPath as jest.Mock).mockResolvedValue({
        oauthParams: { mapping: { AccessToken: { key: 'accessToken' } } },
      });

      const result = await service.injectOAuthCredentials(config, 'TestConnector', 'proj-1');

      const authType = result.AuthType as Record<string, Record<string, unknown>>;
      expect(authType.oauth2).not.toHaveProperty('_source_credential_id');
      expect(authType.oauth2.AccessToken).toBe('token123');
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
        credentials: { accessToken: 'token123' },
      });
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);
      (connectorService.getItemByFieldPath as jest.Mock).mockResolvedValue({
        oauthParams: {},
      });

      const result = await service.injectOAuthCredentials(config, 'TestConnector', 'proj-1');

      expect(result.accessToken).toBe('token123');
      expect(result).not.toHaveProperty('_source_credential_id');
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

    it('keeps original credential on refresh error', async () => {
      const { service, connectorService } = createService();
      const config = { _source_credential_id: 'cred-1' };

      (connectorService.refreshCredentials as jest.Mock).mockRejectedValue(
        new Error('refresh failed')
      );

      const result = await service.refreshCredentialsForConfig('proj-1', 'TestConnector', config);

      expect(result._source_credential_id).toBe('cred-1');
    });
  });
});
