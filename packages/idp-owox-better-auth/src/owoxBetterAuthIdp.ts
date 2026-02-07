import { AuthResult, IdpProvider, Payload, Projects, ProtocolRoute } from '@owox/idp-protocol';
import { Logger, LoggerFactory } from '@owox/internal-helpers';
import cookieParser from 'cookie-parser';
import e, { Express, NextFunction } from 'express';
import { IdentityOwoxClient, TokenResponse } from './client/index.js';
import { createBetterAuthConfig } from './config/idp-better-auth-config.js';
import type { BetterAuthProviderConfig } from './config/index.js';
import { AuthenticationException, IdpFailedException } from './exception.js';
import { OwoxTokenFacade } from './facades/owox-token-facade.js';
import { AuthFlowService } from './services/auth-flow-service.js';
import { AuthenticationService } from './services/authentication-service.js';
import { CryptoService } from './services/crypto-service.js';
import { MagicLinkService } from './services/magic-link-service.js';
import { MiddlewareService } from './services/middleware-service.js';
import { PageService } from './services/page-service.js';
import { RequestHandlerService } from './services/request-handler-service.js';
import { UserContextService } from './services/user-context-service.js';
import type { DatabaseStore } from './store/DatabaseStore.js';
import { createDatabaseStore } from './store/DatabaseStoreFactory.js';
import { buildPlatformRedirectUrl } from './utils/platform-redirect-builder.js';
import {
  extractPlatformParams,
  extractRefreshToken,
  extractState,
  persistStateCookie,
} from './utils/request-utils.js';
import { formatError } from './utils/string-utils.js';

const COOKIE_NAME = 'refreshToken';

export class OwoxBetterAuthIdp implements IdpProvider {
  private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>;
  private readonly store: DatabaseStore;
  private readonly storeOwned: boolean;
  private readonly requestHandlerService: RequestHandlerService;
  private readonly pageService: PageService;
  private readonly authenticationService: AuthenticationService;
  private readonly middlewareService: MiddlewareService;
  private readonly identityClient: IdentityOwoxClient;
  private readonly logger: Logger;
  private readonly tokenFacade: OwoxTokenFacade;
  private readonly userContextService: UserContextService;
  private readonly authFlowService: AuthFlowService;

  private constructor(
    auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    store: DatabaseStore,
    private readonly config: BetterAuthProviderConfig,
    options?: { storeOwned?: boolean }
  ) {
    this.auth = auth;
    this.store = store;
    this.storeOwned = options?.storeOwned ?? true;
    this.identityClient = new IdentityOwoxClient(config.idpOwox.identityOwoxClientConfig);
    this.logger = LoggerFactory.createNamedLogger('OwoxBetterAuthIdp');
    this.tokenFacade = new OwoxTokenFacade(
      this.identityClient,
      this.store,
      this.config.idpOwox,
      this.logger,
      COOKIE_NAME
    );
    this.userContextService = new UserContextService(this.store, this.tokenFacade, this.logger);
    this.authFlowService = new AuthFlowService(this.config.idpOwox.identityOwoxClientConfig);

    const cryptoService = new CryptoService(this.auth);
    const magicLinkService = new MagicLinkService(this.auth);

    this.authenticationService = new AuthenticationService(
      this.auth,
      cryptoService,
      magicLinkService,
      this.store,
      this.userContextService,
      this.authFlowService
    );
    this.requestHandlerService = new RequestHandlerService(
      this.auth,
      this.authenticationService,
      this.config.idpOwox
    );
    this.pageService = new PageService(this.authenticationService);
    this.middlewareService = new MiddlewareService(
      this.authenticationService,
      this.pageService,
      this,
      this.config.idpOwox,
      this.store
    );
  }

  static async create(config: BetterAuthProviderConfig): Promise<OwoxBetterAuthIdp> {
    const store = createDatabaseStore(config.idpOwox.dbConfig);
    const adapter = await store.getAdapter();
    const auth = await createBetterAuthConfig(config.betterAuth, {
      adapter,
    });
    return new OwoxBetterAuthIdp(auth, store, config, { storeOwned: true });
  }

  async initialize(): Promise<void> {
    const { getMigrations } = await import('better-auth/db');
    const { runMigrations } = await getMigrations(this.auth.options);
    await this.store.initialize();
    await runMigrations();
  }

  registerRoutes(app: Express): void {
    app.use(e.json());
    app.use(e.urlencoded({ extended: true }));
    app.use(cookieParser());

    const tryPlatformFastPath = async (req: e.Request, res: e.Response): Promise<boolean> => {
      const state = extractState(req);
      const params = extractPlatformParams(req);
      const refreshToken = extractRefreshToken(req);
      if (params.source !== 'platform' || !state || !refreshToken) return false;
      try {
        const auth = await this.tokenFacade.refreshToken(refreshToken);
        if (auth.refreshToken && auth.refreshTokenExpiresIn !== undefined) {
          this.tokenFacade.setTokenToCookie(
            res,
            req,
            auth.refreshToken,
            auth.refreshTokenExpiresIn
          );
        }
        const { user: dbUser, account } = await this.userContextService.resolveFromToken(
          auth.accessToken
        );
        const flowPayload = {
          state,
          userInfo: {
            uid: account.accountId,
            signinProvider: account.providerId,
            email: dbUser.email,
          },
        };
        console.log('❤️❤️❤️ tryPlatformFastPath', flowPayload);
        const result = await this.authFlowService.completeAuthFlow(flowPayload);
        const redirectUrl = buildPlatformRedirectUrl({
          baseUrl: this.config.idpOwox.idpConfig.platformSignInUrl || '',
          code: result.code,
          state,
          params,
        });
        if (redirectUrl) {
          res.redirect(redirectUrl.toString());
          return true;
        }
      } catch (error) {
        this.logger.warn('Fast-path platform->app with refresh failed, fallback to signin page', {
          error,
        });
      }
      return false;
    };

    const ensureAppAuthRedirect = async (
      req: e.Request,
      res: e.Response,
      handler: () => Promise<void>
    ) => {
      const hasFlowParams =
        typeof req.query?.state === 'string' ||
        typeof req.query?.code === 'string' ||
        typeof req.query?.source === 'string';

      // Try fast-path if source=platform + state + refreshToken
      const fastPath = await tryPlatformFastPath(req, res);
      if (fastPath) return;

      // Already authorized and no flow params -> go home
      if (!hasFlowParams) {
        const refreshToken = req.cookies[COOKIE_NAME];
        if (refreshToken) {
          try {
            const auth = await this.tokenFacade.refreshToken(refreshToken);
            if (auth.refreshToken && auth.refreshTokenExpiresIn !== undefined) {
              this.tokenFacade.setTokenToCookie(
                res,
                req,
                auth.refreshToken,
                auth.refreshTokenExpiresIn
              );
            }
            return res.redirect('/');
          } catch {
            // ignore and fall through to page
          }
        }
      }

      return handler();
    };

    app.get(`/auth${ProtocolRoute.SIGN_IN}`, (req, res) =>
      ensureAppAuthRedirect(req, res, () => this.pageService.signInPage(req, res))
    );
    app.get(`/auth${ProtocolRoute.SIGN_UP}`, (req, res) =>
      ensureAppAuthRedirect(req, res, () => this.pageService.signUpPage(req, res))
    );

    this.requestHandlerService.setupBetterAuthHandler(app);
    this.pageService.registerRoutes(app);

    app.get(
      '/auth/idp-start',
      this.middlewareService.idpStartMiddleware.bind(this.middlewareService)
    );

    app.post(
      //TODO: change to {CONST}/api/signin
      '/auth/api/sign-in',
      this.authenticationService.signInMiddleware.bind(this.authenticationService)
    );
    app.post(
      //TODO: change to {CONST}/api/signup
      '/auth/api/sign-up',
      this.authenticationService.signUpMiddleware.bind(this.authenticationService)
    );
    app.post(
      '/auth/api/password-remind',
      this.authenticationService.passwordRemindMiddleware.bind(this.authenticationService)
    );

    // app.post(
    //   '/auth/api/auth-flow/complete',
    //   this.middlewareService.completeAuthFlowMiddleware.bind(this.middlewareService)
    // );

    // Core callback route (PKCE code exchange)
    app.get(this.config.idpOwox.idpConfig.callbackUrl, async (req, res) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      const redirectTo =
        (req.query['redirect-to'] as string | undefined) ||
        (req.query.redirectTo as string | undefined);
      const appRedirectTo = req.query['app-redirect-to'] as string | undefined;
      if (!code) {
        this.logger.warn('Redirect url should contain code param');
        return res.redirect(`/auth${ProtocolRoute.SIGN_IN}`);
      }

      if (!state) {
        this.logger.warn('Redirect url should contain state param');
        return res.redirect(`/auth${ProtocolRoute.SIGN_IN}`);
      }

      try {
        const response: TokenResponse = await this.tokenFacade.changeAuthCode(code, state);
        this.tokenFacade.setTokenToCookie(
          res,
          req,
          response.refreshToken,
          response.refreshTokenExpiresIn
        );
        const target =
          appRedirectTo ||
          redirectTo ||
          this.config.idpOwox.idpConfig.platformSignInUrl ||
          `/auth${ProtocolRoute.SIGN_IN}`;
        res.redirect(target);
      } catch (error: unknown) {
        if (error instanceof AuthenticationException) {
          this.logger.info(formatError(error), {
            context: error.name,
            params: error.context,
            cause: error.cause,
          });
        } else if (error instanceof IdpFailedException) {
          this.logger.error(
            'Token Exchange callback failed with unexpected code',
            error.context,
            error.cause
          );
        } else {
          this.logger.error(formatError(error));
        }
        return res.redirect(`/auth${ProtocolRoute.SIGN_IN}`);
      }
    });
  }

  async signInMiddleware(
    req: e.Request,
    res: e.Response,
    next: NextFunction
  ): Promise<void | e.Response> {
    const incomingState = extractState(req);
    if (incomingState) {
      persistStateCookie(req, res, incomingState);
      return this.middlewareService.signInMiddleware(req, res, next);
    }

    return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignInUrl);
  }

  async signUpMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    const incomingState = extractState(req);
    if (incomingState) {
      persistStateCookie(req, res, incomingState);
      return this.pageService.signUpPage.bind(this.pageService)(req, res);
    }

    return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignUpUrl);
  }

  async signOutMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    const refreshToken = extractRefreshToken(req);
    if (refreshToken) {
      await this.revokeToken(refreshToken);
    }
    res.clearCookie(COOKIE_NAME);
    res.redirect(`/auth${ProtocolRoute.SIGN_IN}`);
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

  async introspectToken(token: string): Promise<Payload | null> {
    return this.tokenFacade.introspectToken(token);
  }

  async parseToken(token: string): Promise<Payload | null> {
    return this.tokenFacade.parseToken(token);
  }

  async verifyToken(token: string): Promise<Payload | null> {
    return this.tokenFacade.verifyToken(token);
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    return this.tokenFacade.refreshToken(refreshToken);
  }

  async revokeToken(token: string): Promise<void> {
    await this.tokenFacade.revokeToken(token);
  }

  async accessTokenMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    return this.tokenFacade.accessTokenMiddleware(req, res, _next);
  }

  async shutdown(): Promise<void> {
    if (this.storeOwned) {
      try {
        await this.store.shutdown();
      } catch (error) {
        LoggerFactory.createNamedLogger('OwoxBetterAuthIdp').error(
          'Failed to shutdown BetterAuth store',
          {},
          error as Error
        );
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.store.isHealthy();
  }

  private async redirectToPlatform(
    req: e.Request,
    res: e.Response,
    authUrl: string
  ): Promise<void | e.Response> {
    const platformUrl = new URL(authUrl);
    platformUrl.searchParams.set('source', 'app');
    const params = extractPlatformParams(req);
    if (params.redirectTo) platformUrl.searchParams.set('redirect-to', params.redirectTo);
    if (params.appRedirectTo) platformUrl.searchParams.set('app-redirect-to', params.appRedirectTo);
    if (params.projectId) platformUrl.searchParams.set('projectId', params.projectId);
    return res.redirect(platformUrl.toString());
  }
}
