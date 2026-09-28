import { ProtocolRoute } from '@owox/idp-protocol';
import { sendSecureHtml } from '@owox/internal-helpers';
import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { AUTH_BASE_PATH, parseMagicLinkIntent } from '../core/constants.js';
import { TemplateService } from '../services/rendering/template-service.js';
import type { UiAuthProviders } from '../types/index.js';
import {
  clearPendingAction,
  extractAuthFlowParams,
  persistAuthFlowContext,
  readPendingActionFromCookie,
} from '../utils/request-utils.js';

type AutoSubmitProvider = 'google' | 'microsoft';

function resolveAutoSubmitProvider(
  hasQueryState: boolean,
  pendingAction: string | undefined,
  enabledProviders: UiAuthProviders
): AutoSubmitProvider | undefined {
  if (!hasQueryState) return undefined;
  if (pendingAction !== 'google' && pendingAction !== 'microsoft') return undefined;
  return enabledProviders[pendingAction] ? pendingAction : undefined;
}

/**
 * Renders static auth pages and persists auth-flow context.
 */
export class PageController {
  constructor(
    private readonly providers: UiAuthProviders,
    private readonly gtmContainerId?: string
  ) {}

  private persistAuthFlowContext(req: ExpressRequest, res: ExpressResponse): void {
    const state = typeof req.query?.state === 'string' ? req.query.state : undefined;
    const params = extractAuthFlowParams(req);
    persistAuthFlowContext(req, res, { state, params });
  }

  /**
   * Whether *this exact request* is a genuine return leg from the Platform
   * round trip (state literally present in its own query), never merely
   * "some state cookie happens to still be around". Deliberately not
   * cookie-inclusive: a stale leftover cookie (abandoned attempt, an error
   * path that didn't clear it, etc.) must not be trusted as fresh, and -
   * more importantly - this value gates auto-submitting a sign-in action
   * with no further click, so it must not be satisfiable by a query
   * parameter alone (a crafted `?state=x&pendingAction=google` link).
   */
  private hasQueryState(req: ExpressRequest): boolean {
    return typeof req.query?.state === 'string' && req.query.state.length > 0;
  }

  async signInPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const hasState = this.hasQueryState(req);
    const autoSubmitProvider = resolveAutoSubmitProvider(
      hasState,
      readPendingActionFromCookie(req),
      this.providers
    );
    this.persistAuthFlowContext(req, res);
    // pendingAction is single-use: once read for this render, drop it so a
    // later reload of this same page does not silently replay a stale action.
    clearPendingAction(req, res);
    const errorMessage = typeof req.query?.error === 'string' ? req.query.error : undefined;
    const infoMessage = typeof req.query?.info === 'string' ? req.query.info : undefined;
    sendSecureHtml(
      res,
      TemplateService.renderSignIn({
        errorMessage,
        infoMessage,
        providers: this.providers,
        gtmContainerId: this.gtmContainerId,
        hasState,
        autoSubmitProvider,
      })
    );
  }

  async signUpPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const hasState = this.hasQueryState(req);
    const autoSubmitProvider = resolveAutoSubmitProvider(
      hasState,
      readPendingActionFromCookie(req),
      this.providers
    );
    this.persistAuthFlowContext(req, res);
    clearPendingAction(req, res);
    const errorMessage = typeof req.query?.error === 'string' ? req.query.error : undefined;
    const infoMessage = typeof req.query?.info === 'string' ? req.query.info : undefined;
    sendSecureHtml(
      res,
      TemplateService.renderSignUp({
        errorMessage,
        infoMessage,
        providers: this.providers,
        gtmContainerId: this.gtmContainerId,
        autoSubmitProvider,
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
    sendSecureHtml(
      res,
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
    sendSecureHtml(
      res,
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
