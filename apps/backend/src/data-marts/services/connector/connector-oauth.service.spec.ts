import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { ConnectorOauthService } from './connector-oauth.service';
import { ConnectorService } from './connector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorSourceCredentials } from '../../entities/connector-source-credentials.entity';

const context = {
  projectId: 'proj-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

/** A Credential the exchange created for Google Ads. */
function connectedCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: 'credential-1',
    projectId: 'proj-1',
    definitionId: 'source:GoogleAds:oauth2',
    secret: { fields: { RefreshToken: 'refresh-value' } },
    publicMetadata: {
      fields: { ClientId: 'client-id-value' },
      connection: {
        account: { id: '42', name: 'ads@example.com', email: null },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    },
    ...overrides,
  };
}

describe('ConnectorOauthService', () => {
  const createService = ({
    credential = null as object | null,
    canSee = true,
  }: { credential?: object | null; canSee?: boolean } = {}) => {
    const connectorService = {
      getOAuthUiVariablesExpanded: jest.fn(),
      isOAuthEnabled: jest.fn(),
    } as unknown as ConnectorService;

    const connectorSourceCredentialsService = {
      getCredentialsById: jest.fn(),
      isExpired: jest.fn(),
    } as unknown as ConnectorSourceCredentialsService;

    const credentials = { findById: jest.fn().mockResolvedValue(credential) };
    const access = { canAccess: jest.fn().mockResolvedValue(canSee) };

    const service = new ConnectorOauthService(
      connectorService,
      connectorSourceCredentialsService,
      credentials as never,
      access as never
    );

    return { service, connectorService, connectorSourceCredentialsService, credentials, access };
  };

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
    it('returns valid status for non-expired credential in the same project', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      const credential = {
        id: 'cred-1',
        projectId: 'proj-1',
        connectorName: 'TestConnector',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { name: 'Test User' },
      } as ConnectorSourceCredentials;

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
        credential
      );
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);

      const result = await service.getCredentialStatus('TestConnector', 'cred-1', context);

      expect(result.isValid).toBe(true);
      expect(result.user).toEqual({ name: 'Test User' });
    });

    it('returns expired status for expired credential in the same project', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      const credential = {
        id: 'cred-1',
        projectId: 'proj-1',
        connectorName: 'TestConnector',
        expiresAt: new Date(Date.now() - 1000 * 60 * 60),
        user: undefined,
      } as ConnectorSourceCredentials;

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
        credential
      );
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(true);

      const result = await service.getCredentialStatus('TestConnector', 'cred-1', context);

      expect(result.isValid).toBe(false);
    });

    it('throws when credential is not found', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getCredentialStatus('TestConnector', 'missing', context)
      ).rejects.toThrow('Credential with ID missing not found');
    });

    it('rejects a credential that belongs to another project', async () => {
      const { service, connectorSourceCredentialsService } = createService();

      const credential = {
        id: 'cred-1',
        projectId: 'other-proj',
        connectorName: 'TestConnector',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        user: { name: 'Test User' },
      } as ConnectorSourceCredentials;

      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue(
        credential
      );

      await expect(service.getCredentialStatus('TestConnector', 'cred-1', context)).rejects.toThrow(
        'Credential with ID cred-1 not found'
      );
      // Cross-project lookups must not leak validity by probing expiry.
      expect(connectorSourceCredentialsService.isExpired).not.toHaveBeenCalled();
    });

    it('status resolves a Credential id from the exchange', async () => {
      const credential = connectedCredential();
      const { service, access, connectorSourceCredentialsService } = createService({ credential });

      const result = await service.getCredentialStatus('GoogleAds', 'credential-1', context);

      expect(access.canAccess).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        'CREDENTIAL',
        'credential-1',
        'SEE',
        'proj-1'
      );
      expect(result).toEqual({
        isValid: true,
        expiresAt: new Date(credential.publicMetadata.connection.expiresAt),
        user: { id: '42', name: 'ads@example.com', email: undefined },
        additional: undefined,
      });
      expect(JSON.stringify(result)).not.toContain('refresh-value');
      expect(connectorSourceCredentialsService.getCredentialsById).not.toHaveBeenCalled();
    });

    it('status of a Credential whose token expired is not valid', async () => {
      const credential = connectedCredential({
        publicMetadata: {
          fields: {},
          connection: { account: null, expiresAt: '2020-01-01T00:00:00.000Z' },
        },
      });
      const { service } = createService({ credential });

      const result = await service.getCredentialStatus('GoogleAds', 'credential-1', context);

      expect(result).toMatchObject({ isValid: false });
    });

    it('a signed-in Credential with no account reports a connected user', async () => {
      const credential = connectedCredential({
        title: 'LinkedIn Ads',
        publicMetadata: { fields: {}, connection: { account: null, expiresAt: null } },
      });
      const { service } = createService({ credential });

      const result = await service.getCredentialStatus('GoogleAds', 'credential-1', context);

      expect(result).toMatchObject({
        isValid: true,
        user: { id: 'unknown', name: 'LinkedIn Ads' },
      });
    });

    it('a Credential typed by its fields reports no user', async () => {
      const credential = connectedCredential({
        title: 'Typed keys',
        publicMetadata: { fields: { ClientId: 'client-id-value' } },
      });
      const { service } = createService({ credential });

      const result = await service.getCredentialStatus('GoogleAds', 'credential-1', context);

      expect(result).toMatchObject({ isValid: true, user: undefined });
    });

    it('status still resolves an old row id', async () => {
      const { service, credentials, connectorSourceCredentialsService } = createService();
      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
        id: 'cred-1',
        projectId: 'proj-1',
        connectorName: 'GoogleAds',
        expiresAt: null,
        user: { name: 'Old row user' },
      });
      (connectorSourceCredentialsService.isExpired as jest.Mock).mockResolvedValue(false);

      const result = await service.getCredentialStatus('GoogleAds', 'cred-1', context);

      expect(credentials.findById).toHaveBeenCalledWith('cred-1');
      expect(result).toMatchObject({ isValid: true, user: { name: 'Old row user' } });
    });

    it('status refuses a Credential of another connector', async () => {
      const { service, connectorSourceCredentialsService } = createService({
        credential: connectedCredential({ definitionId: 'source:FacebookMarketing:oauth2' }),
      });

      await expect(
        service.getCredentialStatus('GoogleAds', 'credential-1', context)
      ).rejects.toThrow(BadRequestException);
      expect(connectorSourceCredentialsService.getCredentialsById).not.toHaveBeenCalled();
    });

    it('status refuses a Credential the member cannot see', async () => {
      const { service } = createService({ credential: connectedCredential(), canSee: false });

      await expect(
        service.getCredentialStatus('GoogleAds', 'credential-1', context)
      ).rejects.toThrow(ForbiddenException);
    });

    it("status treats another project's Credential as missing", async () => {
      const { service, access } = createService({
        credential: connectedCredential({ projectId: 'other-proj' }),
      });

      await expect(
        service.getCredentialStatus('GoogleAds', 'credential-1', context)
      ).rejects.toThrow(NotFoundException);
      expect(access.canAccess).not.toHaveBeenCalled();
    });
  });
});
