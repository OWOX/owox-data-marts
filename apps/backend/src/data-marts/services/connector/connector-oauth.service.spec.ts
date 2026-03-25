import { BadRequestException } from '@nestjs/common';
import { ConnectorOauthService } from './connector-oauth.service';
import { ConnectorService } from './connector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorSourceCredentials } from '../../entities/connector-source-credentials.entity';

describe('ConnectorOauthService', () => {
  const createService = () => {
    const connectorService = {
      exchangeCredential: jest.fn(),
      getOAuthUiVariablesExpanded: jest.fn(),
      isOAuthEnabled: jest.fn(),
    } as unknown as ConnectorService;

    const connectorSourceCredentialsService = {
      getCredentialsById: jest.fn(),
      isExpired: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;

    const service = new ConnectorOauthService(connectorService, connectorSourceCredentialsService);

    return { service, connectorService, connectorSourceCredentialsService };
  };

  describe('exchangeCredentials', () => {
    it('returns success result when exchange succeeds', async () => {
      const { service, connectorService } = createService();

      (connectorService.exchangeCredential as jest.Mock).mockResolvedValue({
        credentialId: 'cred-1',
        user: { name: 'Test User', email: 'test@example.com' },
        additional: { extra: 'data' },
        warnings: ['some warning'],
      });

      const result = await service.exchangeCredentials(
        'proj-1',
        'user-1',
        'TestConnector',
        'AuthType.oauth2',
        { code: 'auth_code' }
      );

      expect(result).toEqual({
        success: true,
        credentialId: 'cred-1',
        user: { name: 'Test User', email: 'test@example.com' },
        additional: { extra: 'data' },
        reasons: ['some warning'],
      });
    });

    it('throws BadRequestException when OauthFlowException occurs', async () => {
      const { service, connectorService } = createService();

      const oauthError = Object.assign(new Error('OAuth flow failed'), {
        name: 'OauthFlowException',
      });
      (connectorService.exchangeCredential as jest.Mock).mockRejectedValue(oauthError);

      await expect(
        service.exchangeCredentials('proj-1', 'user-1', 'TestConnector', 'AuthType.oauth2', {})
      ).rejects.toThrow(BadRequestException);
    });

    it('rethrows regular Error when it occurs', async () => {
      const { service, connectorService } = createService();

      const error = new Error('network error');
      (connectorService.exchangeCredential as jest.Mock).mockRejectedValue(error);

      await expect(
        service.exchangeCredentials('proj-1', 'user-1', 'TestConnector', 'AuthType.oauth2', {})
      ).rejects.toThrow('network error');
    });
  });

  describe('getOAuthSettings', () => {
    it('returns vars and isEnabled', async () => {
      const { service, connectorService } = createService();

      (connectorService.getOAuthUiVariablesExpanded as jest.Mock).mockResolvedValue({
        client_id: 'my-client-id',
      });
      (connectorService.isOAuthEnabled as jest.Mock).mockResolvedValue(true);

      const result = await service.getOAuthSettings('TestConnector', 'AuthType.oauth2');

      expect(result).toEqual({
        vars: { client_id: 'my-client-id' },
        isEnabled: true,
      });
    });

    it('returns isEnabled false when OAuth is disabled', async () => {
      const { service, connectorService } = createService();

      (connectorService.getOAuthUiVariablesExpanded as jest.Mock).mockResolvedValue({});
      (connectorService.isOAuthEnabled as jest.Mock).mockResolvedValue(false);

      const result = await service.getOAuthSettings('TestConnector', 'AuthType.oauth2');

      expect(result.isEnabled).toBe(false);
    });
  });

  describe('getCredentialStatus', () => {
    it('returns valid status for non-expired credential', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      const credential = {
        id: 'cred-1',
        connectorName: 'TestConnector',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { name: 'Test User' },
      } as ConnectorSourceCredentials;

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
        credential
      );
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);

      const result = await service.getCredentialStatus('TestConnector', 'cred-1');

      expect(result.isValid).toBe(true);
      expect(result.user).toEqual({ name: 'Test User' });
    });

    it('returns expired status for expired credential', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      const credential = {
        id: 'cred-1',
        connectorName: 'TestConnector',
        expiresAt: new Date(Date.now() - 1000 * 60 * 60),
        user: undefined,
      } as ConnectorSourceCredentials;

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
        credential
      );
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(true);

      const result = await service.getCredentialStatus('TestConnector', 'cred-1');

      expect(result.isValid).toBe(false);
    });

    it('throws when credential is not found', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(null);

      await expect(service.getCredentialStatus('TestConnector', 'missing')).rejects.toThrow(
        'Credential with ID missing not found'
      );
    });
  });
});
