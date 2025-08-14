import { IdpProvider } from '../types/provider.js';
import { Express, Request, Response, NextFunction } from 'express';

/**
 * The routes that are supported by the protocol middleware.
 */
export enum ProtocolRoute {
  SIGN_IN = '/sign-in',
  SIGN_OUT = '/sign-out',
  ACCESS_TOKEN = '/access-token',
}

/**
 * The options for the protocol middleware.
 * @property basePath - The base path for the protoc    ol middleware.
 * @property routes - The routes that are supported by the protocol middleware.
 * @example
 * {
 *   basePath: '/',
 *   routes: {
 *     signIn: '/signin', // override the default sign in route
 *     signOut: '/signout', // override the default sign out route
 *     accessToken: '/accesstoken', // override the default access token route
 *   },
 * }
 */
export interface IdpProtocolMiddlewareOptions {
  basePath?: string;
  routes?: {
    signIn?: string;
    signOut?: string;
    accessToken?: string;
  };
}

type MiddlewareHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

/**
 * The protocol middleware for the IDP.
 * @param provider - The provider to use for the middleware.
 * @param options - The options for the middleware.
 * @example // Register the middleware with the default routes
 * const idpProtocolMiddleware = new IdpProtocolMiddleware(provider);
 * idpProtocolMiddleware.register(app);
 *
 * @example // Override the default routes
 * const app = express();
 * const middlewareOptions: IdpProtocolMiddlewareOptions = {
 *   basePath: '/',
 *   routes: {
 *     signIn: '/signin',
 *     signOut: '/signout',
 *     accessToken: '/accesstoken',
 *   }
 * };
 * const idpProtocolMiddleware = new IdpProtocolMiddleware(provider, middlewareOptions);
 * idpProtocolMiddleware.register(app);
 */
export class IdpProtocolMiddleware {
  /**
   * The default base path for the protocol middleware.
   */
  public readonly DEFAULT_BASE_PATH = '/auth';
  private readonly basePath: string;
  private readonly routes: Required<NonNullable<IdpProtocolMiddlewareOptions['routes']>>;

  /**
   * The constructor for the protocol middleware.
   * @param provider - The provider to use for the middleware.
   * @param options - The options for the middleware.
   */
  constructor(
    private readonly provider: IdpProvider,
    options: IdpProtocolMiddlewareOptions = {}
  ) {
    this.basePath = this.normalizeBasePath(options.basePath ?? this.DEFAULT_BASE_PATH);
    this.routes = {
      signIn: options.routes?.signIn ?? ProtocolRoute.SIGN_IN,
      signOut: options.routes?.signOut ?? ProtocolRoute.SIGN_OUT,
      accessToken: options.routes?.accessToken ?? ProtocolRoute.ACCESS_TOKEN,
    };

    this.validateConfiguration();
  }

  /**
   * Normalize the base path.
   * @param path - The path to normalize.
   * @returns The normalized path.
   */
  private normalizeBasePath(path: string): string {
    if (!path.startsWith('/')) {
      throw new Error(`Base path must start with '/': ${path}`);
    }
    return path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  }

  /**
   * Validate the configuration.
   */
  private validateConfiguration(): void {
    const routePaths = Object.values(this.routes);
    const duplicates = routePaths.filter((path, index) => routePaths.indexOf(path) !== index);

    if (duplicates.length > 0) {
      throw new Error(`Duplicate route paths detected: ${duplicates.join(', ')}`);
    }

    routePaths.forEach(path => {
      if (!path.startsWith('/')) {
        throw new Error(`Route path must start with '/': ${path}`);
      }
    });
  }

  /**
   * Create a route handler.
   * @param handler - The handler to create.
   * @returns The created handler.
   */
  private createRouteHandler(handler: MiddlewareHandler): MiddlewareHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        await handler(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Register the protocol middleware routes with the express app.
   * @param app - The express app to register the routes with.
   * @example
   * const app = express();
   * const idpProtocolMiddleware = new IdpProtocolMiddleware(provider);
   * idpProtocolMiddleware.register(app);
   * app.listen(3000);
   */
  register(app: Express): void {
    const routeConfigs = [
      {
        path: this.routes.signIn,
        handler: (req: Request, res: Response, next: NextFunction) =>
          this.provider.signInMiddleware(req, res, next),
      },
      {
        path: this.routes.signOut,
        handler: (req: Request, res: Response, next: NextFunction) =>
          this.provider.signOutMiddleware(req, res, next),
      },
      {
        path: this.routes.accessToken,
        handler: (req: Request, res: Response, next: NextFunction) =>
          this.provider.accessTokenMiddleware(req, res, next),
      },
    ];

    routeConfigs.forEach(({ path, handler }) => {
      const fullPath = `${this.basePath}${path}`;
      app.all(fullPath, this.createRouteHandler(handler));
    });
  }
}
