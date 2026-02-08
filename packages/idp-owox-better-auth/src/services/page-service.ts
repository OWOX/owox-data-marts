import { ProtocolRoute } from '@owox/idp-protocol';
import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { TemplateService } from './template-service.js';
import { extractPlatformParams, persistPlatformContext } from '../utils/request-utils.js';

const AUTH_BASE_PATH = '/auth';

/**
 * Renders static auth pages and persists platform context.
 */
export class PageService {
  private persistPlatformContext(req: ExpressRequest, res: ExpressResponse): void {
    const state = typeof req.query?.state === 'string' ? req.query.state : undefined;
    const params = extractPlatformParams(req);
    persistPlatformContext(req, res, { state, params });
  }

  async signInPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    this.persistPlatformContext(req, res);
    res.send(TemplateService.renderSignIn());
  }

  async signUpPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    this.persistPlatformContext(req, res);
    res.send(TemplateService.renderSignUp());
  }

  registerRoutes(express: Express): void {
    const signInPath = `${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}`;
    express.get(AUTH_BASE_PATH, (_req, res) => res.redirect(signInPath));
  }
}
