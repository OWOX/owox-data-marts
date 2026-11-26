import { AuthResult, Payload } from '@owox/idp-protocol';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  IdentityOwoxClient,
  IntrospectionRequest,
  IntrospectionResponse,
  MicrosoftExtensionIdentityExchangeRequest,
  RevocationRequest,
  TokenRequest,
  TokenResponse,
} from '../client/index.js';
import type { IdpOwoxConfig } from '../config/index.js';
import { CORE_REFRESH_TOKEN_COOKIE } from '../core/constants.js';
import {
  AuthenticationException,
  ForbiddenException,
  IdpFailedException,
} from '../core/exceptions.js';
import { createServiceLogger } from '../core/logger.js';
import { toPayload } from '../mappers/client-payload-mapper.js';
import { TokenService, type TokenServiceConfig } from '../services/core/token-service.js';
import type { DatabaseStore } from '../store/database-store.js';
import { StoreReason } from '../store/store-result.js';
import { buildCookieOptions } from '../utils/cookie-policy.js';
import type { AuthFlowParams } from '../utils/request-utils.js';

const ProjectSwitchSchema = z.object({
  projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  expectedUserId: z.string().min(1),
});

export type TokenResponseWithContext = TokenResponse & {
  authFlowParams?: AuthFlowParams;
};

/**
 * Wraps Identity OWOX token operations and refresh-token cookies.
 */
export class OwoxTokenFacade {
  private readonly logger = createServiceLogger(OwoxTokenFacade.name);
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

  async changeAuthCode(code: string, state: string): Promise<TokenResponseWithContext> {
    const res = await this.store.getAuthState(state);
    if (!res.code) {
      if (res.reason == StoreReason.EXPIRED) {
        throw new AuthenticationException('Code verifier has expired');
      }
      throw new IdpFailedException(`Code verifier is not available: ${res.reason ?? 'unknown'}`);
    }

    const tokenResponse = await this.exchangeAuthCode(code, res.code);
    return {
      ...tokenResponse,
      authFlowParams: res.authFlowParams,
    };
  }

  async exchangeAuthCode(code: string, codeVerifier: string): Promise<TokenResponse> {
    const request: TokenRequest = {
      grantType: 'authorization_code',
      authCode: code,
      codeVerifier,
      clientId: this.config.idpConfig.clientId,
    };

    return this.identityClient.getToken(request);
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

  /**
   * Exchange Google ID Token from Google Sheets Extension for OWOX access and refresh tokens
   */
  async exchangeGoogleIdToken(googleIdToken: string, projectId?: string): Promise<AuthResult> {
    const response = await this.identityClient.exchangeGoogleIdentityToken({
      googleIdentityToken: googleIdToken,
      ...(projectId && { biProjectId: projectId }),
    });

    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      accessTokenExpiresIn: response.accessTokenExpiresIn,
      refreshTokenExpiresIn: response.refreshTokenExpiresIn,
    };
  }

  async exchangeMicrosoftExtensionIdentity(
    request: MicrosoftExtensionIdentityExchangeRequest
  ): Promise<AuthResult> {
    const response = await this.identityClient.exchangeMicrosoftExtensionIdentity(request);
    return OwoxTokenFacade.toAuthResult(response);
  }

  async refreshExtensionProjectToken(refreshToken: string): Promise<AuthResult> {
    await this.assertExtensionProjectToken(refreshToken);
    return this.refreshToken(refreshToken);
  }

  async revokeExtensionProjectToken(refreshToken: string): Promise<void> {
    await this.assertExtensionProjectToken(refreshToken);
    const revoked = await this.requestTokenRevocation(refreshToken);
    if (!revoked) {
      throw new IdpFailedException('Failed to revoke extension project token');
    }
  }

  async revokeToken(token: string): Promise<void> {
    await this.requestTokenRevocation(token);
  }

  private async requestTokenRevocation(token: string): Promise<boolean> {
    const request: RevocationRequest = { token: token, tokenType: 'refresh_token' };
    const response = await this.identityClient.revokeToken(request);
    return response.success;
  }

  async switchProjectMiddleware(req: Request, res: Response): Promise<void> {
    res.set('Cache-Control', 'no-store');
    const host = req.get('host');
    if (!host || req.get('origin') !== `${req.protocol}://${host}`) {
      res.sendStatus(403);
      return;
    }
    const input = ProjectSwitchSchema.safeParse(req.body);
    if (!input.success) {
      res.sendStatus(400);
      return;
    }
    const refreshToken: unknown = req.cookies[this.cookieName];
    if (typeof refreshToken !== 'string' || !refreshToken) {
      res.sendStatus(401);
      return;
    }

    try {
      const tokens = await this.identityClient.switchProject(
        refreshToken,
        this.config.idpConfig.clientId,
        input.data.projectId,
        input.data.expectedUserId
      );
      this.setTokenToCookie(res, req, tokens.refreshToken, tokens.refreshTokenExpiresIn);
      res.sendStatus(204);
    } catch (error) {
      if (error instanceof AuthenticationException) {
        res.sendStatus(401);
      } else if (error instanceof ForbiddenException) {
        res.sendStatus(403);
      } else {
        this.logger.warn('Could not switch App project');
        res.sendStatus(502);
      }
    }
  }

  async accessTokenMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    res.set('Cache-Control', 'no-store');
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
      // A rejected cookie may already have been replaced by a successful refresh or switch.
      if (error instanceof ForbiddenException) {
        this.logger.info('Access token middleware - identity blocked', {
          path: req.path,
        });
        return res.json({ reason: 'atm9', message: 'Identity inactive or blocked' });
      }
      if (error instanceof AuthenticationException) {
        this.logger.info('Access token middleware auth rejected', {
          path: req.path,
        });
        return res.json({ reason: 'atm4', message: 'Unauthorized' });
      }

      if (error instanceof IdpFailedException) {
        this.logger.error('Access token refresh failed upstream', {
          path: req.path,
          status: error.status,
        });
        return res.status(error.status || 500).json({ reason: 'atm5' });
      }

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

  private static toAuthResult(response: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
  }): AuthResult {
    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      accessTokenExpiresIn: response.accessTokenExpiresIn,
      refreshTokenExpiresIn: response.refreshTokenExpiresIn,
    };
  }

  private async assertExtensionProjectToken(token: string): Promise<void> {
    const payload = await this.tokenService.parse(token);
    if (payload?.authFlow !== 'extension') {
      throw new AuthenticationException('Token was not issued for extension project auth', {
        description: 'invalid_project_refresh_token',
      });
    }
  }
}
