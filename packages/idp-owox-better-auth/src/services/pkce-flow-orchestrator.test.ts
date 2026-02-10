/**
 * Tests for PkceFlowOrchestrator behavior and redirects.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Logger } from '@owox/internal-helpers';
import type { Request, Response } from 'express';
import type { IdpOwoxConfig } from '../config/idp-owox-config.js';
import { SOURCE } from '../constants.js';
import type { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import type { DatabaseAccount, DatabaseUser } from '../types/database-models.js';
import type { BetterAuthSessionService } from './better-auth-session-service.js';
import { PkceFlowOrchestrator } from './pkce-flow-orchestrator.js';
import type { PlatformAuthFlowClient } from './platform-auth-flow-client.js';
import type { UserContextService } from './user-context-service.js';

const baseConfig: IdpOwoxConfig = {
  baseUrl: 'https://auth.test',
  idpConfig: {
    clientId: 'client',
    platformSignInUrl: 'https://platform.test/auth/sign-in',
    platformSignUpUrl: 'https://platform.test/auth/sign-up',
    signOutRedirectUrl: 'https://platform.test/sign-out',
    allowedRedirectOrigins: ['https://platform.test'],
  },
  identityOwoxClientConfig: {
    clientBaseUrl: 'https://idp.test',
    defaultHeaders: undefined,
    clientTimeout: '3s',
    clientBackchannelPrefix: '/backchannel',
    c2cServiceAccountEmail: 'svc@test',
    c2cTargetAudience: 'aud',
  },
  jwtConfig: {
    clockTolerance: '5s',
    issuer: 'https://idp.test',
    jwtKeyCacheTtl: '1h',
    algorithm: 'RS256',
  },
  dbConfig: {
    type: 'sqlite',
    filename: '/tmp/test.db',
  },
};

function createReq(opts?: Partial<Request>): Request {
  return {
    protocol: 'https',
    hostname: 'platform.test',
    query: { state: 'state-1' },
    headers: {},
    cookies: {},
    ...opts,
  } as unknown as Request;
}

function createRes(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
}

describe('PkceFlowOrchestrator', () => {
  let tokenFacade: jest.Mocked<OwoxTokenFacade>;
  let platformAuthFlowClient: jest.Mocked<PlatformAuthFlowClient>;
  let betterAuthSessionService: jest.Mocked<BetterAuthSessionService>;
  let userContextService: jest.Mocked<UserContextService>;
  let logger: jest.Mocked<Logger>;
  let service: PkceFlowOrchestrator;

  beforeEach(() => {
    tokenFacade = {
      refreshToken: jest.fn(),
      setTokenToCookie: jest.fn(),
    } as unknown as jest.Mocked<OwoxTokenFacade>;

    platformAuthFlowClient = {
      completeAuthFlow: jest.fn(),
    } as unknown as jest.Mocked<PlatformAuthFlowClient>;

    betterAuthSessionService = {
      completeAuthFlowWithSessionToken: jest.fn(),
    } as unknown as jest.Mocked<BetterAuthSessionService>;

    userContextService = {
      resolveFromToken: jest.fn(),
    } as unknown as jest.Mocked<UserContextService>;

    logger = {
      warn: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    service = new PkceFlowOrchestrator(
      baseConfig,
      tokenFacade,
      userContextService,
      platformAuthFlowClient,
      betterAuthSessionService,
      logger
    );
  });

  it('completes with identity refresh token and builds redirect', async () => {
    const req = createReq();
    const res = createRes();

    tokenFacade.refreshToken.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'new-refresh',
      accessTokenExpiresIn: 100,
      refreshTokenExpiresIn: 120,
    });
    const user: DatabaseUser = { id: 'u1', email: 'user@test' };
    const account: DatabaseAccount = {
      id: 'acc-db-id',
      userId: 'u1',
      providerId: 'google',
      accountId: 'acc-1',
    };
    userContextService.resolveFromToken.mockResolvedValue({
      payload: {
        userId: 'u1',
        projectId: 'p1',
        email: 'user@test',
        fullName: 'User Test',
        roles: ['viewer'],
        projectTitle: 'Project',
      },
      user,
      account,
    });
    platformAuthFlowClient.completeAuthFlow.mockResolvedValue({ code: 'code-123' });

    const url = await service.completeWithIdentityRefreshToken(
      'rt',
      { source: SOURCE.PLATFORM },
      req,
      res
    );

    expect(url?.toString()).toContain('code=code-123');
    expect(url?.toString()).toContain('state=state-1');
    expect(tokenFacade.setTokenToCookie).toHaveBeenCalled();
  });

  it('completes with social session token and builds redirect', async () => {
    const req = createReq({
      cookies: { 'idp-owox-state': 'state-2' },
    });
    const res = createRes();

    betterAuthSessionService.completeAuthFlowWithSessionToken.mockResolvedValue({
      code: 'code-social',
      payload: {
        state: 'state-2',
        userInfo: { uid: '1', signinProvider: 'google', email: 'u@test' },
      },
    });

    const url = await service.completeWithSocialSessionToken(
      'session-token',
      { source: SOURCE.PLATFORM },
      req,
      res
    );

    expect(url?.toString()).toContain('code=code-social');
    expect(url?.toString()).toContain('state=state-2');
  });

  it('redirects to sign-in when state expired', async () => {
    const req = createReq({
      headers: { host: 'app.test' },
      cookies: { 'idp-owox-state': 'state-2' },
    });
    const res = createRes();

    betterAuthSessionService.completeAuthFlowWithSessionToken.mockRejectedValue(
      new Error('Authentication Flow Error, state expired')
    );

    const url = await service.completeWithSocialSessionToken(
      'session-token',
      { source: SOURCE.PLATFORM },
      req,
      res
    );

    expect(url?.pathname).toBe('/auth/sign-in');
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
