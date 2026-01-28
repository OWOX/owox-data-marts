import { type Request, type Response, type NextFunction } from 'express';
import { AuthenticationService } from './authentication-service.js';
import { PageService } from './page-service.js';
import { logger } from '../logger.js';

export class MiddlewareService {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly pageService: PageService
  ) {}

  async signInMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    return this.pageService.signInPage.bind(this.pageService)(req, res);
  }

  async signOutMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.authenticationService.signOutMiddleware(req, res, next);
  }

  async accessTokenMiddleware(
    _req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    return res.status(501).json({ error: 'Access tokens are disabled in this setup' });
  }

  async userApiMiddleware(req: Request, res: Response, _next: NextFunction): Promise<Response> {
    try {
      const validation = await this.authenticationService.validateSession(req);

      if (!validation.isValid || !validation.session) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.json({
        userId: validation.session.user.id,
        email: validation.session.user.email,
        fullName: validation.session.user.name || validation.session.user.email,
      });
    } catch (error) {
      logger.error('User API middleware error', {}, error as Error);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
}
