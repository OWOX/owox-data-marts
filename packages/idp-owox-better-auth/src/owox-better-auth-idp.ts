import {
  AuthResult,
  IdpProvider,
  Payload,
  ProjectMember,
  Projects,
  ProtocolRoute,
} from '@owox/idp-protocol';
import { Logger, LoggerFactory } from '@owox/internal-helpers';
import cookieParser from 'cookie-parser';
import e, { Express, NextFunction } from 'express';
import { IdentityOwoxClient, TokenResponse } from './client/index.js';
import { createBetterAuthConfig } from './config/idp-better-auth-config.js';
import type { BetterAuthProviderConfig } from './config/index.js';
import { CORE_REFRESH_TOKEN_COOKIE, SOURCE } from './core/constants.js';
import { AuthenticationException, IdpFailedException } from './core/exceptions.js';
import { OwoxTokenFacade } from './facades/owox-token-facade.js';
import { BetterAuthSessionService } from './services/auth/better-auth-session-service.js';
import { PkceFlowOrchestrator } from './services/auth/pkce-flow-orchestrator.js';
import { PlatformAuthFlowClient } from './services/auth/platform-auth-flow-client.js';
import { UserContextService } from './services/core/user-context-service.js';
import { MiddlewareService } from './services/middleware/middleware-service.js';
import { RequestHandlerService } from './services/middleware/request-handler-service.js';
import { PageService } from './services/rendering/page-service.js';
import { createDatabaseStore } from './store/database-store-factory.js';
import type { DatabaseStore } from './store/database-store.js';
import { clearCookie } from './utils/cookie-policy.js';
import { buildPlatformEntryUrl } from './utils/platform-redirect-builder.js';
import {
  clearBetterAuthCookies,
  clearPlatformCookies,
  extractPlatformParams,
  extractRefreshToken,
  getStateManager,
} from './utils/request-utils.js';
import { formatError } from './utils/string-utils.js';

/**
 * Main IdP implementation that wires core PKCE flow and Better Auth.
 */
export class OwoxBetterAuthIdp implements IdpProvider {
  private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>;
  private readonly store: DatabaseStore;
  private readonly requestHandlerService: RequestHandlerService;
  private readonly pageService: PageService;
  private readonly betterAuthSessionService: BetterAuthSessionService;
  private readonly middlewareService: MiddlewareService;
  private readonly identityClient: IdentityOwoxClient;
  private readonly logger: Logger;
  private readonly tokenFacade: OwoxTokenFacade;
  private readonly userContextService: UserContextService;
  private readonly platformAuthFlowClient: PlatformAuthFlowClient;
  private readonly pkceFlowOrchestrator: PkceFlowOrchestrator;

  private constructor(
    auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    store: DatabaseStore,
    private readonly config: BetterAuthProviderConfig
  ) {
    this.auth = auth;
    this.store = store;
    this.identityClient = new IdentityOwoxClient(config.idpOwox.identityOwoxClientConfig);
    this.logger = LoggerFactory.createNamedLogger('OwoxBetterAuthIdp');
    this.tokenFacade = new OwoxTokenFacade(
      this.identityClient,
      this.store,
      this.config.idpOwox,
      this.logger,
      CORE_REFRESH_TOKEN_COOKIE
    );
    this.userContextService = new UserContextService(this.store, this.tokenFacade, this.logger);
    this.platformAuthFlowClient = new PlatformAuthFlowClient(this.identityClient);

    this.betterAuthSessionService = new BetterAuthSessionService(
      this.auth,
      this.store,
      this.platformAuthFlowClient
    );
    this.pkceFlowOrchestrator = new PkceFlowOrchestrator(
      this.config.idpOwox,
      this.tokenFacade,
      this.userContextService,
      this.platformAuthFlowClient,
      this.betterAuthSessionService,
      this.logger
    );
    this.requestHandlerService = new RequestHandlerService(this.auth, this.pkceFlowOrchestrator);
    this.pageService = new PageService();
    this.middlewareService = new MiddlewareService(
      this.pageService,
      this.config.idpOwox,
      this.store,
      this.pkceFlowOrchestrator
    );
  }
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    this.logger.debug(`Getting project members for project ${projectId}`);
    const response = await this.identityClient.getProjectMembers(projectId);

    if (!response.projectMembers || response.projectMembers.length === 0) {
      return [];
    }
    return response.projectMembers.map(member => ({
      userId: String(member.userId),
      email: member.email,
      fullName: member.fullName || undefined,
      avatar: member.avatar || undefined,
      projectRole: member.projectRole,
      userStatus: member.userStatus,
      hasNotificationsEnabled: member.subscriptions?.serviceNotifications ?? true,
    }));
  }

  static async create(config: BetterAuthProviderConfig): Promise<OwoxBetterAuthIdp> {
    const store = createDatabaseStore(config.idpOwox.dbConfig);
    const adapter = await store.getAdapter();
    const auth = await createBetterAuthConfig(config.betterAuth, {
      adapter,
    });
    return new OwoxBetterAuthIdp(auth, store, config);
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

    this.requestHandlerService.setupBetterAuthHandler(app);
    this.pageService.registerRoutes(app);

    app.get(
      '/auth/idp-start',
      this.middlewareService.idpStartMiddleware.bind(this.middlewareService)
    );

    // Core callback route (PKCE code exchange)
    app.get('/auth/callback', async (req, res) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      if (!code) {
        this.logger.warn('Redirect url should contain code param');
        return res.redirect(`/auth${ProtocolRoute.SIGN_IN}`);
      }

      if (!state) {
        this.logger.warn('Redirect url should contain state param');
        clearPlatformCookies(res, req);
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

        res.redirect('/');
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
    const stateManager = getStateManager(req);
    const queryState = typeof req.query?.state === 'string' ? req.query.state : '';
    const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId : '';
    const refreshToken = extractRefreshToken(req);
    if (stateManager.hasMismatch()) {
      this.logger.warn('State mismatch detected during sign-in');
      clearPlatformCookies(res, req);
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignInUrl);
    }
    if (!queryState) {
      if (projectId && refreshToken) {
        return this.middlewareService.idpStartMiddleware(req, res);
      }

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
        } catch (error: unknown) {
          if (error instanceof AuthenticationException) {
            clearCookie(res, CORE_REFRESH_TOKEN_COOKIE, req);
            this.logger.warn('Refresh token rejected during sign-in, cookie cleared', {
              context: error.context,
              cause: error.cause,
            });
          } else if (error instanceof IdpFailedException) {
            this.logger.warn('Sign-in refresh failed due to upstream IdP error', {
              context: error.context,
              cause: error.cause,
            });
          } else {
            this.logger.error(formatError(error));
          }
        }
      }
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignInUrl);
    }

    stateManager.persist(res, queryState);
    return this.middlewareService.signInMiddleware(req, res, next);
  }

  async signUpMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    const stateManager = getStateManager(req);
    const queryState = typeof req.query?.state === 'string' ? req.query.state : '';
    if (stateManager.hasMismatch()) {
      this.logger.warn('State mismatch detected during sign-up');
      clearPlatformCookies(res, req);
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignUpUrl);
    }
    if (!queryState) {
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignUpUrl);
    }
    stateManager.persist(res, queryState);
    return this.middlewareService.signUpMiddleware(req, res, _next);
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
    clearCookie(res, CORE_REFRESH_TOKEN_COOKIE, req);
    clearBetterAuthCookies(res, req);
    const redirectUrl =
      this.config.idpOwox.idpConfig.signOutRedirectUrl ?? `/auth${ProtocolRoute.SIGN_IN}`;
    res.redirect(redirectUrl);
  }

  async userApiMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<e.Response<Payload>> {
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

  async projectsApiMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<e.Response<Projects>> {
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

  async isHealthy(): Promise<boolean> {
    return this.store.isHealthy();
  }

  private async redirectToPlatform(
    req: e.Request,
    res: e.Response,
    authUrl: string
  ): Promise<void | e.Response> {
    const params = extractPlatformParams(req);
    const platformUrl = buildPlatformEntryUrl({
      authUrl,
      params,
      defaultSource: SOURCE.APP,
      allowedRedirectOrigins: this.config.idpOwox.idpConfig.allowedRedirectOrigins,
    });
    return res.redirect(platformUrl.toString());
  }
}
