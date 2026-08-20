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
      exchangeMicrosoftExtensionIdentity: jest.fn().mockResolvedValue(tokenResponse),
      getToken: jest.fn().mockResolvedValue(tokenResponse),
      revokeToken: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as jest.Mocked<IdentityOwoxClient>;
    facade = new OwoxTokenFacade(client, {} as DatabaseStore, config);
    parse = jest.fn();
    (facade as unknown as { tokenService: { parse: jest.Mock } }).tokenService.parse = parse;
  });

  it('maps the Microsoft identity exchange to the standard project token result', async () => {
    const request = { oid: 'oid-1', tid: 'tid-1', email: 'user@example.com' };

    await expect(facade.exchangeMicrosoftExtensionIdentity(request)).resolves.toEqual({
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      accessTokenExpiresIn: tokenResponse.accessTokenExpiresIn,
      refreshTokenExpiresIn: tokenResponse.refreshTokenExpiresIn,
    });
    expect(client.exchangeMicrosoftExtensionIdentity).toHaveBeenCalledWith(request);
  });

  it('refreshes only a token carrying the extension auth flow', async () => {
    parse.mockResolvedValue({ authFlow: 'extension' });

    await facade.refreshExtensionProjectToken('extension-refresh-token');

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
    expect(client.revokeToken).not.toHaveBeenCalled();
  });

  it('revokes an extension token through the existing token revocation endpoint', async () => {
    parse.mockResolvedValue({ authFlow: 'extension' });

    await facade.revokeExtensionProjectToken('extension-refresh-token');

    expect(client.revokeToken).toHaveBeenCalledWith({
      token: 'extension-refresh-token',
      tokenType: 'refresh_token',
    });
  });

  it('fails extension revoke when the identity service did not revoke the token', async () => {
    parse.mockResolvedValue({ authFlow: 'extension' });
    client.revokeToken.mockResolvedValue({ success: false });

    await expect(
      facade.revokeExtensionProjectToken('extension-refresh-token')
    ).rejects.toMatchObject({
      name: 'IdpFailedException',
      status: 500,
    });
  });
});
