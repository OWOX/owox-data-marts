import { ProtocolRoute } from '@owox/idp-protocol';
import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { AUTH_BASE_PATH, parseMagicLinkIntent } from '../core/constants.js';
import { TemplateService } from '../services/rendering/template-service.js';
import type { UiAuthProviders } from '../types/index.js';
import { extractPlatformParams, persistPlatformContext } from '../utils/request-utils.js';

/**
 * Renders static auth pages and persists platform context.
 */
export class PageController {
  constructor(
    private readonly providers: UiAuthProviders,
    private readonly gtmContainerId?: string
  ) {}

  private persistPlatformContext(req: ExpressRequest, res: ExpressResponse): void {
    const state = typeof req.query?.state === 'string' ? req.query.state : undefined;
    const params = extractPlatformParams(req);
    persistPlatformContext(req, res, { state, params });
  }

  async signInPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    this.persistPlatformContext(req, res);
    const errorMessage = typeof req.query?.error === 'string' ? req.query.error : undefined;
    const infoMessage = typeof req.query?.info === 'string' ? req.query.info : undefined;
    res.send(
      TemplateService.renderSignIn({
        errorMessage,
        infoMessage,
        providers: this.providers,
        gtmContainerId: this.gtmContainerId,
      })
    );
  }

  async signUpPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    this.persistPlatformContext(req, res);
    const errorMessage = typeof req.query?.error === 'string' ? req.query.error : undefined;
    const infoMessage = typeof req.query?.info === 'string' ? req.query.info : undefined;
    res.send(
      TemplateService.renderSignUp({
        errorMessage,
        infoMessage,
        providers: this.providers,
        gtmContainerId: this.gtmContainerId,
      })
    );
  }

  private sanitizeCallbackURL(rawCallbackURL: string, req: ExpressRequest): string {
    if (!rawCallbackURL) {
      return '';
    }
    try {
      const requestOrigin = `${req.protocol}://${req.get('host')}`;
      const callback = new URL(rawCallbackURL, requestOrigin);
      if (callback.origin !== requestOrigin) {
        return '';
      }
      return callback.toString();
    } catch {
      return '';
    }
  }

  async magicLinkConfirmPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const token = typeof req.query?.token === 'string' ? req.query.token : '';
    const callbackURL = this.sanitizeCallbackURL(
      typeof req.query?.callbackURL === 'string' ? req.query.callbackURL : '',
      req
    );
    const intent = parseMagicLinkIntent(req.query?.intent);
    res.send(
      TemplateService.renderMagicLinkConfirm({
        token,
        callbackURL,
        intent,
        gtmContainerId: this.gtmContainerId,
      })
    );
  }

  async forgotPasswordPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const errorMessage = typeof req.query?.error === 'string' ? req.query.error : undefined;
    const infoMessage = typeof req.query?.info === 'string' ? req.query.info : undefined;
    res.send(
      TemplateService.renderForgotPassword({
        errorMessage,
        infoMessage,
        gtmContainerId: this.gtmContainerId,
      })
    );
  }

  registerRoutes(express: Express): void {
    const signInPath = `${AUTH_BASE_PATH}${ProtocolRoute.SIGN_IN}`;
    express.get(AUTH_BASE_PATH, (_req, res) => res.redirect(signInPath));
    express.get(`${AUTH_BASE_PATH}/magic-link`, this.magicLinkConfirmPage.bind(this));
    express.get(`${AUTH_BASE_PATH}/forgot-password`, this.forgotPasswordPage.bind(this));
  }
}
