import type { NextFunction, Request, Response } from 'express';
import ms from 'ms';
import { IdpOwoxConfig } from '../../config/index.js';
import { PageController } from '../../controllers/page-controller.js';
import { SOURCE } from '../../core/constants.js';
import { createServiceLogger } from '../../core/logger.js';
import { generatePkce, generateState } from '../../core/pkce.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { buildAuthRequestContext } from '../../types/auth-request-context.js';
import { buildPlatformEntryUrl } from '../../utils/platform-redirect-builder.js';
import { extractPlatformParams } from '../../utils/request-utils.js';
import { PkceFlowOrchestrator } from '../auth/pkce-flow-orchestrator.js';

/**
 * Express middleware handlers for starting PKCE and fast-path sign-in.
 */
export class AuthFlowMiddleware {
  private readonly logger = createServiceLogger(AuthFlowMiddleware.name);

  constructor(
    private readonly pageController: PageController,
    private readonly idpOwoxConfig: IdpOwoxConfig,
    private readonly store: DatabaseStore,
    private readonly pkceFlowOrchestrator: PkceFlowOrchestrator
  ) {}

  async idpStartMiddleware(req: Request, res: Response): Promise<void> {
    try {
      await this.store.initialize();
      const { codeVerifier, codeChallenge } = await generatePkce();
      const state = generateState();
      const expiresAt = new Date(Date.now() + ms('1m'));
      await this.store.saveAuthState(state, codeVerifier, expiresAt);

      const { redirectTo, appRedirectTo, projectId } = extractPlatformParams(req);

      const platformUrl = buildPlatformEntryUrl({
        authUrl: this.idpOwoxConfig.idpConfig.platformSignInUrl,
        defaultSource: SOURCE.APP,
        params: { redirectTo, appRedirectTo, projectId },
        allowedRedirectOrigins: this.idpOwoxConfig.idpConfig.allowedRedirectOrigins,
      });
      platformUrl.searchParams.set('state', state);
      platformUrl.searchParams.set('codeChallenge', codeChallenge);
      platformUrl.searchParams.set('clientId', this.idpOwoxConfig.idpConfig.clientId);

      return res.redirect(platformUrl.toString());
    } catch (error) {
      this.logger.error(
        'Failed to start IDP flow',
        { path: req.path },
        error instanceof Error ? error : undefined
      );
      res.status(500).end('Failed to start IDP flow');
    }
  }

  async signInMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    const context = buildAuthRequestContext(req);
    if (context.state && context.refreshToken) {
      const fastRedirect = await this.pkceFlowOrchestrator.completeWithIdentityRefreshToken(
        context.refreshToken,
        context.platformParams,
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
