import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from 'express';
import { createBetterAuthConfig } from '../config/idp-better-auth-config.js';
import { logger } from '../logger.js';
import { extractPlatformParams } from '../utils/request-utils.js';
import { BETTER_AUTH_SESSION_COOKIE } from '../constants.js';
import { FlowCompletionService } from './flow-completion-service.js';

/**
 * Proxies Better Auth requests and completes social login flow.
 */
export class RequestHandlerService {
  private static readonly AUTH_ROUTE_PREFIX = '/auth/better-auth';

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly flowCompletionService: FlowCompletionService
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
    const getSetCookieFn = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
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

    const cookieName = this.escapeRegex(BETTER_AUTH_SESSION_COOKIE);
    for (const h of rawHeaders) {
      const match = h.match(new RegExp(`${cookieName}=([^;]+)`));
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
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

    const redirectUrl = await this.flowCompletionService.completeWithSocialSessionToken(
      sessionToken,
      extractPlatformParams(req),
      req,
      res
    );
    if (redirectUrl) {
      res.redirect(redirectUrl.toString());
      return true;
    }
    return false;
  }

  convertExpressToFetchRequest(req: ExpressRequest): Request {
    try {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const method = req.method;
      const headers = new Headers();

      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers.set(key, value);
        }
      }

      const fetchRequest = new Request(url, {
        method,
        headers,
        body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
      });

      return fetchRequest;
    } catch (error) {
      logger.error('Failed to convert Express request to Fetch request', {}, error as Error);
      throw new Error('Failed to convert request format');
    }
  }
}
