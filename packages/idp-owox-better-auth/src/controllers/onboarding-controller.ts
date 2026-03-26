import type { Express, Request, Response } from 'express';
import { AUTH_BASE_PATH, CORE_REFRESH_TOKEN_COOKIE } from '../core/constants.js';
import { createServiceLogger } from '../core/logger.js';
import type { OnboardingService } from '../services/onboarding/onboarding-service.js';
import { TemplateService } from '../services/rendering/template-service.js';
import type { SaveOnboardingAnswersRequest } from '../types/index.js';
import type { OwoxTokenFacade } from '../facades/owox-token-facade.js';

/**
 * Handles onboarding questionnaire pages and submissions.
 */
export class OnboardingController {
  private readonly logger = createServiceLogger(OnboardingController.name);

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly tokenFacade: OwoxTokenFacade,
    private readonly gtmContainerId?: string
  ) {}

  /**
   * GET /auth/onboarding — renders the questionnaire page.
   * Requires a valid refreshToken cookie and the user must meet onboarding criteria.
   */
  async onboardingPage(req: Request, res: Response): Promise<void> {
    const ctx = await this.resolveUserContext(req, res);
    if (!ctx.userId) {
      return res.redirect(`${AUTH_BASE_PATH}/sign-in`);
    }

    const eligible = await this.isEligible(ctx.userId, ctx.projectId);
    if (!eligible) {
      return res.redirect('/');
    }

    const emailDomain = typeof req.query?.domain === 'string' ? req.query.domain : '';

    res.send(
      TemplateService.renderOnboarding({
        emailDomain,
        gtmContainerId: this.gtmContainerId,
      })
    );
  }

  /**
   * POST /auth/onboarding — saves answers and returns redirect URL.
   */
  async submitAnswers(req: Request, res: Response): Promise<void> {
    try {
      const { userId, projectId, biUserId, userRole } = await this.resolveUserContext(req, res);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const eligible = await this.isEligible(userId, projectId);
      if (!eligible) {
        res.status(403).json({ error: 'Onboarding not available' });
        return;
      }

      const body = req.body as SaveOnboardingAnswersRequest;
      if (!body?.answers || !Array.isArray(body.answers) || body.answers.length === 0) {
        res.status(400).json({ error: 'No answers provided' });
        return;
      }

      await this.onboardingService.saveAnswers(userId, projectId, biUserId, userRole, {
        answers: body.answers,
      });

      const redirect = this.sanitizeRedirect(body.redirect);
      res.json({ redirect });
    } catch (error) {
      this.logger.warn(
        'Failed to save onboarding answers',
        undefined,
        error instanceof Error ? error : undefined
      );
      res.status(400).json({ error: 'Failed to save answers' });
    }
  }

  /**
   * Checks whether the user is eligible for onboarding via OnboardingService.shouldShowQuestionnaire.
   * Returns false on any error (fail-safe: don't block the user).
   */
  private async isEligible(userId: string, projectId: string): Promise<boolean> {
    try {
      return await this.onboardingService.shouldShowQuestionnaire(userId, projectId);
    } catch (error) {
      this.logger.warn(
        'Onboarding eligibility check failed, denying access',
        undefined,
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Resolves userId, projectId, biUserId, and role from the refresh token cookie.
   * Refreshes the token and updates the cookie following the standard auth pattern.
   */
  private async resolveUserContext(
    req: Request,
    res: Response
  ): Promise<{ userId: string; projectId: string; biUserId: string; userRole: string }> {
    const refreshToken = req.cookies?.[CORE_REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      return { userId: '', projectId: '', biUserId: '', userRole: 'viewer' };
    }

    try {
      const auth = await this.tokenFacade.refreshToken(refreshToken);
      if (auth.refreshToken && auth.refreshTokenExpiresIn !== undefined) {
        this.tokenFacade.setTokenToCookie(res, req, auth.refreshToken, auth.refreshTokenExpiresIn);
      }
      const payload = await this.tokenFacade.parseToken(auth.accessToken);
      if (payload) {
        const role = payload.roles?.[0] ?? 'viewer';
        return {
          userId: payload.userId,
          projectId: payload.projectId,
          // biUserId is the same as userId in the refresh token payload
          biUserId: payload.userId,
          userRole: role,
        };
      }
    } catch (error) {
      this.logger.warn(
        'Failed to resolve user context for onboarding',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
    return { userId: '', projectId: '', biUserId: '', userRole: 'viewer' };
  }

  /**
   * Validates redirect is a safe relative path. Returns '/' for any suspicious value.
   */
  private sanitizeRedirect(value: unknown): string {
    if (typeof value !== 'string') return '/';
    const trimmed = value.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
    return trimmed;
  }

  registerRoutes(app: Express): void {
    app.get(`${AUTH_BASE_PATH}/onboarding`, this.onboardingPage.bind(this));
    app.post(`${AUTH_BASE_PATH}/onboarding`, this.submitAnswers.bind(this));
  }
}
