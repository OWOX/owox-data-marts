import { AuthResult, Payload } from '@owox/idp-protocol';
import { NextFunction, Request, Response } from 'express';
import {
  IdentityOwoxClient,
  IntrospectionRequest,
  IntrospectionResponse,
  RevocationRequest,
  TokenRequest,
  TokenResponse,
} from '../client/index.js';
import type { IdpOwoxConfig } from '../config/idp-owox-config.js';
import { CORE_REFRESH_TOKEN_COOKIE } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { AuthenticationException, IdpFailedException } from '../core/exceptions.js';
import { toPayload } from '../mappers/client-payload-mapper.js';
import { TokenService, type TokenServiceConfig } from '../services/core/token-service.js';
import type { DatabaseStore } from '../store/database-store.js';
import { StoreReason } from '../store/store-result.js';
import { buildCookieOptions, clearCookie } from '../utils/cookie-policy.js';

/**
 * Wraps Identity OWOX token operations and refresh-token cookies.
 */
export class OwoxTokenFacade {
  private readonly tokenService: TokenService;

  constructor(
    private readonly identityClient: IdentityOwoxClient,
    private readonly store: DatabaseStore,
    private readonly config: IdpOwoxConfig,
    private readonly cookieName: string = CORE_REFRESH_TOKEN_COOKIE
  ) {
    const tokenCfg: TokenServiceConfig = {
      algorithm: this.config.jwtConfig.algorithm,
      clockTolerance: this.config.jwtConfig.clockTolerance,
      issuer: this.config.jwtConfig.issuer,
      jwtKeyCacheTtl: this.config.jwtConfig.jwtKeyCacheTtl,
    };
    this.tokenService = new TokenService(this.identityClient, tokenCfg);
  }

  async changeAuthCode(code: string, state: string): Promise<TokenResponse> {
    const res = await this.store.getAuthState(state);
    if (!res.code) {
      if (res.reason == StoreReason.EXPIRED) {
        throw new AuthenticationException('Code verifier has expired');
      }
      throw new IdpFailedException(`Code verifier is not available: ${res.reason ?? 'unknown'}`);
    }

    const request: TokenRequest = {
      grantType: 'authorization_code',
      authCode: code,
      codeVerifier: res.code,
      clientId: this.config.idpConfig.clientId,
    };

    return await this.identityClient.getToken(request);
  }

  async introspectToken(token: string): Promise<Payload | null> {
    const request: IntrospectionRequest = { token: token };
    const response: IntrospectionResponse = await this.identityClient.introspectToken(request);

    if (!response.isActive) {
      return null;
    }

    return toPayload(response);
  }

  async parseToken(token: string): Promise<Payload | null> {
    return this.tokenService.parse(token);
  }

  async verifyToken(token: string): Promise<Payload | null> {
    return this.tokenService.parse(token);
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const request: TokenRequest = {
      grantType: 'refresh_token',
      refreshToken: refreshToken,
      clientId: this.config.idpConfig.clientId,
    };

    const response: TokenResponse = await this.identityClient.getToken(request);

    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      accessTokenExpiresIn: response.accessTokenExpiresIn,
      refreshTokenExpiresIn: response.refreshTokenExpiresIn,
    };
  }

  async revokeToken(token: string): Promise<void> {
    const request: RevocationRequest = { token: token, tokenType: 'refresh_token' };
    await this.identityClient.revokeToken(request);
  }

  async accessTokenMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    try {
      const refreshToken = req.cookies[this.cookieName];
      if (!refreshToken) {
        return res.json({ reason: 'atm1' });
      }
      const auth = await this.refreshToken(refreshToken);

      const newRefreshToken = auth.refreshToken;
      if (!newRefreshToken) {
        return res.json({ reason: 'atm2' });
      }

      if (!auth.refreshTokenExpiresIn) {
        return res.json({ reason: 'atm3' });
      }

      this.setTokenToCookie(res, req, newRefreshToken, auth.refreshTokenExpiresIn);
      return res.json(auth);
    } catch (error: unknown) {
      clearCookie(res, this.cookieName, req);
      if (error instanceof AuthenticationException) {
        logger.info(this.tokenService.formatError(error), {
          context: error.name,
          params: error.context,
          cause: error.cause,
        });
        return res.status(401).json({ reason: 'atm4', message: 'Unauthorized' });
      }

      if (error instanceof IdpFailedException) {
        logger.error(
          'Access Token middleware failed with unexpected code',
          error.context,
          error.cause
        );
        return res.json({ reason: 'atm5' });
      }

      logger.error(this.tokenService.formatError(error));
      return res.status(502).json({ reason: 'atm6' });
    }
  }

  setTokenToCookie(res: Response, req: Request, refreshToken: string, expiresIn: number) {
    res.cookie(
      this.cookieName,
      refreshToken,
      buildCookieOptions(req, { maxAgeMs: expiresIn * 1000 })
    );
  }
}
