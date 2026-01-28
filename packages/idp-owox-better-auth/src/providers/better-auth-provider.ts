import { AuthResult, IdpProvider, Payload, Projects } from '@owox/idp-protocol';
import express, { Express, NextFunction, type Request, Response } from 'express';
import { createBetterAuthConfig } from '../auth/auth-config.js';
import { logger } from '../logger.js';
import { AuthenticationService } from '../services/authentication-service.js';
import { CryptoService } from '../services/crypto-service.js';
import { MagicLinkService } from '../services/magic-link-service.js';
import { MiddlewareService } from '../services/middleware-service.js';
import { PageService } from '../services/page-service.js';
import { RequestHandlerService } from '../services/request-handler-service.js';
import { TokenService } from '../services/token-service.js';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import { createDatabaseStore } from '../store/DatabaseStoreFactory.js';
import { BetterAuthConfig } from '../types/index.js';

export class OwoxBetterAuthProvider implements IdpProvider {
  // Services
  private readonly authenticationService: AuthenticationService;
  private readonly tokenService: TokenService;
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
    const magicLinkService = new MagicLinkService(this.auth);

    // Initialize all other business logic services
    this.authenticationService = new AuthenticationService(
      this.auth,
      cryptoService,
      magicLinkService
    );
    this.tokenService = new TokenService(this.auth, cryptoService);
    this.requestHandlerService = new RequestHandlerService(this.auth);
    this.pageService = new PageService(this.authenticationService);
    this.middlewareService = new MiddlewareService(this.authenticationService, this.pageService);
  }

  static async create(config: BetterAuthConfig): Promise<OwoxBetterAuthProvider> {
    const store = createDatabaseStore(config.database);
    const adapter = await store.getAdapter();

    const auth = await createBetterAuthConfig(config, {
      adapter,
    });
    return new OwoxBetterAuthProvider(auth, store, config);
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
    app.post(
      '/auth/api/sign-up',
      this.authenticationService.signUpMiddleware.bind(this.authenticationService)
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
    _next: NextFunction
  ): Promise<void | Response> {
    // Render dedicated sign-up page (handled by Better Auth flow)
    return this.pageService.signUpPage(req, res);
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
      logger.error('Failed to shutdown BetterAuthProvider store', {}, error as Error);
    }
  }

  async isHealthy(): Promise<boolean> {
    return await this.store.isHealthy();
  }
}
