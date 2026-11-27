import type { NextFunction, Request, Response } from 'express';
import { PageController } from '../../controllers/page-controller.js';
import { createServiceLogger } from '../../core/logger.js';
import { buildAuthRequestContext } from '../../types/auth-request-context.js';
import { readVerifiedSocialIntent } from '../../utils/social-intent.js';
import { PkceFlowOrchestrator } from '../auth/pkce-flow-orchestrator.js';

/**
 * Express middleware handlers for starting PKCE and fast-path sign-in.
 */
export class AuthFlowMiddleware {
  private readonly logger = createServiceLogger(AuthFlowMiddleware.name);

  constructor(
    private readonly pageController: PageController,
    private readonly pkceFlowOrchestrator: PkceFlowOrchestrator
  ) {}

  async signInMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    const context = buildAuthRequestContext(req);
    if (context.state && context.refreshToken && !readVerifiedSocialIntent(req)) {
      const fastRedirect = await this.pkceFlowOrchestrator.completeWithIdentityRefreshToken(
        context.refreshToken,
        context.authFlowParams,
        req,
        res
      );
      if (fastRedirect) {
        this.logger.info('Fast-path completeAuthFlow redirectUrl', {
          redirectUrl: fastRedirect.toString(),
        });
        return res.redirect(fastRedirect.toString());
      }
    }

    return this.pageController.signInPage.bind(this.pageController)(req, res);
  }

  async signUpMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    return this.pageController.signUpPage.bind(this.pageController)(req, res);
  }
}
