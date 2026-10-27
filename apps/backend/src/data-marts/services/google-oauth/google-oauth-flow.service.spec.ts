import { Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import {
  GOOGLE_TOKENS,
  REDIRECT_URI,
  googleOAuthFlow,
  stubGoogleConsent,
} from '../../../../test/fixtures/google-oauth';
import * as builtinDefinitions from '../../credentials/services/builtin-credential-definitions';
import { TokenRefreshFailedException } from '../../exceptions/google-oauth.exceptions';

describe('GoogleOAuthFlowService for Credentials', () => {
  afterEach(() => jest.restoreAllMocks());

  it('authorizes a Credential with the Storage client and the BigQuery scopes', async () => {
    const { flow } = googleOAuthFlow();

    const { authorizationUrl, state } = await flow.generateAuthorizationUrl(
      'credential',
      'project-1',
      'credential-1',
      REDIRECT_URI
    );

    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('client_id')).toBe('storage-client-id');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/bigquery');
    expect(jwt.decode(state)).toMatchObject({
      type: 'credential',
      projectId: 'project-1',
      resourceId: 'credential-1',
    });
  });

  it('authorizes and exchanges with the client and scopes the definition names', async () => {
    jest.spyOn(builtinDefinitions, 'builtinOAuthAuth').mockImplementation(id =>
      id === 'sheets-account'
        ? {
            type: 'oauth',
            provider: 'google',
            client: 'destination',
            scopes: 'sheets',
            label: 'S',
          }
        : null
    );
    const { flow } = googleOAuthFlow();

    const { authorizationUrl, state } = await flow.generateAuthorizationUrl(
      'credential',
      'project-1',
      undefined,
      REDIRECT_URI,
      'sheets-account'
    );
    stubGoogleConsent();

    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('client_id')).toBe('destination-client-id');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/spreadsheets');
    expect(jwt.decode(state)).toMatchObject({ definitionId: 'sheets-account' });
    await expect(flow.exchangeCodeForGrant('code-1', state, 'project-1')).resolves.toMatchObject({
      clientId: 'destination-client-id',
    });
  });

  it('authorizes google-sheets-oauth with the destination client and the Sheets scopes', async () => {
    const { flow } = googleOAuthFlow();

    const { authorizationUrl, state } = await flow.generateAuthorizationUrl(
      'credential',
      'project-1',
      undefined,
      REDIRECT_URI,
      'google-sheets-oauth'
    );
    stubGoogleConsent();

    const url = new URL(authorizationUrl);
    expect(url.searchParams.get('client_id')).toBe('destination-client-id');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/spreadsheets');
    await expect(flow.exchangeCodeForGrant('code-1', state, 'project-1')).resolves.toMatchObject({
      clientId: 'destination-client-id',
    });
  });

  it('reports which OAuth clients are configured', () => {
    expect(googleOAuthFlow().flow.getClientAvailability()).toEqual({
      storage: true,
      destination: true,
    });
  });

  it('exchanges a code for the grant and the account without writing anything', async () => {
    const { flow, destinationCredentials } = googleOAuthFlow();
    const { state } = await flow.generateAuthorizationUrl(
      'credential',
      'project-1',
      undefined,
      REDIRECT_URI
    );
    stubGoogleConsent();

    const grant = await flow.exchangeCodeForGrant('code-1', state, 'project-1');

    expect(grant).toMatchObject({
      state: { type: 'credential', projectId: 'project-1' },
      tokens: { access_token: GOOGLE_TOKENS.access_token, scope: GOOGLE_TOKENS.scope },
      user: { email: 'analyst@example.com', name: 'Ana Lyst' },
      clientId: 'storage-client-id',
    });
    expect(destinationCredentials.create).not.toHaveBeenCalled();
  });

  describe('refreshTokensByCredentialId', () => {
    function givenStoredGrant() {
      const setup = googleOAuthFlow();
      setup.storageCredentials.getById.mockResolvedValue({
        id: 'old-row-1',
        credentials: { access_token: 'old-access-token', refresh_token: 'refresh-token-1' },
      });
      return setup;
    }

    function expectOnlyMessagesLogged(logged: jest.SpyInstance) {
      expect(logged).toHaveBeenCalled();
      for (const args of logged.mock.calls) {
        expect(args.every(arg => typeof arg === 'string')).toBe(true);
        expect(args.join(' ')).not.toMatch(/refresh-token-1|storage-client-secret|new-access/);
      }
    }

    it('logs only the message of a failed Google refresh', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const { flow } = givenStoredGrant();
      jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken').mockRejectedValue(
        Object.assign(new Error('Request failed with status code 503'), {
          config: { data: 'refresh_token=refresh-token-1&client_secret=storage-client-secret' },
        }) as never
      );

      const error = await flow
        .refreshTokensByCredentialId('old-row-1', 'storage')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TokenRefreshFailedException);
      expect((error as TokenRefreshFailedException).internalDetails).toBeUndefined();
      expectOnlyMessagesLogged(logged);
    });

    it('logs only the message when saving the refreshed tokens fails', async () => {
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const { flow, storageCredentials } = givenStoredGrant();
      jest
        .spyOn(OAuth2Client.prototype, 'refreshAccessToken')
        .mockResolvedValue({ credentials: { access_token: 'new-access' }, res: null } as never);
      storageCredentials.update.mockRejectedValue(
        Object.assign(new Error('Lock wait timeout exceeded'), {
          parameters: ['{"access_token":"new-access","refresh_token":"refresh-token-1"}'],
        })
      );

      const error = await flow
        .refreshTokensByCredentialId('old-row-1', 'storage')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TokenRefreshFailedException);
      expect((error as TokenRefreshFailedException).internalDetails).toBeUndefined();
      expectOnlyMessagesLogged(logged);
    });
  });
});
