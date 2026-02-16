import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from 'express';
import { createBetterAuthConfig } from '../../config/idp-better-auth-config.js';
import { BETTER_AUTH_SESSION_COOKIE } from '../../core/constants.js';
import { logger } from '../../core/logger.js';
import { extractPlatformParams } from '../../utils/request-utils.js';
import { PkceFlowOrchestrator } from '../auth/pkce-flow-orchestrator.js';

/**
 * Proxies Better Auth requests and completes social login flow.
 */
export class RequestHandlerService {
  private static readonly AUTH_ROUTE_PREFIX = '/auth/better-auth';

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly pkceFlowOrchestrator: PkceFlowOrchestrator
  ) {}

  setupBetterAuthHandler(expressApp: Express): void {
    expressApp.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
      if (!req.path.startsWith(RequestHandlerService.AUTH_ROUTE_PREFIX)) {
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

  convertExpressToFetchRequest(req: ExpressRequest): Request {
    try {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const method = req.method.toUpperCase();
      const headers = new Headers();

      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue;
        if (Array.isArray(value)) {
          headers.set(key, value.join(', '));
        } else {
          headers.set(key, String(value));
        }
      }

      let body: string | Buffer | null = null;
      if (method !== 'GET' && method !== 'HEAD') {
        const rawBody = req.body;
        if (rawBody !== undefined && rawBody !== null) {
          if (Buffer.isBuffer(rawBody)) {
            body = rawBody;
          } else if (typeof rawBody === 'string') {
            body = rawBody;
          } else {
            body = JSON.stringify(rawBody);
            if (!headers.has('content-type')) {
              headers.set('content-type', 'application/json');
            }
          }

          // Ensure content-length matches the rebuilt payload (or let fetch set it)
          headers.delete('content-length');
          if (typeof body === 'string') {
            headers.set('content-length', Buffer.byteLength(body).toString());
          } else if (Buffer.isBuffer(body)) {
            headers.set('content-length', body.byteLength.toString());
          }
        }
      }

      const fetchBody: BodyInit | null =
        body === null ? null : typeof body === 'string' ? body : new Uint8Array(body);

      const fetchRequest = new Request(url, {
        method,
        headers,
        body: fetchBody ?? undefined,
      });

      return fetchRequest;
    } catch (error) {
      logger.error('Failed to convert Express request to Fetch request', {}, error as Error);
      throw new Error('Failed to convert request format');
    }
  }
}
