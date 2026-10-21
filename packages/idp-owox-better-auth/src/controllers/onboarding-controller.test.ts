import { describe, expect, it, jest } from '@jest/globals';
import { ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE } from '@owox/idp-protocol';
import type { Request, Response } from 'express';
import { CORE_REFRESH_TOKEN_COOKIE } from '../core/constants.js';
import type { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import type { OnboardingService } from '../services/onboarding/onboarding-service.js';
import { OnboardingController } from './onboarding-controller.js';

function createResponseMock(): Response & { body?: unknown; statusCode?: number } {
  const res = {} as Response & { body?: unknown; statusCode?: number };
  res.statusCode = 200;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response['json'];
  res.redirect = jest.fn((url: string) => {
    res.body = { redirect: url };
    return res;
  }) as unknown as Response['redirect'];
  return res;
}

function createController(viewOnly: boolean, roles: string[] = ['admin']) {
  const onboardingService = {
    shouldShowQuestionnaire: jest.fn(async () => true),
    saveAnswers: jest.fn(async () => undefined),
  } as unknown as OnboardingService;

  const tokenFacade = {
    refreshToken: jest.fn(async () => ({
      accessToken: 'access',
      refreshToken: 'refresh-rotated',
      refreshTokenExpiresIn: 3600,
    })),
    parseToken: jest.fn(async () => ({
      userId: 'user-1',
      projectId: 'project-1',
      roles,
      ...(viewOnly ? { viewOnly: true } : {}),
    })),
    setTokenToCookie: jest.fn(),
  } as unknown as OwoxTokenFacade;

  return {
    controller: new OnboardingController(onboardingService, tokenFacade),
    onboardingService,
    tokenFacade,
  };
}

describe('OnboardingController view-only', () => {
  const req = {
    cookies: { [CORE_REFRESH_TOKEN_COOKIE]: 'refresh' },
    body: {
      answers: [{ questionId: 'q1', answerValue: 'a1' }],
      redirect: '/',
    },
  } as unknown as Request;

  it('rejects POST /auth/onboarding for view-only sessions', async () => {
    const { controller, onboardingService } = createController(true);
    const res = createResponseMock();

    await controller.submitAnswers(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: ACTION_NOT_ALLOWED_IN_VIEW_ONLY_MODE,
      })
    );
    expect(onboardingService.saveAnswers).not.toHaveBeenCalled();
  });

  it('redirects GET /auth/onboarding for view-only sessions', async () => {
    const { controller, onboardingService } = createController(true);
    const res = createResponseMock();

    await controller.onboardingPage(req, res);

    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(onboardingService.shouldShowQuestionnaire).not.toHaveBeenCalled();
  });

  it('allows POST /auth/onboarding for normal sessions', async () => {
    const { controller, onboardingService } = createController(false);
    const res = createResponseMock();

    await controller.submitAnswers(req, res);

    expect(onboardingService.saveAnswers).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      redirect: '/ui/project-1/onboarding/invite-teammates?redirect=%2F',
    });
  });
});

describe('OnboardingController invite-teammates step', () => {
  function submit(redirect: string, roles?: string[]) {
    const { controller } = createController(false, roles);
    const res = createResponseMock();
    const req = {
      cookies: { [CORE_REFRESH_TOKEN_COOKIE]: 'refresh' },
      body: { answers: [{ questionId: 'q1', answerValue: 'a1' }], redirect },
    } as unknown as Request;
    return controller.submitAnswers(req, res).then(() => res.body);
  }

  it('routes an admin heading into the app through the invite step', async () => {
    await expect(submit('/ui/project-1/data-marts?tab=all')).resolves.toEqual({
      redirect:
        '/ui/project-1/onboarding/invite-teammates?redirect=%2Fui%2Fproject-1%2Fdata-marts%3Ftab%3Dall',
    });
  });

  it.each([
    // MCP client authorization (connecting an AI assistant).
    '/oauth/authorize?client_id=c1&state=s1',
    // Continuation of a switch to another project.
    '/auth/idp-start?projectId=project-2',
  ])('keeps the redirect %s that continues a flow outside the app', async redirect => {
    await expect(submit(redirect)).resolves.toEqual({ redirect });
  });

  it('skips the step for roles that cannot invite', async () => {
    await expect(submit('/', ['editor'])).resolves.toEqual({ redirect: '/' });
  });

  it('falls back to the app root, via the invite step, for an unsafe redirect', async () => {
    const viaInviteStep = { redirect: '/ui/project-1/onboarding/invite-teammates?redirect=%2F' };
    await expect(submit('https://evil.example/ui/x')).resolves.toEqual(viaInviteStep);
    await expect(submit('//evil.example')).resolves.toEqual(viaInviteStep);
    // A browser reads `/\` as `//`.
    await expect(submit('/\\evil.example')).resolves.toEqual(viaInviteStep);
  });
});
