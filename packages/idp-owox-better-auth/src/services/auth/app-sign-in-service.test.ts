import { describe, expect, it, jest } from '@jest/globals';
import type { IdentityOwoxClient } from '../../client/index.js';
import { deriveCodeChallenge, isAppSignInState } from '../../core/pkce.js';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { StoreResult } from '../../store/store-result.js';
import type { BetterAuthSessionService } from './better-auth-session-service.js';
import { AppSignInService } from './app-sign-in-service.js';

function setup() {
  const authState = new Map<string, StoreResult>();
  const saveAuthState = jest.fn<DatabaseStore['saveAuthState']>(
    async (state, verifier, _expiresAt, params) => {
      authState.set(state, StoreResult.withCode(verifier, params));
    }
  );
  const getAuthState = jest.fn<DatabaseStore['getAuthState']>(async state => {
    const value = authState.get(state);
    authState.delete(state);
    return value ?? StoreResult.notFound();
  });
  const purgeExpiredAuthStates = jest
    .fn<DatabaseStore['purgeExpiredAuthStates']>()
    .mockResolvedValue(0);
  const resolveVerifiedIdentity = jest.fn<BetterAuthSessionService['resolveVerifiedIdentity']>(
    async (_session, state, provider) => ({
      state,
      userInfo: { uid: 'provider-user', signinProvider: provider, email: 'user@example.test' },
    })
  );
  const authorizeAppSignIn = jest
    .fn<IdentityOwoxClient['authorizeAppSignIn']>()
    .mockResolvedValue({ code: 'app-code' });
  const tokenPair = {
    accessToken: 'app-access-token',
    refreshToken: 'app-refresh-token',
    tokenType: 'Bearer',
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 3600,
  };
  const exchangeAuthCode = jest
    .fn<OwoxTokenFacade['exchangeAuthCode']>()
    .mockResolvedValue(tokenPair);

  const service = new AppSignInService(
    { saveAuthState, getAuthState, purgeExpiredAuthStates } as unknown as DatabaseStore,
    { resolveVerifiedIdentity } as unknown as BetterAuthSessionService,
    { authorizeAppSignIn } as unknown as IdentityOwoxClient,
    { exchangeAuthCode } as unknown as OwoxTokenFacade
  );
  return {
    service,
    saveAuthState,
    purgeExpiredAuthStates,
    resolveVerifiedIdentity,
    authorizeAppSignIn,
    exchangeAuthCode,
    tokenPair,
  };
}

describe('App sign-in', () => {
  it.each(['google', 'microsoft', 'credential'])(
    'exchanges the verified %s identity using the stored project and PKCE verifier',
    async provider => {
      const { service, saveAuthState, authorizeAppSignIn, exchangeAuthCode, tokenPair } = setup();
      const params = {
        projectId: 'project-2',
        appRedirectTo: '/ui/project-2/data-marts/report-1',
      };
      const state = await service.start(params);
      expect(isAppSignInState(state)).toBe(true);
      const verifier = saveAuthState.mock.calls[0]?.[1] ?? '';

      await expect(service.complete(state, 'temporary-session', provider)).resolves.toEqual({
        ...tokenPair,
        authFlowParams: params,
      });
      expect(authorizeAppSignIn).toHaveBeenCalledWith({
        state,
        codeChallenge: deriveCodeChallenge(verifier),
        projectId: 'project-2',
        userInfo: {
          uid: 'provider-user',
          signinProvider: provider,
          email: 'user@example.test',
        },
      });
      expect(exchangeAuthCode).toHaveBeenCalledWith('app-code', verifier);

      await expect(service.complete(state, 'temporary-session', provider)).rejects.toThrow(
        'already used'
      );
      expect(authorizeAppSignIn).toHaveBeenCalledTimes(1);
    }
  );

  it('does not issue a code for an unverified identity', async () => {
    const { service, resolveVerifiedIdentity, authorizeAppSignIn } = setup();
    const state = await service.start({});
    resolveVerifiedIdentity.mockRejectedValueOnce(new Error('Email is not verified'));

    await expect(service.complete(state, 'temporary-session', 'credential')).rejects.toThrow(
      'Email is not verified'
    );
    expect(authorizeAppSignIn).not.toHaveBeenCalled();
  });

  it('purges expired attempts once per interval when starting fresh sign-ins', async () => {
    const { service, purgeExpiredAuthStates } = setup();

    await service.start({});
    await service.start({});

    expect(purgeExpiredAuthStates).toHaveBeenCalledTimes(1);
  });
});
