import { AuthResult, IdpProvider, Payload } from '@owox/idp-protocol';
import e, { NextFunction } from 'express';
import { IdpOwoxConfig } from './config';
import { AuthorizationStore } from './auth/AuthorizationStore';
import {
  IdentityOwoxClient,
  IntrospectionRequest,
  IntrospectionResponse,
  RevocationRequest,
  TokenRequest,
  TokenResponse,
} from './client';
import { createAuthorizationStore } from './auth/AuthorizationStoreFactory';
import { parseToken, ParseTokenConfig } from './token/parseToken';
import { generatePkce, generateState } from './pkce';
import { toPayload } from './mappers/idpOwoxPayloadToPayloadMapper';
import ms from 'ms';

const COOKIE_NAME = 'refreshToken';

export class OwoxIdp implements IdpProvider {
  private readonly store: AuthorizationStore;
  private readonly identityClient: IdentityOwoxClient;

  constructor(private readonly config: IdpOwoxConfig) {
    this.store = createAuthorizationStore(config.dbConfig);
    this.identityClient = new IdentityOwoxClient(config.identityOwoxClientConfig);
  }

  initialize(): Promise<void> {
    return this.store.initialize();
  }

  async introspectToken(token: string): Promise<Payload | null> {
    const request: IntrospectionRequest = { token: token };
    const response: IntrospectionResponse = await this.identityClient.introspectToken(request);

    if (!response.isActive) {
      return null;
    }

    return toPayload(response);
  }

  parseToken(token: string): Promise<Payload | null> {
    const config: ParseTokenConfig = {
      jwtKeyCacheTtl: this.config.jwtConfig.jwtKeyCacheTtl,
      clockTolerance: this.config.jwtConfig.clockTolerance,
      expectedIss: this.config.jwtConfig.issuer,
      algorithm: this.config.jwtConfig.algorithm,
    };
    return parseToken(this.normalizeToken(token), this.identityClient, config);
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

  shutdown(): Promise<void> {
    return this.store.shutdown();
  }

  async signInMiddleware(
    _req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    const { codeVerifier, codeChallenge } = await generatePkce();
    const state = generateState();
    const clientId = this.config.idpConfig.clientId;

    const expiresAt = new Date(Date.now() + ms('1m'));
    await this.store.save(state, codeVerifier, expiresAt);

    const url = `${this.config.idpConfig.platformSignInUrl}?state=${state}&codeChallenge=${codeChallenge}&clientId=${clientId}`;
    res.redirect(url);
  }

  async signOutMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    await this.revokeToken(req.cookies[COOKIE_NAME]);
    res.clearCookie(COOKIE_NAME);
    res.redirect(this.config.idpConfig.appSignInUrl);
  }

  async userApiMiddleware(req: e.Request, res: e.Response): Promise<e.Response<Payload>> {
    if (!req.headers.authorization) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token: Payload | null = await this.parseToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    return res.json(token);
  }

  async accessTokenMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    try {
      const auth = await this.refreshToken(req.cookies[COOKIE_NAME]);
      const refreshToken = auth.refreshToken;
      if (!refreshToken) {
        return res.json(null);
      }

      if (!auth.refreshTokenExpiresIn) {
        return res.json(null);
      }

      this.setTokenToCookie(res, req, refreshToken, auth.refreshTokenExpiresIn);
      return res.json(auth);
    } catch (e: unknown) {
      console.log('access token error occurred', e);
      res.clearCookie(COOKIE_NAME);
      return res.json(null);
    }
  }

  registerRoutes(app: e.Express): void {
    app.get(this.config.idpConfig.callbackUrl, async (req, res) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      if (!code) {
        return res.status(400).json({ reason: 'Redirect url should contain code param' });
      }

      if (!state) {
        return res.status(400).json({ reason: 'Redirect url should contain state param' });
      }

      try {
        const response: TokenResponse = await this.changeAuthCode(code, state);
        this.setTokenToCookie(res, req, response.refreshToken, response.refreshTokenExpiresIn);
        res.redirect('/');
      } catch (e: unknown) {
        return res.status(400).json({ reason: e instanceof Error ? e.message : 'Unknown' });
      }
    });
  }

  private async changeAuthCode(code: string, state: string): Promise<TokenResponse> {
    const codeVerifier = await this.store.get(state);
    if (!codeVerifier) {
      throw Error('Code verifier is empty');
    }

    const request: TokenRequest = {
      grantType: 'authorization_code',
      authCode: code,
      codeVerifier: codeVerifier,
      clientId: this.config.idpConfig.clientId,
    };

    return await this.identityClient.getToken(request);
  }

  private setTokenToCookie(
    res: e.Response,
    req: e.Request,
    refreshToken: string,
    expiresIn: number
  ) {
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    res.cookie(COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: 'lax',
      maxAge: expiresIn * 1000,
      path: '/',
    });
  }

  private normalizeToken(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }
}
