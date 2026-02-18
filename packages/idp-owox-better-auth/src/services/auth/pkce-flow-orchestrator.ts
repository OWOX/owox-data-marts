import { ProtocolRoute } from '@owox/idp-protocol';
import { Logger } from '@owox/internal-helpers';
import type { Request, Response } from 'express';
import type { IdpOwoxConfig } from '../../config/idp-owox-config.js';
import { CORE_REFRESH_TOKEN_COOKIE, SOURCE } from '../../core/constants.js';
import { AuthenticationException, isStateExpiredError } from '../../core/exceptions.js';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import { buildUserInfoPayload } from '../../mappers/user-info-payload-builder.js';
import { clearCookie } from '../../utils/cookie-policy.js';
import { formatError } from '../../utils/email-utils.js';
import { buildPlatformRedirectUrl } from '../../utils/platform-redirect-builder.js';
import {
  clearAllAuthCookies,
  clearBetterAuthCookies,
  extractState,
  extractStateFromCookie,
  type PlatformParams,
} from '../../utils/request-utils.js';
import type { BetterAuthSessionService } from '../auth/better-auth-session-service.js';
import type { UserContextService } from '../core/user-context-service.js';
import { PlatformAuthFlowClient, type UserInfoPayload } from './platform-auth-flow-client.js';

/**
 * Orchestrates PKCE completion for Platform using core tokens or social login.
 */
export class PkceFlowOrchestrator {
  constructor(
    private readonly idpOwoxConfig: IdpOwoxConfig,
    private readonly tokenFacade: OwoxTokenFacade,
    private readonly userContextService: UserContextService,
    private readonly platformAuthFlowClient: PlatformAuthFlowClient,
    private readonly betterAuthSessionService: BetterAuthSessionService,
    private readonly logger: Logger
  ) {}

  /**
   * Revokes refresh token and clears auth cookies before redirecting to sign-in.
   */
  private async revokeRefreshTokenAndClearCookies(
    refreshToken: string,
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      if (refreshToken) {
        await this.tokenFacade.revokeToken(refreshToken);
      }
    } catch (revokeError) {
      this.logger.warn('Failed to revoke refresh token during user-context recovery', {
        error: formatError(revokeError),
      });
    }
    clearCookie(res, CORE_REFRESH_TOKEN_COOKIE, req);
    clearBetterAuthCookies(res, req);
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
    const state = extractState(req);
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

      const result = await this.platformAuthFlowClient.completeAuthFlow(payload);
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
        return new URL(`/auth${ProtocolRoute.SIGN_IN}`, this.idpOwoxConfig.baseUrl);
      }
      if (error instanceof AuthenticationException) {
        this.logger.warn('Failed to resolve user from access token, redirecting to sign-in', {
          error: formatError(error),
        });
        await this.revokeRefreshTokenAndClearCookies(refreshToken, req, res);
        return new URL(`/auth${ProtocolRoute.SIGN_IN}`, this.idpOwoxConfig.baseUrl);
      }
      this.logger.warn('Platform fast-path failed, will fallback to UI', {
        error: formatError(error),
      });
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
    res: Response,
    callbackProviderId?: string
  ): Promise<URL | null> {
    const isMagicLinkVerify = req.path?.includes('/magic-link/verify');
    if (isMagicLinkVerify) {
      return null;
    }

    const state = extractStateFromCookie(req);
    if (!state) {
      this.logger.warn('Missing or mismatched state for social login flow');
      clearAllAuthCookies(res, req);
      return new URL(`/auth${ProtocolRoute.SIGN_IN}`, this.idpOwoxConfig.baseUrl);
    }
    try {
      const { code, payload } =
        await this.betterAuthSessionService.completeAuthFlowWithSessionToken(
          sessionToken,
          state,
          callbackProviderId
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
        return new URL(`/auth${ProtocolRoute.SIGN_IN}`, this.idpOwoxConfig.baseUrl);
      }
      this.logger.warn('Auto-complete auth flow on callback failed', { error: formatError(error) });
      clearAllAuthCookies(res, req);
      return null;
    }
    return null;
  }
}
