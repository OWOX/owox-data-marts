import { IdpProvider } from '../types/provider.js';
import { AuthResult, Payload, Projects, ProjectMember } from '../types/models.js';
import { Express, Request, Response, NextFunction } from 'express';

/**
 * NULL IDP Provider - single user, single project
 * Used for deployments without user management and development
 */
export class NullIdpProvider implements IdpProvider {
  private defaultPayload: Payload;
  private defaultAccessToken: string;
  private defaultRefreshToken: string;

  constructor() {
    this.defaultPayload = {
      userId: '0',
      email: 'admin@localhost',
      roles: ['admin'],
      fullName: 'Admin',
      projectId: '0',
    };
    this.defaultAccessToken = 'accessToken';
    this.defaultRefreshToken = 'refreshToken';
  }

  async refreshToken(_refreshToken: string): Promise<AuthResult> {
    return {
      accessToken: this.defaultAccessToken,
    };
  }

  signInMiddleware(req: Request, res: Response, _next: NextFunction): Promise<void> {
    return this.setAuthCookieAndRedirect(req, res);
  }

  signUpMiddleware(req: Request, res: Response, _next: NextFunction): Promise<void> {
    return this.setAuthCookieAndRedirect(req, res);
  }

  signOutMiddleware(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    res.clearCookie('refreshToken');
    return Promise.resolve(res.redirect('/'));
  }

  accessTokenMiddleware(req: Request, res: Response, _next: NextFunction): Promise<Response> {
    if (!req.cookies.refreshToken) {
      return Promise.resolve(res.status(401).json({ message: 'Unauthorized' }));
    }
    return Promise.resolve(res.json({ accessToken: this.defaultAccessToken }));
  }

  userApiMiddleware(req: Request, res: Response, _next: NextFunction): Promise<Response<Payload>> {
    if (!req.cookies.refreshToken) {
      return Promise.resolve(res.status(401).json({ message: 'Unauthorized' }));
    }
    return Promise.resolve(res.json(this.defaultPayload));
  }

  projectsApiMiddleware(
    _req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<Response<Projects>> {
    // Always return empty list of projects
    return Promise.resolve(res.json([]));
  }

  registerRoutes(_app: Express): void {
    // Nothing to register
  }

  async initialize(): Promise<void> {
    // Nothing to initialize
  }

  async isHealthy(): Promise<boolean> {
    // Null provider has no external dependencies
    return true;
  }

  async shutdown(): Promise<void> {
    // Nothing to cleanup
  }

  async introspectToken(_token: string): Promise<Payload | null> {
    return this.defaultPayload;
  }

  async parseToken(_token: string): Promise<Payload | null> {
    return this.defaultPayload;
  }

  async revokeToken(_token: string): Promise<void> {
    // No-op for NULL provider
  }

  async getProjectMembers(_projectId: string): Promise<ProjectMember[]> {
    return [
      {
        userId: '0',
        email: 'admin@localhost',
        fullName: 'Admin User',
        avatar: undefined,
        projectRole: 'admin',
        userStatus: 'active',
        hasNotificationsEnabled: true,
      },
    ];
  }

  /**
   * Sets the authentication cookie in the response and redirects the user to the root path.
   *
   * @param {Request} req The HTTP request object containing the client's request.
   * @param {Response} res The HTTP response object used to send back the response, including the cookie and redirect.
   * @return {Promise<void>} A promise that resolves when the cookie is set and the redirect response is sent to the client.
   */
  private setAuthCookieAndRedirect(req: Request, res: Response): Promise<void> {
    const isSecure =
      req.protocol !== 'http' && !(req.hostname === 'localhost' || req.hostname === '127.0.0.1');

    res.cookie('refreshToken', this.defaultRefreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 * 1000,
    });
    return Promise.resolve(res.redirect('/'));
  }
}
