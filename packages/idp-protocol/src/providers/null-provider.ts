import { IdpProvider } from '../types/provider.js';
import { AuthResult, Payload } from '../types/models.js';
import { Request, Response, NextFunction } from 'express';

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

  signInMiddleware(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    res.cookie('refreshToken', this.defaultRefreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 3600000,
    });
    return Promise.resolve(res.redirect('/'));
  }
  signOutMiddleware(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    res.clearCookie('refreshToken');
    return Promise.resolve(res.redirect('/'));
  }
  accessTokenMiddleware(_req: Request, res: Response, _next: NextFunction): Promise<Response> {
    if (!_req.cookies.refreshToken) {
      return Promise.resolve(res.status(401).json({ message: 'Unauthorized' }));
    }
    return Promise.resolve(res.json({ accessToken: this.defaultAccessToken }));
  }

  userApiMiddleware(_req: Request, res: Response, _next: NextFunction): Promise<Response<Payload>> {
    if (!_req.cookies.refreshToken) {
      return Promise.resolve(res.status(401).json({ message: 'Unauthorized' }));
    }
    return Promise.resolve(res.json(this.defaultPayload));
  }

  async initialize(): Promise<void> {
    // Nothing to initialize
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
}
