import { IdpProvider } from '../types/provider.js';
import { AuthResult, Payload } from '../types/models.js';
import { Request, Response, NextFunction } from 'express';

/**
 * NULL IDP Provider - single user, single project
 * Used for deployments without user management and development
 */
export class NullIdpProvider implements IdpProvider {
  private defaultPayload: Payload;

  constructor() {
    this.defaultPayload = {
      userId: '0',
      email: 'admin@localhost',
      roles: ['admin'],
      fullName: 'Admin',
      projectId: '0',
    };
  }

  async refreshToken(_refreshToken: string): Promise<AuthResult> {
    return {
      accessToken: '',
    };
  }

  signInMiddleware(_req: Request, _res: Response, next: NextFunction): Promise<void> {
    next();
    return Promise.resolve();
  }
  signOutMiddleware(_req: Request, _res: Response, next: NextFunction): Promise<void> {
    next();
    return Promise.resolve();
  }
  accessTokenMiddleware(_req: Request, res: Response, _next: NextFunction): Promise<Response> {
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

  async revokeToken(_token: string): Promise<void> {
    // No-op for NULL provider
  }
}
