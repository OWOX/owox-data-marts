import { Payload, AuthResult, Projects } from './models.js';
import { Express, NextFunction, Request, Response } from 'express';

/**
 * Simplified IDP Provider interface.
 */
export interface IdpProvider {
  /**
   * Sign in middleware. This method is used to handle the sign in request and use response to send the sign in response.
   * <br/>
   * If the IDP implementation does not support sign in, this method should call the `next()` function.
   */
  signInMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * Sign up middleware. This method is used to handle the user registration request and send the sign up response.
   * <br/>
   * If the IDP implementation does not support sign up, this method should call the `next()` function.
   */
  signUpMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * Sign out middleware. This method is used to handle the sign out request and use response to send the sign out response.
   * <br/>
   * If the IDP implementation does not support sign out, this method should call the `next()` function.
   */
  signOutMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * Access token middleware. This method is used to handle the access token request and use response to send the access token response.
   * <br/>
   * If the IDP implementation does not support access token, this method should call the `next()` function.
   */
  accessTokenMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * User api middleware. This method is used to handle the user request and use response to send the user response.
   * <br/>
   * If the IDP implementation does not support user, this method should call the `next()` function.
   */
  userApiMiddleware(req: Request, res: Response, next: NextFunction): Promise<Response<Payload>>;

  /**
   * Projects api middleware. This method is used to handle the projects request and use response to send the projects response.
   * <br/>
   * If the IDP implementation does not support user, this method should call the `next()` function.
   */
  projectsApiMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response<Projects>>;

  /**
   * Register routes with the express app.
   * @param app - The express app to register the routes with.
   * @param basePath - The base path to register the routes with.
   */
  registerRoutes(app: Express): void;

  /**
   * Introspect a token
   * @param token - The token to introspect
   * @returns The token payload
   */
  introspectToken(token: string): Promise<Payload | null>;

  /**
   * Parse a token
   * @param token - The token to parse
   * @returns The token payload
   */
  parseToken(token: string): Promise<Payload | null>;

  /**
   * Refresh a token
   * @param refreshToken - The refresh token to use for the refresh
   * @returns The authentication result
   */
  refreshToken(refreshToken: string): Promise<AuthResult>;

  /**
   * Revoke a token. In different IDP implementations, this may have different token types.
   * @param token - The token to revoke
   */
  revokeToken(token: string): Promise<void>;

  /**
   * Initialize the IDP. Create resources, connect to databases, etc.
   */
  initialize(): Promise<void>;

  /**
   * Health probe for the IDP. Check if the IDP is healthy to handle requests.
   */
  isHealthy(): Promise<boolean>;

  /**
   * Shutdown the IDP, close all connections and release resources
   */
  shutdown(): Promise<void>;
}
