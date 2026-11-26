import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import type { IdentityOwoxClient } from '../client/index.js';
import type { IdpOwoxConfig } from '../config/index.js';
import {
  AuthenticationException,
  ForbiddenException,
  IdpFailedException,
} from '../core/exceptions.js';
import type { DatabaseStore } from '../store/database-store.js';
import { OwoxTokenFacade } from './owox-token-facade.js';

const tokens = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
  tokenType: 'Bearer',
};

function setup(
  origin = 'https://app.example.test',
  refreshToken: string | undefined = 'current-session'
) {
  const switchProject = jest.fn<IdentityOwoxClient['switchProject']>().mockResolvedValue(tokens);
  const getToken = jest.fn<IdentityOwoxClient['getToken']>().mockResolvedValue(tokens);
  const facade = new OwoxTokenFacade(
    { switchProject, getToken } as unknown as IdentityOwoxClient,
    {} as DatabaseStore,
    {
      idpConfig: { clientId: 'app-owox' },
      jwtConfig: {
        algorithm: 'RS256',
        clockTolerance: '5s',
        issuer: 'https://ib.example.test',
        jwtKeyCacheTtl: '1h',
      },
    } as IdpOwoxConfig
  );
  const req = {
    protocol: 'https',
    hostname: 'app.example.test',
    get: (name: string) => (name === 'origin' ? origin : 'app.example.test'),
    cookies: refreshToken ? { refreshToken } : {},
    body: {
      projectId: 'project-b',
      expectedUserId: 'user-a',
      refreshToken: 'unexpected-body-token',
    },
  } as unknown as Request;
  const createResponse = () => ({
    cookie: jest.fn(),
    set: jest.fn(),
    sendStatus: jest.fn(),
    clearCookie: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  });
  const res = createResponse();
  const requestSwitch = () => facade.switchProjectMiddleware(req, res as unknown as Response);
  const refreshRes = createResponse();
  const requestRefresh = () =>
    facade.accessTokenMiddleware(req, refreshRes as unknown as Response, jest.fn());

  return { switchProject, getToken, res, requestSwitch, refreshRes, requestRefresh };
}

describe('Cloud project switch', () => {
  it('rotates the HttpOnly cookie using only the current cookie and returns no token in the body', async () => {
    const { switchProject, res, requestSwitch } = setup();
    await requestSwitch();

    expect(switchProject).toHaveBeenCalledWith(
      'current-session',
      'app-owox',
      'project-b',
      'user-a'
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'new-refresh-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true })
    );
    expect(res.sendStatus).toHaveBeenCalledWith(204);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('rejects a different origin before contacting IB', async () => {
    const { switchProject, res, requestSwitch } = setup('https://other.example.test');
    await requestSwitch();

    expect(res.sendStatus).toHaveBeenCalledWith(403);
    expect(switchProject).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it.each([
    [new AuthenticationException('expired'), 401],
    [new ForbiddenException('unavailable'), 403],
    [new Error('upstream failure'), 502],
  ])('preserves the current cookie on an IB failure', async (error, status) => {
    const { switchProject, res, requestSwitch } = setup();
    switchProject.mockRejectedValue(error);
    await requestSwitch();

    expect(res.sendStatus).toHaveBeenCalledWith(status);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe('Cloud refresh cookie', () => {
  it.each([
    [new AuthenticationException('expired'), 'atm4'],
    [new ForbiddenException('unavailable'), 'atm9'],
    [new IdpFailedException('upstream unavailable'), 'atm5'],
    [new Error('unexpected failure'), 'atm6'],
  ])('does not overwrite the cookie when refresh fails with %s', async (error, reason) => {
    const { getToken, refreshRes, requestRefresh } = setup();
    getToken.mockRejectedValue(error);
    await requestRefresh();

    expect(refreshRes.json).toHaveBeenCalledWith(expect.objectContaining({ reason }));
    expect(refreshRes.cookie).not.toHaveBeenCalled();
    expect(refreshRes.clearCookie).not.toHaveBeenCalled();
  });
});
