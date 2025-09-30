import {
  AuthResult,
  AddUserCommandResponse,
  IdpProviderAddUserCommand,
  IdpProviderListUsersCommand,
  IdpProviderRemoveUserCommand,
  IdpProvider,
  Payload,
  Projects,
} from '@owox/idp-protocol';
import { Express, type Request, Response, NextFunction } from 'express';
import express from 'express';
import { BetterAuthConfig } from '../types/index.js';
import { createBetterAuthConfig } from '../auth/auth-config.js';
import { MagicLinkService } from '../services/magic-link-service.js';
import { CryptoService } from '../services/crypto-service.js';
import { AuthenticationService } from '../services/authentication-service.js';
import { TokenService } from '../services/token-service.js';
import { UserManagementService } from '../services/user-management-service.js';
import { RequestHandlerService } from '../services/request-handler-service.js';
import { MiddlewareService } from '../services/middleware-service.js';
import { PageService } from '../services/page-service.js';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import { createDatabaseStore } from '../store/DatabaseStoreFactory.js';

export class BetterAuthProvider
  implements
    IdpProvider,
    IdpProviderAddUserCommand,
    IdpProviderListUsersCommand,
    IdpProviderRemoveUserCommand
{
  // Services
  private readonly authenticationService: AuthenticationService;
  private readonly tokenService: TokenService;
  private readonly userManagementService: UserManagementService;
  private readonly requestHandlerService: RequestHandlerService;
  private readonly middlewareService: MiddlewareService;
  private readonly pageService: PageService;

  private constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly store: DatabaseStore,
    private readonly config: BetterAuthConfig
  ) {
    // Initialize core services
    const cryptoService = new CryptoService(this.auth);
    const magicLinkService = new MagicLinkService(this.auth, cryptoService);

    // Initialize UserManagementService first
    this.userManagementService = new UserManagementService(
      this.auth,
      magicLinkService,
      cryptoService,
      this.store
    );

    // Initialize all other business logic services
    this.authenticationService = new AuthenticationService(this.auth, cryptoService);
    this.tokenService = new TokenService(this.auth, cryptoService, this.userManagementService);
    this.requestHandlerService = new RequestHandlerService(this.auth);
    this.pageService = new PageService(
      this.authenticationService,
      this.userManagementService,
      cryptoService
    );
    this.middlewareService = new MiddlewareService(
      this.authenticationService,
      this.pageService,
      this.userManagementService
    );

    // Set circular dependency
    this.authenticationService.setUserManagementService(this.userManagementService);
  }

  static async create(config: BetterAuthConfig): Promise<BetterAuthProvider> {
    const store = createDatabaseStore(config.database);
    const adapter = await store.getAdapter();
    const auth = await createBetterAuthConfig(config, { adapter });
    return new BetterAuthProvider(auth, store, config);
  }

  registerRoutes(app: Express): void {
    // Setup middleware
    app.use(express.json()); // Add JSON parsing middleware
    app.use(express.urlencoded({ extended: true }));

    // Setup Better Auth handler
    this.requestHandlerService.setupBetterAuthHandler(app);
    this.pageService.registerRoutes(app);

    app.post(
      '/auth/api/sign-in',
      this.authenticationService.signInMiddleware.bind(this.authenticationService)
    );
  }

  async signInMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.middlewareService.signInMiddleware(req, res, next);
  }

  async signUpMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    // Trade-off: Currently redirects to sign-in flow as Better Auth doesn't have
    // a separate sign-up implementation yet. The product uses magic link authentication
    // where sign-up and sign-in are handled through the same flow.
    return this.middlewareService.signInMiddleware(req, res, next);
  }

  async signOutMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.middlewareService.signOutMiddleware(req, res, next);
  }

  async accessTokenMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.middlewareService.accessTokenMiddleware(req, res, next);
  }

  async userApiMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response<Payload>> {
    return this.middlewareService.userApiMiddleware(req, res, next);
  }

  async projectsApiMiddleware(
    _req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<Response<Projects>> {
    // Always return empty list of projects
    return Promise.resolve(res.json([]));
  }

  async initialize(): Promise<void> {
    const { getMigrations } = await import('better-auth/db');
    const { runMigrations } = await getMigrations(this.auth.options);
    await runMigrations();

    if (this.config.primaryAdminEmail) {
      await this.initializePrimaryAdmin(this.config.primaryAdminEmail);
    }
  }

  private async initializePrimaryAdmin(email: string): Promise<void> {
    try {
      const existingUser = await this.store.getUserByEmail(email);

      if (!existingUser) {
        console.warn(`Primary admin '${email}' not found. Creating admin user...`);
        const result = await this.userManagementService.addUserViaMagicLink(email);

        const user = await this.store.getUserByEmail(email);
        if (user) {
          await this.userManagementService.ensureUserInDefaultOrganization(user.id, 'admin');
        }

        console.warn(`Primary admin created. Magic link: ${result.magicLink}`);
        return;
      }

      const hasPassword = await this.store.userHasPassword(existingUser.id);

      if (!hasPassword) {
        console.warn(
          `Primary admin '${email}' exists but has no password. Generating new magic link...`
        );
        const result = await this.userManagementService.addUserViaMagicLink(email);
        console.warn(`New magic link generated for admin: ${result.magicLink}`);
        return;
      }
    } catch (error) {
      console.error(`Failed to initialize primary admin '${email}':`, error);
      throw error;
    }
  }

  async introspectToken(token: string): Promise<Payload | null> {
    return this.tokenService.introspectToken(token);
  }

  async parseToken(token: string): Promise<Payload | null> {
    return this.tokenService.parseToken(token);
  }

  async verifyToken(token: string): Promise<Payload | null> {
    return this.tokenService.introspectToken(token);
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    return this.tokenService.refreshToken(refreshToken);
  }

  async revokeToken(token: string): Promise<void> {
    return this.tokenService.revokeToken(token);
  }

  async shutdown(): Promise<void> {
    try {
      await this.store.shutdown();
    } catch (error) {
      console.error('Failed to shutdown BetterAuthProvider store:', error);
    }
  }

  async addUser(username: string, _password?: string): Promise<AddUserCommandResponse> {
    return this.userManagementService.addUserViaMagicLink(username);
  }

  async listUsers(): Promise<Payload[]> {
    return this.userManagementService.listUsers();
  }

  async removeUser(userId: string): Promise<void> {
    return this.userManagementService.removeUser(userId);
  }
}
