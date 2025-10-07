import { createBetterAuthConfig } from '../auth/auth-config.js';
import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from 'express';
import { logger } from '../logger.js';

export class RequestHandlerService {
  private static readonly AUTH_ROUTE_PREFIX = '/auth/better-auth';

  constructor(private readonly auth: Awaited<ReturnType<typeof createBetterAuthConfig>>) {}

  setupBetterAuthHandler(expressApp: Express): void {
    expressApp.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
      if (!req.path.startsWith(RequestHandlerService.AUTH_ROUTE_PREFIX)) {
        return next();
      }

      try {
        const fetchRequest = this.convertExpressToFetchRequest(req);
        const response = await this.auth.handler(fetchRequest);

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
