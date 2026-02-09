import { Logger } from '@owox/internal-helpers';
import { ProtocolRoute } from '@owox/idp-protocol';
import type { Request, Response } from 'express';
import type { IdpOwoxConfig } from '../config/idp-owox-config.js';
import type { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import { AuthFlowService, type UserInfoPayload } from './auth-flow-service.js';
import type { AuthenticationService } from './authentication-service.js';
import { buildPlatformRedirectUrl } from '../utils/platform-redirect-builder.js';
import { StateManager, clearAllAuthCookies, type PlatformParams } from '../utils/request-utils.js';
import { formatError } from '../utils/string-utils.js';
import { SOURCE } from '../constants.js';
import { UserContextService } from './user-context-service.js';
import { buildUserInfoPayload } from '../mappers/user-info-payload-builder.js';
import { isStateExpiredError } from '../exception.js';

/**
 * Orchestrates PKCE completion for Platform using core tokens or social login.
 */
export class FlowCompletionService {
  constructor(
    private readonly idpOwoxConfig: IdpOwoxConfig,
    private readonly tokenFacade: OwoxTokenFacade,
    private readonly userContextService: UserContextService,
    private readonly authFlowService: AuthFlowService,
    private readonly authenticationService: AuthenticationService,
    private readonly logger: Logger
  ) {}

  /**
   * Creates a local sign-in URL for fallback redirects.
   */
  private buildLocalSignInUrl(_req: Request): URL {
    return new URL(`/auth${ProtocolRoute.SIGN_IN}`, this.idpOwoxConfig.baseUrl);
  }

  /**
   * Completes auth flow using Identity refresh token (platform fast-path).
   */
  async completeWithIdentityRefreshToken(
    refreshToken: string,
    params: PlatformParams,
    req: Request,
    res: Response
  ): Promise<URL | null> {
    const stateManager = new StateManager(req);
    const state = stateManager.extract();
    if (!state) {
      this.logger.warn('Missing or mismatched state for identity refresh flow');
      return null;
    }
    try {
      const auth = await this.tokenFacade.refreshToken(refreshToken);
      if (auth.refreshToken && auth.refreshTokenExpiresIn !== undefined) {
        this.tokenFacade.setTokenToCookie(res, req, auth.refreshToken, auth.refreshTokenExpiresIn);
      }

      const { user, account } = await this.userContextService.resolveFromToken(auth.accessToken);
      const payload: UserInfoPayload = buildUserInfoPayload({
        state,
        user,
        account,
      });

      const result = await this.authFlowService.completeAuthFlow(payload);
      const redirectUrl = buildPlatformRedirectUrl({
        baseUrl: this.idpOwoxConfig.idpConfig.platformSignInUrl,
        code: result.code,
        state,
        params,
        defaultSource: SOURCE.APP,
        allowedRedirectOrigins: this.idpOwoxConfig.idpConfig.allowedRedirectOrigins,
      });
      if (!redirectUrl) {
        this.logger.warn('Failed to build redirect URL after identity refresh');
      }
      return redirectUrl;
    } catch (error) {
      if (isStateExpiredError(error)) {
        clearAllAuthCookies(res, req);
        return this.buildLocalSignInUrl(req);
      }
      this.logger.warn('Platform fast-path failed, will fallback to UI', { error: formatError(error) });
      return null;
    }
  }

  /**
   * Completes auth flow using Better Auth session token received from handler response.
   */
  async completeWithSocialSessionToken(
    sessionToken: string,
    params: PlatformParams,
    req: Request,
    res: Response
  ): Promise<URL | null> {
    const stateManager = new StateManager(req);
    const state = stateManager.extractFromCookie();
    if (!state) {
      this.logger.warn('Missing or mismatched state for social login flow');
      clearAllAuthCookies(res, req);
      return this.buildLocalSignInUrl(req);
    }
    try {
      const { code, payload } = await this.authenticationService.completeAuthFlowWithSessionToken(
        sessionToken,
        state
      );
      const finalState = payload.state || state;
      const redirectUrl = buildPlatformRedirectUrl({
        baseUrl: this.idpOwoxConfig.idpConfig.platformSignInUrl,
        code,
        state: finalState || '',
        params,
        defaultSource: SOURCE.APP,
        allowedRedirectOrigins: this.idpOwoxConfig.idpConfig.allowedRedirectOrigins,
      });
      if (redirectUrl) {
        clearAllAuthCookies(res, req);
        return redirectUrl;
      }
    } catch (error) {
      if (isStateExpiredError(error)) {
        clearAllAuthCookies(res, req);
        return this.buildLocalSignInUrl(req);
      }
      this.logger.warn('Auto-complete auth flow on callback failed', { error: formatError(error) });
      clearAllAuthCookies(res, req);
      return null;
    }
    return null;
  }
}
