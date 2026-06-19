import {
  ApproveMembershipRequestResult,
  AuthResult,
  GetProjectMembersOptions,
  IdpProvider,
  McpOAuthProjectMemberContext,
  McpScope,
  McpTokenPayload,
  OAuthAuthorizationCode,
  OAuthAuthorizationRequest,
  OAuthJwksResult,
  OAuthJwksResultSchema,
  OAuthTokenExchangeRequest,
  OAuthTokenExchangeResult,
  Payload,
  Project,
  ProjectMember,
  ProjectMemberInvitation,
  ProjectMembershipRequest,
  Projects,
  ProtocolRoute,
  RequestProjectAccessResult,
  Role,
  UserProvisioningRequestAccessContext,
} from '@owox/idp-protocol';
import type {
  CreateNewProjectResult,
  UserProvisioningSettings,
  UserProvisioningSettingsUpdate,
} from '@owox/idp-protocol';
import { createMailingProvider } from '@owox/internal-helpers';
import { getMigrations } from 'better-auth/db/migration';
import cookieParser from 'cookie-parser';
import e, { Express, NextFunction } from 'express';
import { IdentityOwoxClient } from './client/index.js';
import type { BetterAuthProviderConfig } from './config/index.js';
import { createBetterAuthConfig } from './config/index.js';
import { AuthErrorController } from './controllers/auth-error-controller.js';
import { PageController } from './controllers/page-controller.js';
import { PasswordFlowController } from './controllers/password-flow-controller.js';
import { GoogleSheetsExtensionAuthController } from './controllers/google-sheets-auth.controller.js';
import { AUTH_BASE_PATH, CORE_REFRESH_TOKEN_COOKIE, SOURCE } from './core/constants.js';
import { AuthenticationException, IdpFailedException } from './core/exceptions.js';
import { isPersonalEmailDomain } from './core/personal-email-domains.js';
import { createServiceLogger } from './core/logger.js';
import { OwoxTokenFacade, type TokenResponseWithContext } from './facades/owox-token-facade.js';
import { BetterAuthSessionService } from './services/auth/better-auth-session-service.js';
import { MagicLinkService } from './services/auth/magic-link-service.js';
import { PkceFlowOrchestrator } from './services/auth/pkce-flow-orchestrator.js';
import { PlatformAuthFlowClient } from './services/auth/platform-auth-flow-client.js';
import { MembershipRequestsService } from './services/core/membership-requests-service.js';
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
import { buildPlatformEntryUrl, sanitizeRedirectParam } from './utils/platform-redirect-builder.js';
import {
  clearBetterAuthCookies,
  clearAuthFlowCookies,
  clearAuthFlowStateCookie,
  extractAuthFlowParams,
  extractRefreshToken,
  getStateManager,
  persistAuthFlowParams,
  type AuthFlowParams,
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
  private readonly membershipRequestsService: MembershipRequestsService;
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
    this.membershipRequestsService = new MembershipRequestsService(this.identityClient);

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
      this.config.gtmContainerId,
      this.revokePlatformRefreshTokenFromRequest.bind(this)
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

  async inviteMember(
    projectId: string,
    email: string,
    role: Role,
    actorUserId: string
  ): Promise<ProjectMemberInvitation> {
    return this.projectMembersService.inviteMember(projectId, email, role, actorUserId);
  }

  async removeMember(projectId: string, userId: string, actorUserId: string): Promise<void> {
    return this.projectMembersService.removeMember(projectId, userId, actorUserId);
  }

  async changeMemberRole(
    projectId: string,
    userId: string,
    newRole: Role,
    actorUserId: string
  ): Promise<void> {
    return this.projectMembersService.changeMemberRole(projectId, userId, newRole, actorUserId);
  }

  async getUserProvisioningSettings(
    projectId: string,
    actorUserId: string
  ): Promise<UserProvisioningSettings> {
    return this.identityClient.getUserProvisioningSettings(projectId, actorUserId);
  }

  async updateUserProvisioningSettings(
    projectId: string,
    actorUserId: string,
    settings: UserProvisioningSettingsUpdate
  ): Promise<UserProvisioningSettings> {
    return this.identityClient.updateUserProvisioningSettings(projectId, actorUserId, settings);
  }

  async listMembershipRequests(
    projectId: string,
    actorUserId: string,
    _options?: { forceFresh?: boolean }
  ): Promise<ProjectMembershipRequest[]> {
    return this.membershipRequestsService.listMembershipRequests(projectId, actorUserId);
  }

  async approveMembershipRequest(
    projectId: string,
    requestId: string,
    role: Role,
    actorUserId: string
  ): Promise<ApproveMembershipRequestResult> {
    return this.membershipRequestsService.approveMembershipRequest(
      projectId,
      requestId,
      role,
      actorUserId
    );
  }

  async declineMembershipRequest(
    projectId: string,
    requestId: string,
    actorUserId: string
  ): Promise<void> {
    return this.membershipRequestsService.declineMembershipRequest(
      projectId,
      requestId,
      actorUserId
    );
  }

  async getUserProvisioningRequestAccessContext(
    userId: string,
    projectId: string
  ): Promise<UserProvisioningRequestAccessContext> {
    const requestAccessContext = await this.identityClient.getUserProvisioningRequestAccessContext(
      userId,
      projectId
    );
    return {
      decision: requestAccessContext.decision,
      user: {
        userId: requestAccessContext.user.userUid,
        email: requestAccessContext.user.email,
      },
      organization: requestAccessContext.organization,
      project: {
        projectId: requestAccessContext.project.projectName,
        projectTitle: requestAccessContext.project.projectTitle,
      },
      availableRoles: requestAccessContext.availableRoles,
      defaultRole: requestAccessContext.defaultRole,
      existingRequest: requestAccessContext.existingRequest ?? null,
    };
  }

  async requestProjectAccess(
    userId: string,
    projectId: string,
    role: Role
  ): Promise<RequestProjectAccessResult> {
    const response = await this.identityClient.requestProjectAccess(userId, projectId, role);

    return {
      userId: response.user.userUid,
      projectId: response.project.projectName,
      projectTitle: response.project.projectTitle,
      request: response.request,
    };
  }

  async createNewProject(userId: string, integration: string): Promise<CreateNewProjectResult> {
    const response = await this.identityClient.createNewProject(userId, integration);
    return {
      projectId: response.projectName,
      projectTitle: response.projectTitle,
    };
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
        clearAuthFlowCookies(res, req);
        return res.redirect(`${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}`);
      }

      try {
        const response: TokenResponseWithContext = await this.tokenFacade.changeAuthCode(
          code,
          state
        );

        await this.userAuthInfoPersistenceService.persistAuthInfo(response.accessToken);

        this.tokenFacade.setTokenToCookie(
          res,
          req,
          response.refreshToken,
          response.refreshTokenExpiresIn
        );

        const callbackAuthFlowParams = response.authFlowParams ?? extractAuthFlowParams(req);
        const redirectTarget = this.resolveExistingRefreshRedirect(callbackAuthFlowParams);
        this.logger.info('Completed IDP callback', {
          path: req.path,
          redirectTarget,
          redirectTo: callbackAuthFlowParams.redirectTo,
          appRedirectTo: callbackAuthFlowParams.appRedirectTo,
        });

        clearAuthFlowCookies(res, req);

        // Check if onboarding questionnaire should be shown
        const payload = await this.tokenFacade.parseToken(response.accessToken);
        if (payload) {
          try {
            await this.onboardingService.evaluateAndSetOnboardingStatus(
              payload.userId,
              payload.projectId
            );
            const shouldOnboard = await this.onboardingService.shouldShowQuestionnaire(
              payload.userId,
              payload.projectId
            );
            if (shouldOnboard) {
              const onboardingUrl = new URL('/auth/onboarding', this.config.idpOwox.baseUrl);
              onboardingUrl.searchParams.set('redirect', redirectTarget);
              if (payload.email?.includes('@')) {
                const domain = payload.email.split('@')[1]!;
                if (!isPersonalEmailDomain(domain)) {
                  onboardingUrl.searchParams.set('domain', domain);
                }
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

        res.redirect(redirectTarget);
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
      clearAuthFlowCookies(res, req);
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
    const authFlowParams = extractAuthFlowParams(req);
    const hasOAuthAuthorizeContinuation = this.hasOAuthAuthorizeContinuation(authFlowParams);

    this.logger.info('Sign-in request without state', {
      path: req.path,
      hasRefreshToken: Boolean(refreshToken),
      hasProjectId: Boolean(projectId),
      redirectTo: authFlowParams.redirectTo,
      appRedirectTo: authFlowParams.appRedirectTo,
      hasOAuthAuthorizeContinuation,
    });

    if (!refreshToken && hasOAuthAuthorizeContinuation) {
      this.logger.info(
        'Redirecting MCP OAuth continuation to Platform sign-in without refresh token',
        {
          path: req.path,
          redirectTo: authFlowParams.redirectTo,
          appRedirectTo: authFlowParams.appRedirectTo,
        }
      );
      clearAuthFlowStateCookie(res, req);
      return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignInUrl);
    }

    if (projectId && refreshToken) {
      return this.authFlowMiddleware.idpStartMiddleware(req, res);
    }

    if (refreshToken) {
      const handled = await this.handleExistingRefreshToken(req, res, refreshToken);
      if (handled) return;
    }

    return this.redirectToPlatform(req, res, this.config.idpOwox.idpConfig.platformSignInUrl);
  }

  private hasOAuthAuthorizeContinuation(params: AuthFlowParams): boolean {
    return [params.redirectTo, params.appRedirectTo].some(
      redirect => typeof redirect === 'string' && redirect.startsWith('/oauth/authorize')
    );
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
      const redirectTarget = this.resolveExistingRefreshRedirect(extractAuthFlowParams(req));
      this.logger.info('Completed silent sign-in refresh', {
        path: req.path,
        redirectTarget,
      });
      res.redirect(redirectTarget);
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

  private resolveExistingRefreshRedirect(params: AuthFlowParams): string {
    const allowedRedirectOrigins = this.config.idpOwox.idpConfig.allowedRedirectOrigins;
    return (
      sanitizeRedirectParam(params.redirectTo, allowedRedirectOrigins) ??
      sanitizeRedirectParam(params.appRedirectTo, allowedRedirectOrigins) ??
      '/'
    );
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
      clearAuthFlowCookies(res, req);
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

    return res.json(await this.getProjects(accessToken));
  }

  async getProjects(accessToken: string): Promise<Projects> {
    const normalized = accessToken.trim();
    return this.identityClient.getProjects(
      /^Bearer\s+/i.test(normalized) ? normalized : `Bearer ${normalized}`
    );
  }

  async getProjectForUser(userId: string, projectId: string): Promise<Project> {
    return this.identityClient.getProjectForUser(userId, projectId);
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

  async issueAccessTokenForProjectMemberApiKey(
    apiKeyId: string,
    userId: string,
    projectId: string,
    role: Role | null,
    readOnly: boolean
  ): Promise<AuthResult> {
    const response = await this.identityClient.issueAccessTokenForProjectMemberApiKey({
      apiKeyId,
      userId,
      projectId,
      role,
      readOnly,
    });

    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      accessTokenExpiresIn: response.accessTokenExpiresIn,
      refreshTokenExpiresIn: response.refreshTokenExpiresIn,
    };
  }

  createMcpOAuthAuthorizationCode(
    request: OAuthAuthorizationRequest,
    projectMember: McpOAuthProjectMemberContext
  ): Promise<OAuthAuthorizationCode> {
    return this.identityClient.createMcpOAuthAuthorizationCode({
      request,
      projectMember,
    });
  }

  exchangeMcpOAuthToken(request: OAuthTokenExchangeRequest): Promise<OAuthTokenExchangeResult> {
    return this.identityClient.exchangeMcpOAuthToken(request);
  }

  verifyMcpAccessToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpTokenPayload | null> {
    return this.identityClient.verifyMcpAccessToken({
      token,
      resource,
      requiredScopes,
    });
  }

  async getMcpOAuthJwks(): Promise<OAuthJwksResult> {
    return OAuthJwksResultSchema.parse(await this.identityClient.getJwks());
  }

  async revokeToken(token: string): Promise<void> {
    await this.tokenFacade.revokeToken(token);
  }

  /**
   * Best-effort revocation of the OWOX platform refresh token carried by the
   * current request (the `refreshToken` cookie), then clears that cookie.
   *
   * Used after a password reset so the platform session tied to THIS request
   * is invalidated at the OWOX Identity level — not only the Better Auth UI
   * session. Revocation failures are non-fatal (logged, not thrown) so they
   * never block completing the password flow.
   *
   * Scope note: this only revokes the token present in the request (the acting
   * device). Invalidating a user's OTHER devices would require a
   * revoke-by-userId capability on OWOX Identity, which does not exist yet.
   */
  private async revokePlatformRefreshTokenFromRequest(
    req: e.Request,
    res: e.Response
  ): Promise<void> {
    const refreshToken = extractRefreshToken(req);
    if (refreshToken) {
      try {
        await this.revokeToken(refreshToken);
      } catch (error) {
        this.logger.warn(
          'Failed to revoke OWOX refresh token during password flow',
          undefined,
          error instanceof Error ? error : undefined
        );
      }
    }
    clearCookie(res, CORE_REFRESH_TOKEN_COOKIE, req);
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
    const params = extractAuthFlowParams(req);
    const enhancedParams = {
      ...params,
      appRedirectTo:
        params.projectId && !params.appRedirectTo
          ? `/auth/idp-start?projectId=${encodeURIComponent(params.projectId)}`
          : params.appRedirectTo,
    };
    persistAuthFlowParams(req, res, enhancedParams);
    const platformUrl = buildPlatformEntryUrl({
      authUrl,
      params: enhancedParams,
      defaultSource: SOURCE.APP,
      allowedRedirectOrigins: this.config.idpOwox.idpConfig.allowedRedirectOrigins,
    });
    this.logger.info('Redirecting sign-in request to platform', {
      path: req.path,
      authUrl,
      redirectTo: enhancedParams.redirectTo,
      appRedirectTo: enhancedParams.appRedirectTo,
      projectId: enhancedParams.projectId,
      platformUrl: platformUrl.toString(),
    });
    return res.redirect(platformUrl.toString());
  }
}
