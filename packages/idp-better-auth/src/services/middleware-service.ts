import { type Request, type Response, type NextFunction } from 'express';
import { Payload } from '@owox/idp-protocol';
import { AuthenticationService } from './authentication-service.js';
import { PageService } from './page-service.js';

export class MiddlewareService {
  private static readonly DEFAULT_ORGANIZATION_ID = 'owox-default';

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
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.authenticationService.accessTokenMiddleware(req, res, next);
  }

  async userApiMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<Response<Payload>> {
    try {
      const validation = await this.authenticationService.validateSession(req);

      if (!validation.isValid || !validation.session) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const payload: Payload = {
        userId: validation.session.user.id,
        projectId: MiddlewareService.DEFAULT_ORGANIZATION_ID,
        email: validation.session.user.email,
        fullName: validation.session.user.name || validation.session.user.email,
        roles: ['editor'],
      };

      return res.json(payload);
    } catch (error) {
      console.error('User API middleware error:', error);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
}
