import { type NextFunction, type Request, type Response } from 'express';
import ms from 'ms';
import { IdpOwoxConfig } from '../config/idp-owox-config.js';
import { logger } from '../logger.js';
import type { OwoxBetterAuthIdp } from '../owoxBetterAuthIdp.js';
import { generatePkce, generateState } from '../pkce.js';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import { buildAuthRequestContext } from '../types/auth-request-context.js';
import { buildPlatformRedirectUrl } from '../utils/platform-redirect-builder.js';
import { extractPlatformParams } from '../utils/request-utils.js';
import { AuthenticationService } from './authentication-service.js';
import { PageService } from './page-service.js';

type CoreIdpLike = Pick<OwoxBetterAuthIdp, 'accessTokenMiddleware' | 'refreshToken'>;

export class MiddlewareService {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly pageService: PageService,
    private readonly coreIdp: CoreIdpLike,
    private readonly idpOwoxConfig: IdpOwoxConfig,
    private readonly store: DatabaseStore
  ) {}

  async idpStartMiddleware(req: Request, res: Response): Promise<void> {
    try {
      await this.store.initialize();
      const { codeVerifier, codeChallenge } = await generatePkce();
      const state = generateState();
      const expiresAt = new Date(Date.now() + ms('1m'));
      await this.store.saveAuthState(state, codeVerifier, expiresAt);

      const { redirectTo, appRedirectTo, projectId } = extractPlatformParams(req);

      const platformUrl = new URL(this.idpOwoxConfig.idpConfig.platformSignInUrl);
      platformUrl.searchParams.set('state', state);
      platformUrl.searchParams.set('codeChallenge', codeChallenge);
      platformUrl.searchParams.set('clientId', this.idpOwoxConfig.idpConfig.clientId);
      platformUrl.searchParams.set('source', 'app');
      if (redirectTo) platformUrl.searchParams.set('redirect-to', redirectTo);
      if (appRedirectTo) platformUrl.searchParams.set('app-redirect-to', appRedirectTo);
      if (projectId) platformUrl.searchParams.set('projectId', projectId);

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
    const state = context.state || '';
    if (state) {
      const hasCoreSession = await this.hasCoreSession(context);
      if (hasCoreSession) {
        try {
          const { code } = await this.authenticationService.completeAuthFlow(req);
          const redirectUrl = buildPlatformRedirectUrl({
            baseUrl:
              this.idpOwoxConfig.idpConfig.platformSignInUrl ||
              '',
            code,
            state,
            params: context.platformParams,
          });
          logger.info('Fast-path completeAuthFlow redirectUrl', { redirectUrl });
          if (redirectUrl) {
            this.clearPlatformCookies(res);
            return res.redirect(redirectUrl.toString());
          }
        } catch (error) {
          logger.warn('Fast-path completeAuthFlow failed, falling back to BA page', {}, error as Error);
        }
      }
    }

    return this.pageService.signInPage.bind(this.pageService)(req, res);
  }

  async signOutMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.authenticationService.signOutMiddleware(req, res, next);
  }

  async accessTokenMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.coreIdp.accessTokenMiddleware(req, res, next);
  }

  //TODO: Delete this middleware
  async userApiMiddleware(req: Request, res: Response, _next: NextFunction): Promise<Response> {
    try {
      const validation = await this.authenticationService.validateSession(req);

      if (!validation.isValid || !validation.session) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await this.authenticationService.completeAuthFlow(req);
      logger.info('Auth flow payload sent', { state: result.payload.state });
      logger.info('Auth flow response', { code: result.code });

      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      logger.error('User API middleware error', {}, error as Error);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  async completeAuthFlowMiddleware(req: Request, res: Response, _next: NextFunction) {
    try {
      const context = buildAuthRequestContext(req);
      const validation = await this.authenticationService.validateSession(req);
      if (!validation.isValid || !validation.session) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await this.authenticationService.completeAuthFlow(req);
      logger.info('Auth flow payload sent', { state: result.payload.state });
      logger.info('Auth flow response', { code: result.code });
      const redirectUrl = buildPlatformRedirectUrl({
        baseUrl:
          this.idpOwoxConfig.idpConfig.platformSignInUrl ||
          '',
        code: result.code,
        state: result.payload.state || context.state || '',
        params: context.platformParams,
      });
      this.clearPlatformCookies(res);
      if (redirectUrl) {
        return res.redirect(redirectUrl.toString());
      }
      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      logger.error('Complete auth flow error', {}, error as Error);
      return res.status(500).json({ error: 'Failed to complete auth flow' });
    }
  }

  private clearStateCookie(res: Response): void {
    res.clearCookie('idp-owox-state', { path: '/' });
  }

  private clearPlatformCookies(res: Response): void {
    this.clearStateCookie(res);
    res.clearCookie('idp-owox-params', { path: '/' });
  }

  private async hasCoreSession(context: ReturnType<typeof buildAuthRequestContext>): Promise<boolean> {
    const refreshToken = context.refreshToken;
    if (!refreshToken) return false;
    try {
      await this.coreIdp.refreshToken(refreshToken);
      return true;
    } catch {
      return false;
    }
  }
}
