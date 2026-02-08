import { type NextFunction, type Request, type Response } from 'express';
import ms from 'ms';
import { IdpOwoxConfig } from '../config/idp-owox-config.js';
import { logger } from '../logger.js';
import type { OwoxBetterAuthIdp } from '../owoxBetterAuthIdp.js';
import { generatePkce, generateState } from '../pkce.js';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import { buildAuthRequestContext } from '../types/auth-request-context.js';
import { extractPlatformParams } from '../utils/request-utils.js';
import { PageService } from './page-service.js';
import { FlowCompletionService } from './flow-completion-service.js';
import { buildPlatformEntryUrl } from '../utils/platform-redirect-builder.js';

type CoreIdpLike = Pick<OwoxBetterAuthIdp, 'accessTokenMiddleware' | 'refreshToken'>;

/**
 * Express middleware handlers for starting PKCE and fast-path sign-in.
 */
export class MiddlewareService {
  constructor(
    private readonly pageService: PageService,
    private readonly coreIdp: CoreIdpLike,
    private readonly idpOwoxConfig: IdpOwoxConfig,
    private readonly store: DatabaseStore,
    private readonly flowCompletionService: FlowCompletionService
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
        defaultSource: 'app',
        params: { redirectTo, appRedirectTo, projectId },
        allowedRedirectOrigins: this.idpOwoxConfig.idpConfig.allowedRedirectOrigins,
      });
      platformUrl.searchParams.set('state', state);
      platformUrl.searchParams.set('codeChallenge', codeChallenge);
      platformUrl.searchParams.set('clientId', this.idpOwoxConfig.idpConfig.clientId);

      return res.redirect(platformUrl.toString());
    } catch (error) {
      logger.error('Failed to start IDP flow', {}, error as Error);
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
      const fastRedirect = await this.flowCompletionService.completeWithIdentityRefreshToken(
        context.refreshToken,
        context.platformParams,
        req,
        res
      );
      if (fastRedirect) {
        logger.info('Fast-path completeAuthFlow redirectUrl', { redirectUrl: fastRedirect.toString() });
        return res.redirect(fastRedirect.toString());
      }
    }

    return this.pageService.signInPage.bind(this.pageService)(req, res);
  }

  async accessTokenMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.coreIdp.accessTokenMiddleware(req, res, next);
  }
}
