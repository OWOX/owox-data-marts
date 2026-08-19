import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { IdentityOwoxClient } from '../client/index.js';
import type { IdpOwoxConfig } from '../config/index.js';
import type { DatabaseStore } from '../store/database-store.js';
import { OwoxTokenFacade } from './owox-token-facade.js';

const config = {
  idpConfig: { clientId: 'extension-client' },
  jwtConfig: {
    algorithm: 'RS256',
    clockTolerance: '5s',
    issuer: 'https://idp.example.com',
    jwtKeyCacheTtl: '1h',
  },
} as IdpOwoxConfig;

const tokenResponse = {
  accessToken: 'project-access-token',
  refreshToken: 'project-refresh-token',
  tokenType: 'Bearer',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
};

describe('OwoxTokenFacade extension project-token boundary', () => {
  let client: jest.Mocked<IdentityOwoxClient>;
  let facade: OwoxTokenFacade;
  let parse: jest.Mock;

  beforeEach(() => {
    client = {
      getToken: jest.fn().mockResolvedValue(tokenResponse),
      revokeExtensionProjectToken: jest.fn().mockResolvedValue(undefined),
      revokeToken: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as jest.Mocked<IdentityOwoxClient>;
    facade = new OwoxTokenFacade(client, {} as DatabaseStore, config);
    parse = jest.fn();
    (facade as unknown as { tokenService: { parse: jest.Mock } }).tokenService.parse = parse;
  });

  it('refreshes only a token carrying the extension project auth flow', async () => {
    parse.mockResolvedValue({ authFlow: 'extension' });

    await expect(facade.refreshExtensionProjectToken('extension-refresh-token')).resolves.toEqual({
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      accessTokenExpiresIn: tokenResponse.accessTokenExpiresIn,
      refreshTokenExpiresIn: tokenResponse.refreshTokenExpiresIn,
    });
    expect(client.getToken).toHaveBeenCalledWith({
      grantType: 'refresh_token',
      refreshToken: 'extension-refresh-token',
      clientId: 'extension-client',
    });
  });

  it('does not refresh or revoke a normal browser-session token', async () => {
    parse.mockResolvedValue({ authFlow: 'app_owox' });

    await expect(
      facade.refreshExtensionProjectToken('browser-refresh-token')
    ).rejects.toMatchObject({ description: 'invalid_project_refresh_token' });
    await expect(facade.revokeExtensionProjectToken('browser-refresh-token')).rejects.toMatchObject(
      { description: 'invalid_project_refresh_token' }
    );
    expect(client.getToken).not.toHaveBeenCalled();
    expect(client.revokeExtensionProjectToken).not.toHaveBeenCalled();
    expect(client.revokeToken).not.toHaveBeenCalled();
  });

  it('revokes an extension project token through the scoped C2C contract', async () => {
    parse.mockResolvedValue({ authFlow: 'extension' });

    await expect(
      facade.revokeExtensionProjectToken('extension-refresh-token')
    ).resolves.toBeUndefined();

    expect(client.revokeExtensionProjectToken).toHaveBeenCalledWith({
      refreshToken: 'extension-refresh-token',
    });
    expect(client.revokeToken).not.toHaveBeenCalled();
  });

  it('propagates a scoped project-token revoke failure', async () => {
    parse.mockResolvedValue({ authFlow: 'extension' });
    client.revokeExtensionProjectToken.mockRejectedValue(new Error('IB unavailable'));

    await expect(facade.revokeExtensionProjectToken('extension-refresh-token')).rejects.toThrow(
      'IB unavailable'
    );
  });
});
