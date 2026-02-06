import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from 'express';
import { createBetterAuthConfig } from '../config/idp-better-auth-config.js';
import { logger } from '../logger.js';
import { buildAuthRequestContext } from '../types/auth-request-context.js';
import { buildPlatformRedirectUrl } from '../utils/platform-redirect-builder.js';
import { clearPlatformCookies, extractPlatformParams } from '../utils/request-utils.js';
import { AuthenticationService } from './authentication-service.js';
import { IdpOwoxConfig } from '../config/idp-owox-config.js';

export class RequestHandlerService {
  private static readonly AUTH_ROUTE_PREFIX = '/auth/better-auth';

  constructor(
    private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>,
    private readonly authenticationService: AuthenticationService,
    private readonly idpOwoxConfig: IdpOwoxConfig
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

  private getRefreshTokenFromResponse(response: Response): string | null {
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

    for (const h of rawHeaders) {
      const match = h.match(/refreshToken=([^;]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
    return null;
  }

  private async tryCompleteAuthFlow(
    req: ExpressRequest,
    response: Response,
    res: ExpressResponse
  ): Promise<boolean> {
    const context = buildAuthRequestContext(req);
    try {
      const refreshToken = this.getRefreshTokenFromResponse(response);
      if (!refreshToken) return false;

      const stateFromReq = context.state || '';
      console.log('🎉🎉🎉 completeAuthFlowWithRefreshToken', refreshToken, stateFromReq);
      const { code, payload } = await this.authenticationService.completeAuthFlowWithRefreshToken(
        refreshToken,
        stateFromReq
      );
      const state = stateFromReq || payload.state;

      const url = this.buildPlatformCodeRedirectUrl(req, code, state);
      if (url) {
        clearPlatformCookies(res);
        res.redirect(url.toString());
        return true;
      }
    } catch (error) {
      logger.warn('Failed to auto-complete auth flow on callback', {}, error as Error);
      clearPlatformCookies(res);
      res.redirect('/auth/signin');
      return true;
    }
    return false;
  }

  private buildPlatformCodeRedirectUrl(
    req: ExpressRequest,
    code: string,
    state: string
  ): URL | null {
    return buildPlatformRedirectUrl({
      baseUrl: this.idpOwoxConfig.idpConfig.platformSignInUrl,
      code,
      state,
      params: extractPlatformParams(req),
      defaultSource: 'app',
    });
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
