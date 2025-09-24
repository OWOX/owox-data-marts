import { AuthResult, IdpProvider, Payload, Projects, ProtocolRoute } from '@owox/idp-protocol';
import e, { NextFunction } from 'express';
import { ILogger, LoggerFactory } from '@owox/internal-helpers';
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
  private readonly logger: ILogger;

  constructor(private readonly config: IdpOwoxConfig) {
    this.store = createAuthorizationStore(config.dbConfig);
    this.identityClient = new IdentityOwoxClient(config.identityOwoxClientConfig);
    this.logger = LoggerFactory.createNamedLogger('OwoxIdp');
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
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    const { codeVerifier, codeChallenge } = await generatePkce();
    const state = generateState();
    const clientId = this.config.idpConfig.clientId;

    const expiresAt = new Date(Date.now() + ms('1m'));
    await this.store.save(state, codeVerifier, expiresAt);

    const signInUrl = new URL(this.config.idpConfig.platformSignInUrl);
    const params = signInUrl.searchParams;
    params.set('state', state);
    params.set('codeChallenge', codeChallenge);
    params.set('clientId', clientId);

    const projectId = (req.query?.projectId as string | undefined)?.toString();
    if (projectId) {
      params.set('projectId', projectId);
    }
    res.redirect(signInUrl.toString());
  }

  async signOutMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    const refreshToken = req.cookies[COOKIE_NAME];
    if (refreshToken) {
      await this.revokeToken(refreshToken);
    }
    res.clearCookie(COOKIE_NAME);
    res.redirect(ProtocolRoute.SIGN_IN);
  }

  async userApiMiddleware(req: e.Request, res: e.Response): Promise<e.Response<Payload>> {
    const accessToken = req.headers['x-owox-authorization'] as string | undefined;
    if (!accessToken) {
      return res.status(401).json({ message: 'Unauthorized', reason: 'uam1' });
    }

    const payload: Payload | null = await this.parseToken(accessToken);

    if (!payload) {
      return res.status(401).json({ message: 'Unauthorized', reason: 'uam2' });
    }
    return res.json(payload);
  }

  async projectsApiMiddleware(req: e.Request, res: e.Response): Promise<e.Response<Projects>> {
    const accessToken = req.headers['x-owox-authorization'] as string | undefined;
    if (!accessToken) {
      return res.status(401).json({ message: 'Unauthorized', reason: 'pam1' });
    }

    const projects: Projects = await this.identityClient.getProjects(accessToken);

    return res.json(projects);
  }

  async accessTokenMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    try {
      const refreshToken = req.cookies[COOKIE_NAME];
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
      this.logger.error(this.formatError(error));
      res.clearCookie(COOKIE_NAME);
      return res.json({ reason: 'atm4' });
    }
  }

  registerRoutes(app: e.Express): void {
    app.get(this.config.idpConfig.callbackUrl, async (req, res) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      if (!code) {
        this.logger.warn('Redirect url should contain code param');
        return res.redirect(ProtocolRoute.SIGN_IN);
      }

      if (!state) {
        this.logger.warn('Redirect url should contain state param');
        return res.redirect(ProtocolRoute.SIGN_IN);
      }

      try {
        const response: TokenResponse = await this.changeAuthCode(code, state);
        this.setTokenToCookie(res, req, response.refreshToken, response.refreshTokenExpiresIn);
        res.redirect('/');
      } catch (error: unknown) {
        this.logger.error(this.formatError(error));
        return res.redirect(ProtocolRoute.SIGN_IN);
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
    const isSecure =
      req.protocol !== 'http' && !(req.hostname === 'localhost' || req.hostname === '127.0.0.1');
    res.cookie(COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: expiresIn * 1000,
      path: '/',
    });
  }

  private normalizeToken(authorization: string) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return `${error.message}\n${error.stack ?? ''}`;
    }

    return String(error);
  }
}
