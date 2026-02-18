import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from 'express';
import { createBetterAuthConfig } from '../../config/idp-better-auth-config.js';
import { BETTER_AUTH_BASE_PATH, BETTER_AUTH_SESSION_COOKIE } from '../../core/constants.js';
import { logger } from '../../core/logger.js';
import { convertExpressToFetchRequest } from '../../utils/express-compat.js';
import { extractPlatformParams } from '../../utils/request-utils.js';
import { PkceFlowOrchestrator } from '../auth/pkce-flow-orchestrator.js';

/**
 * Proxies Better Auth requests and completes social login flow.
 */
export class BetterAuthProxyHandler {
  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly pkceFlowOrchestrator: PkceFlowOrchestrator
  ) {}

  setupBetterAuthHandler(expressApp: Express): void {
    expressApp.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
      if (!req.path.startsWith(BETTER_AUTH_BASE_PATH)) {
        return next();
      }

      try {
        const fetchRequest = this.convertExpressToFetchRequest(req);
        const response = await this.auth.handler(fetchRequest);

        const redirected = await this.tryCompleteAuthFlow(req, response, res);
        if (redirected) {
          return;
        }

        response.headers.forEach((value: string, key: string) => {
          res.set(key, value);
        });

        res.status(response.status);
        const body = await response.text();
        res.send(body);
      } catch (error) {
        logger.error('Auth handler error', { path: req.path }, error as Error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  private getSessionTokenFromResponse(response: Response): string | null {
    const rawHeaders: string[] = [];
    const getSetCookieFn = (response.headers as unknown as { getSetCookie?: () => string[] })
      .getSetCookie;
    const getSetCookie =
      typeof getSetCookieFn === 'function'
        ? getSetCookieFn.bind(response.headers as unknown as object)
        : undefined;
    if (typeof getSetCookie === 'function') {
      rawHeaders.push(...getSetCookie());
    }
    const header = response.headers.get('set-cookie');
    if (header) {
      rawHeaders.push(...header.split(/,(?=[^;]+=[^;]+)/g));
    }

    const candidateCookieNames = [
      BETTER_AUTH_SESSION_COOKIE,
      `__Secure-${BETTER_AUTH_SESSION_COOKIE}`,
      `__Host-${BETTER_AUTH_SESSION_COOKIE}`,
    ];
    for (const h of rawHeaders) {
      for (const cookieName of candidateCookieNames) {
        const escapedCookieName = this.escapeRegex(cookieName);
        const match = h.match(new RegExp(`(?:^|\\s*)${escapedCookieName}=([^;]+)`));
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
      }
    }
    return null;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async tryCompleteAuthFlow(
    req: ExpressRequest,
    response: Response,
    res: ExpressResponse
  ): Promise<boolean> {
    const sessionToken = this.getSessionTokenFromResponse(response);
    if (!sessionToken) return false;
    const callbackProviderId = this.resolveCallbackProviderId(req.path);

    const redirectUrl = await this.pkceFlowOrchestrator.completeWithSocialSessionToken(
      sessionToken,
      extractPlatformParams(req),
      req,
      res,
      callbackProviderId
    );
    if (redirectUrl) {
      res.redirect(redirectUrl.toString());
      return true;
    }
    return false;
  }

  private resolveCallbackProviderId(path: string | undefined): string | undefined {
    if (!path) return undefined;
    const callbackMatch = path.match(/\/callback\/([^/]+)/);
    if (callbackMatch?.[1]) {
      return callbackMatch[1].trim().toLowerCase();
    }
    if (path.includes('/sign-in/email') || path.includes('/sign-up/email')) {
      return 'credential';
    }
    return undefined;
  }

  convertExpressToFetchRequest(req: ExpressRequest): globalThis.Request {
    return convertExpressToFetchRequest(req, logger);
  }
}
