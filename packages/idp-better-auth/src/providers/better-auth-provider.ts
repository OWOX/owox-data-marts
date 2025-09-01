import {
  AuthResult,
  AddUserCommandResponse,
  IdpProviderAddUserCommand,
  IdpProviderListUsersCommand,
  IdpProviderRemoveUserCommand,
  IdpProvider,
  Payload,
} from '@owox/idp-protocol';
import { betterAuth } from 'better-auth';
import { Express, type Request, Response, NextFunction } from 'express';
import express from 'express';
import { BetterAuthConfig } from '../types/index.js';
import { createBetterAuthConfig } from '../auth/auth-config.js';
import { MagicLinkService } from '../services/magic-link-service.js';
import { CryptoService } from '../services/crypto-service.js';
import { AuthenticationService } from '../services/authentication-service.js';
import { TokenService } from '../services/token-service.js';
import { UserManagementService } from '../services/user-management-service.js';
import { DatabaseService } from '../services/database-service.js';
import { RequestHandlerService } from '../services/request-handler-service.js';
import { MiddlewareService } from '../services/middleware-service.js';
import { PageService } from '../services/page-service.js';

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
  private readonly databaseService: DatabaseService;
  private readonly requestHandlerService: RequestHandlerService;
  private readonly middlewareService: MiddlewareService;
  private readonly pageService: PageService;

  private constructor(private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>) {
    // Initialize core services
    const cryptoService = new CryptoService(this.auth);
    const magicLinkService = new MagicLinkService(this.auth, cryptoService);

    // Initialize all business logic services
    this.authenticationService = new AuthenticationService(this.auth, cryptoService);
    this.tokenService = new TokenService(this.auth, cryptoService);
    this.userManagementService = new UserManagementService(
      this.auth,
      magicLinkService,
      cryptoService
    );
    this.databaseService = new DatabaseService(this.auth);
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

  getAuth(): Awaited<ReturnType<typeof betterAuth>> {
    return this.auth;
  }

  static async create(config: BetterAuthConfig): Promise<BetterAuthProvider> {
    const auth = await createBetterAuthConfig(config);
    return new BetterAuthProvider(auth);
  }

  getBetterAuth(): Awaited<ReturnType<typeof betterAuth>> {
    return this.auth;
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

  async initialize(): Promise<void> {
    await this.databaseService.runMigrations();
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
    return Promise.resolve();
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
