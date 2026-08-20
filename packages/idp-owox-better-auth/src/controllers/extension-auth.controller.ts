import type {
  Express,
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { AUTH_BASE_PATH } from '../core/constants.js';
import {
  AuthenticationException,
  BaseException,
  IdentityApiException,
} from '../core/exceptions.js';
import { createServiceLogger } from '../core/logger.js';
import {
  ExtensionAuthRequestSchema,
  ExtensionRevokeRequestSchema,
  type ExtensionAuthRequest,
  type ExtensionRevokeRequest,
} from '../dto/extension-auth-request.dto.js';
import type { ExtensionAuthService } from '../services/auth/extension-auth-service.js';
import { validateBody } from '../services/middleware/validation-middleware.js';

export interface ExtensionAuthControllerConfig {
  allowedOrigins: string[];
}

/** Public Microsoft NAA exchange API for project-scoped extension tokens. */
export class ExtensionAuthController {
  private readonly logger = createServiceLogger(ExtensionAuthController.name);
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly service: ExtensionAuthService,
    config: ExtensionAuthControllerConfig
  ) {
    this.allowedOrigins = new Set(config.allowedOrigins);
  }

  async authenticate(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const body = req.body as ExtensionAuthRequest;
      if ('assertion_type' in body) {
        const result = await this.service.exchangeMicrosoftAssertion(
          body.assertion,
          body.project_id
        );
        if (result.status === 'unknown_identity') {
          res.json({ status: 'unknown_identity' });
          return;
        }
        res.json(result.auth);
        return;
      }

      res.json(await this.service.refreshProjectToken(body.refresh_token));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  async revoke(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const body = req.body as ExtensionRevokeRequest;
      await this.service.revokeProjectToken(body.refresh_token);
      res.status(204).send();
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  registerRoutes(express: Express): void {
    const extensionPath = `${AUTH_BASE_PATH}/api/extension`;
    const revokePath = `${extensionPath}/revoke`;
    const cors = this.cors.bind(this);
    express.options(extensionPath, cors);
    express.options(revokePath, cors);
    express.post(
      extensionPath,
      cors,
      validateBody(ExtensionAuthRequestSchema),
      this.authenticate.bind(this)
    );
    express.post(
      revokePath,
      cors,
      validateBody(ExtensionRevokeRequestSchema),
      this.revoke.bind(this)
    );
  }

  private cors(req: ExpressRequest, res: ExpressResponse, next: NextFunction): void {
    const origin = req.header('origin');
    if (!origin) {
      next();
      return;
    }
    if (!this.allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'origin_not_allowed' });
      return;
    }
    res.vary('Origin');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  }

  private handleError(error: unknown, req: ExpressRequest, res: ExpressResponse): void {
    const known = error instanceof BaseException;
    const status = known ? (error.status ?? 500) : 500;
    this.logger[status >= 500 ? 'error' : 'info'](
      `Extension authentication failed: ${known ? error.name : 'UnknownError'}`,
      { path: req.path, status },
      error instanceof Error ? error : undefined
    );

    if (error instanceof IdentityApiException) {
      const body = error.context?.body as Record<string, unknown> | undefined;
      if (body) {
        res.status(status).json(body);
        return;
      }
    }
    if (error instanceof AuthenticationException) {
      res.status(status).json({
        error: 'invalid_token',
        ...(error.description ? { description: error.description } : {}),
      });
      return;
    }
    res.status(status).json({ error: known ? error.publicMessage : 'Internal server error' });
  }
}
