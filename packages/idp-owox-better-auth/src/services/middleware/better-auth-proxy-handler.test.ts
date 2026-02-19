import { describe, expect, it, jest } from '@jest/globals';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { BETTER_AUTH_BASE_PATH, BETTER_AUTH_SESSION_COOKIE } from '../../core/constants.js';
import type { createBetterAuthConfig } from '../../config/idp-better-auth-config.js';
import { PkceFlowOrchestrator } from '../auth/pkce-flow-orchestrator.js';
import { BetterAuthProxyHandler } from './better-auth-proxy-handler.js';

type BetterAuthInstance = Awaited<ReturnType<typeof createBetterAuthConfig>>;
type TryCompleteAuthFlow = (
  req: ExpressRequest,
  response: Response,
  res: ExpressResponse
) => Promise<boolean>;

describe('BetterAuthProxyHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockPkceFlowOrchestrator = {
    completeWithSocialSessionToken: jest.fn(),
  } as unknown as jest.Mocked<PkceFlowOrchestrator>;

  const auth = {
    handler: jest.fn(),
  } as unknown as BetterAuthInstance;

  const buildReq = (contentType?: string, path = `${BETTER_AUTH_BASE_PATH}/sign-in/email`) =>
    ({
      path,
      headers: contentType ? { 'content-type': contentType } : {},
      query: {},
      cookies: {},
    }) as unknown as ExpressRequest;

  const buildRes = () =>
    ({
      json: jest.fn(),
      redirect: jest.fn(),
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    }) as unknown as ExpressResponse;

  const buildResponseWithSession = () =>
    new Response('ok', {
      status: 200,
      headers: {
        'set-cookie': `${BETTER_AUTH_SESSION_COOKIE}=session-token; Path=/; HttpOnly`,
      },
    });

  it('returns JSON with url for JSON requests', async () => {
    const handler = new BetterAuthProxyHandler(auth, mockPkceFlowOrchestrator);
    const req = buildReq('application/json');
    const res = buildRes();
    const response = buildResponseWithSession();
    const redirectUrl = new URL('https://platform.test/auth?code=123');

    mockPkceFlowOrchestrator.completeWithSocialSessionToken.mockResolvedValueOnce(redirectUrl);

    const tryCompleteAuthFlow = (
      handler as unknown as { tryCompleteAuthFlow: TryCompleteAuthFlow }
    ).tryCompleteAuthFlow.bind(handler) as TryCompleteAuthFlow;

    const result = await tryCompleteAuthFlow(req, response, res);

    expect(result).toBe(true);
    expect(res.json).toHaveBeenCalledWith({ url: redirectUrl.toString() });
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects for non-JSON requests', async () => {
    const handler = new BetterAuthProxyHandler(auth, mockPkceFlowOrchestrator);
    const req = buildReq(undefined, `${BETTER_AUTH_BASE_PATH}/callback/google`);
    const res = buildRes();
    const response = buildResponseWithSession();
    const redirectUrl = new URL('https://platform.test/auth?code=456');

    mockPkceFlowOrchestrator.completeWithSocialSessionToken.mockResolvedValueOnce(redirectUrl);

    const tryCompleteAuthFlow = (
      handler as unknown as { tryCompleteAuthFlow: TryCompleteAuthFlow }
    ).tryCompleteAuthFlow.bind(handler) as TryCompleteAuthFlow;

    const result = await tryCompleteAuthFlow(req, response, res);

    expect(result).toBe(true);
    expect(res.redirect).toHaveBeenCalledWith(redirectUrl.toString());
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns false when no session token present', async () => {
    const handler = new BetterAuthProxyHandler(auth, mockPkceFlowOrchestrator);
    const req = buildReq('application/json');
    const res = buildRes();
    const response = new Response('ok', { status: 200 });

    const tryCompleteAuthFlow = (
      handler as unknown as { tryCompleteAuthFlow: TryCompleteAuthFlow }
    ).tryCompleteAuthFlow.bind(handler) as TryCompleteAuthFlow;

    const result = await tryCompleteAuthFlow(req, response, res);

    expect(result).toBe(false);
    expect(mockPkceFlowOrchestrator.completeWithSocialSessionToken).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
