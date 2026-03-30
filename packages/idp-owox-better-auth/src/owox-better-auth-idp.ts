import {
  AuthResult,
  GetProjectMembersOptions,
  IdpProvider,
  Payload,
  ProjectMember,
  Projects,
  ProtocolRoute,
} from '@owox/idp-protocol';
import { createMailingProvider } from '@owox/internal-helpers';
import { getMigrations } from 'better-auth/db/migration';
import cookieParser from 'cookie-parser';
import e, { Express, NextFunction } from 'express';
import { IdentityOwoxClient, TokenResponse } from './client/index.js';
import type { BetterAuthProviderConfig } from './config/index.js';
import { createBetterAuthConfig } from './config/index.js';
import { AuthErrorController } from './controllers/auth-error-controller.js';
import { PageController } from './controllers/page-controller.js';
import { PasswordFlowController } from './controllers/password-flow-controller.js';
import { GoogleSheetsExtensionAuthController } from './controllers/google-sheets-auth.controller.js';
import { AUTH_BASE_PATH, CORE_REFRESH_TOKEN_COOKIE, SOURCE } from './core/constants.js';
import { AuthenticationException, IdpFailedException } from './core/exceptions.js';
import { createServiceLogger } from './core/logger.js';
import { OwoxTokenFacade } from './facades/owox-token-facade.js';
import { BetterAuthSessionService } from './services/auth/better-auth-session-service.js';
import { MagicLinkService } from './services/auth/magic-link-service.js';
import { PkceFlowOrchestrator } from './services/auth/pkce-flow-orchestrator.js';
import { PlatformAuthFlowClient } from './services/auth/platform-auth-flow-client.js';
import { ProjectMembersService } from './services/core/project-members-service.js';
import type { ProjectMembersServiceOptions } from './types/project-members.js';
import { UserAccountResolver } from './services/core/user-account-resolver.js';
import { UserAuthInfoPersistenceService } from './services/core/user-auth-info-persistence-service.js';
import { UserContextService } from './services/core/user-context-service.js';
import { EmailValidationService } from './services/email/email-validation-service.js';
import { MagicLinkEmailService } from './services/email/magic-link-email-service.js';
import { AuthFlowMiddleware } from './services/middleware/auth-flow-middleware.js';
import { BetterAuthProxyHandler } from './services/middleware/better-auth-proxy-handler.js';
import { OnboardingService } from './services/onboarding/onboarding-service.js';
import { OnboardingController } from './controllers/onboarding-controller.js';
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
  persistPlatformParams,
} from './utils/request-utils.js';

/**
 * Main IdP implementation that wires core PKCE flow and Better Auth.
 */
export class OwoxBetterAuthIdp implements IdpProvider {
  private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>;
  private readonly store: DatabaseStore;
  private readonly betterAuthProxyHandler: BetterAuthProxyHandler;
  private readonly authErrorController: AuthErrorController;
  private readonly pageController: PageController;
  private readonly passwordFlowController: PasswordFlowController;
  private readonly googleSheetsAuthController: GoogleSheetsExtensionAuthController;
  private readonly betterAuthSessionService: BetterAuthSessionService;
  private readonly authFlowMiddleware: AuthFlowMiddleware;
  private readonly identityClient: IdentityOwoxClient;
  private readonly logger = createServiceLogger(OwoxBetterAuthIdp.name);
  private readonly tokenFacade: OwoxTokenFacade;
  private readonly userContextService: UserContextService;
  private readonly userAuthInfoPersistenceService: UserAuthInfoPersistenceService;
  private readonly platformAuthFlowClient: PlatformAuthFlowClient;
  private readonly pkceFlowOrchestrator: PkceFlowOrchestrator;
  private readonly projectMembersService: ProjectMembersService;
  private readonly onboardingService: OnboardingService;
  private readonly onboardingController: OnboardingController;

  private constructor(
    auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    store: DatabaseStore,
    private readonly config: BetterAuthProviderConfig,
    private readonly magicLinkService: MagicLinkService
  ) {
    this.auth = auth;
    this.store = store;
    this.identityClient = new IdentityOwoxClient(config.idpOwox.identityOwoxClientConfig);
    this.tokenFacade = new OwoxTokenFacade(
      this.identityClient,
      this.store,
      this.config.idpOwox,
      CORE_REFRESH_TOKEN_COOKIE
    );

    // Create UserAccountResolver to be shared between services
    const userAccountResolver = new UserAccountResolver(this.store);

    this.userContextService = new UserContextService(userAccountResolver, this.tokenFacade);
    this.userAuthInfoPersistenceService = new UserAuthInfoPersistenceService(
      this.store,
      this.tokenFacade
    );
    this.platformAuthFlowClient = new PlatformAuthFlowClient(this.identityClient);

    const serviceOptions: ProjectMembersServiceOptions = {
      ttlSeconds: this.config.idpOwox.projectMembersCacheTtlSeconds,
    };
    this.projectMembersService = new ProjectMembersService(
      this.store,
      this.identityClient,
      serviceOptions
    );

    this.onboardingService = new OnboardingService(this.store, this.projectMembersService);

    this.betterAuthSessionService = new BetterAuthSessionService(
      this.auth,
      this.store,
      this.platformAuthFlowClient,
      userAccountResolver
    );
    this.googleSheetsAuthController = new GoogleSheetsExtensionAuthController(this.tokenFacade);
    this.pkceFlowOrchestrator = new PkceFlowOrchestrator(
      this.config.idpOwox,
      this.tokenFacade,
      this.userContextService,
      this.platformAuthFlowClient,
      this.betterAuthSessionService
    );
    this.betterAuthProxyHandler = new BetterAuthProxyHandler(this.auth, this.pkceFlowOrchestrator);
    this.authErrorController = new AuthErrorController(this.config.gtmContainerId);
    this.pageController = new PageController(this.config.uiProviders, this.config.gtmContainerId);
    this.onboardingController = new OnboardingController(
      this.onboardingService,
      this.tokenFacade,
      this.config.gtmContainerId
    );
    this.passwordFlowController = new PasswordFlowController(
      this.auth,
      this.betterAuthSessionService,
      this.magicLinkService,
      this.config.gtmContainerId
    );
    this.authFlowMiddleware = new AuthFlowMiddleware(
      this.pageController,
      this.config.idpOwox,
      this.store,
      this.pkceFlowOrchestrator
    );
  }

  async getProjectMembers(
    projectId: string,
    options?: GetProjectMembersOptions
  ): Promise<ProjectMember[]> {
    return this.projectMembersService.getMembers(projectId, options);
  }

  static async create(config: BetterAuthProviderConfig): Promise<OwoxBetterAuthIdp> {
    const store = createDatabaseStore(config.idpOwox.dbConfig);
    const adapter = await store.getAdapter();
    const mailProvider = createMailingProvider(config.email);
    const magicLinkEmailService = new MagicLinkEmailService(mailProvider);
    const emailValidationService = new EmailValidationService({
      forbiddenDomains: config.betterAuth.forbiddenEmailDomains,
    });
    const magicLinkService = new MagicLinkService(
      store,
      magicLinkEmailService,
      config.betterAuth.baseURL || config.idpOwox.baseUrl,
      emailValidationService
    );

    const auth = await createBetterAuthConfig(config.betterAuth, {
      adapter,
      magicLinkSender: magicLinkService.buildSender(),
      resetPasswordSender: magicLinkService.buildResetPasswordSender(),
    });

    magicLinkService.setAuth(auth);

    return new OwoxBetterAuthIdp(auth, store, config, magicLinkService);
  }

  async initialize(): Promise<void> {
    const { runMigrations } = await getMigrations(this.auth.options);
    await this.store.initialize();
    await runMigrations();
  }

  registerRoutes(app: Express): void {
    app.use(e.json());
    app.use(e.urlencoded({ extended: true }));
    app.use(cookieParser());

    this.betterAuthProxyHandler.setupBetterAuthHandler(app);
    this.authErrorController.registerRoutes(app);
    this.onboardingController.registerRoutes(app);
    this.pageController.registerRoutes(app);
    this.passwordFlowController.registerRoutes(app);
    this.googleSheetsAuthController.registerRoutes(app);

    app.get(
      `${AUTH_BASE_PATH}/idp-start`,
      this.authFlowMiddleware.idpStartMiddleware.bind(this.authFlowMiddleware)
    );

    app.get(`${AUTH_BASE_PATH}/callback`, async (req, res) => {
      const code = req.query.code as string | undefined;
      const state = req.query.state as string | undefined;
      if (!code) {
        this.logger.warn('Redirect url should contain code param', { path: req.path });
        return res.redirect(`${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}`);
      }

      if (!state) {
        this.logger.warn('Redirect url should contain state param', { path: req.path });
        clearPlatformCookies(res, req);
        return res.redirect(`${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}`);
      }

      try {
        const response: TokenResponse = await this.tokenFacade.changeAuthCode(code, state);

        await this.userAuthInfoPersistenceService.persistAuthInfo(response.accessToken);

        this.tokenFacade.setTokenToCookie(
          res,
          req,
          response.refreshToken,
          response.refreshTokenExpiresIn
        );

        clearPlatformCookies(res, req);

        // Check if onboarding questionnaire should be shown
        const payload = await this.tokenFacade.parseToken(response.accessToken);
        if (payload) {
          try {
            const shouldOnboard = await this.onboardingService.shouldShowQuestionnaire(
              payload.userId,
              payload.projectId
            );
            if (shouldOnboard) {
              const onboardingUrl = new URL('/auth/onboarding', this.config.idpOwox.baseUrl);
              onboardingUrl.searchParams.set('redirect', '/');
              if (payload.email?.includes('@')) {
                onboardingUrl.searchParams.set('domain', payload.email.split('@')[1]!);
              }
              return res.redirect(onboardingUrl.toString());
            }
          } catch (error: unknown) {
            this.logger.error(
              'Failed to check if onboarding questionnaire should be shown',
              { path: req.path, userId: payload.userId, projectId: payload.projectId },
              error instanceof Error ? error : undefined
            );
          }
        }

        res.redirect('/');
      } catch (error: unknown) {
        if (error instanceof AuthenticationException) {
          this.logger.info('Token exchange callback rejected', {
            path: req.path,
            ...error.context,
          });
        } else if (error instanceof IdpFailedException) {
          this.logger.error(
            'Token exchange callback failed with unexpected code',
            { path: req.path, ...error.context },
            error
          );
        } else {
          this.logger.error(
            'Token exchange callback failed',
            { path: req.path },
            error instanceof Error ? error : undefined
          );
        }
        return res.redirect(`${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}`);
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

    if (stateManager.hasMismatch()) {
      this.logger.warn('State mismatch detected during sign-in', { path: req.path, queryState });
      clearPlatformCookies(res, req);
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignInUrl);
    }

    if (!queryState) {
      return this.handleNoState(req, res);
    }

    stateManager.persist(res, queryState);
    return this.authFlowMiddleware.signInMiddleware(req, res, next);
  }

  /**
   * Handles sign-in when no query state is present.
   * Attempts fast-path IDP start or refresh token reuse, otherwise redirects to platform.
   */
  private async handleNoState(req: e.Request, res: e.Response): Promise<void | e.Response> {
    const projectId = typeof req.query?.projectId === 'string' ? req.query.projectId : '';
    const refreshToken = extractRefreshToken(req);

    if (projectId && refreshToken) {
      return this.authFlowMiddleware.idpStartMiddleware(req, res);
    }

    if (refreshToken) {
      const handled = await this.handleExistingRefreshToken(req, res, refreshToken);
      if (handled) return;
    }

    return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignInUrl);
  }

  /**
   * Attempts to use an existing refresh token for silent re-authentication.
   * Returns true if the user was redirected, false if the token was invalid.
   */
  private async handleExistingRefreshToken(
    req: e.Request,
    res: e.Response,
    refreshToken: string
  ): Promise<boolean> {
    try {
      const auth = await this.tokenFacade.refreshToken(refreshToken);
      if (auth.refreshToken && auth.refreshTokenExpiresIn !== undefined) {
        this.tokenFacade.setTokenToCookie(res, req, auth.refreshToken, auth.refreshTokenExpiresIn);
      }
      res.redirect('/');
      return true;
    } catch (error: unknown) {
      if (error instanceof AuthenticationException) {
        clearCookie(res, CORE_REFRESH_TOKEN_COOKIE, req);
        this.logger.warn('Refresh token rejected during sign-in, cookie cleared', {
          path: req.path,
          ...error.context,
        });
      } else if (error instanceof IdpFailedException) {
        this.logger.warn('Sign-in refresh failed due to upstream IdP error', {
          path: req.path,
          ...error.context,
        });
      } else {
        this.logger.error(
          'Sign-in refresh failed unexpectedly',
          { path: req.path },
          error instanceof Error ? error : undefined
        );
      }
      return false;
    }
  }

  async signUpMiddleware(
    req: e.Request,
    res: e.Response,
    _next: NextFunction
  ): Promise<void | e.Response> {
    const stateManager = getStateManager(req);
    const queryState = typeof req.query?.state === 'string' ? req.query.state : '';
    if (stateManager.hasMismatch()) {
      this.logger.warn('State mismatch detected during sign-up', { path: req.path });
      clearPlatformCookies(res, req);
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignUpUrl);
    }
    if (!queryState) {
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignUpUrl);
    }
    stateManager.persist(res, queryState);
    return this.authFlowMiddleware.signUpMiddleware(req, res, _next);
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
      this.config.idpOwox.idpConfig.signOutRedirectUrl ??
      `${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}`;
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

    const onboarding = await this.onboardingService.getAnswersForPayload(
      payload.userId,
      payload.projectId
    );

    return res.json({ ...payload, onboarding });
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
      this.logger.error(
        'Failed to shutdown BetterAuth store',
        undefined,
        error instanceof Error ? error : undefined
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
    const enhancedParams = {
      ...params,
      appRedirectTo:
        params.projectId && !params.appRedirectTo
          ? `/auth/idp-start?projectId=${encodeURIComponent(params.projectId)}`
          : params.appRedirectTo,
    };
    persistPlatformParams(req, res, enhancedParams);
    const platformUrl = buildPlatformEntryUrl({
      authUrl,
      params: enhancedParams,
      defaultSource: SOURCE.APP,
      allowedRedirectOrigins: this.config.idpOwox.idpConfig.allowedRedirectOrigins,
    });
    return res.redirect(platformUrl.toString());
  }
}
