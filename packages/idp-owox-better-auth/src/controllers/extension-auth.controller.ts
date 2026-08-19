import type { AuthResult } from '@owox/idp-protocol';
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
  ExtensionProjectTokenRequestSchema,
  ExtensionRevokeRequestSchema,
  type ExtensionAuthRequest,
  type ExtensionProjectTokenRequest,
  type ExtensionRevokeRequest,
} from '../dto/extension-auth-request.dto.js';
import type { ExtensionAuthService } from '../services/auth/extension-auth-service.js';
import { validateBody } from '../services/middleware/validation-middleware.js';

export interface ExtensionAuthControllerConfig {
  allowedOrigins: string[];
}

/** Host-neutral public API for extension identity and project-token flows. */
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
        res.json(ExtensionAuthController.toAuthResponse(result.auth));
        return;
      }

      const auth = await this.service.refreshIdentitySession(body.refresh_token);
      res.json(ExtensionAuthController.toAuthResponse(auth));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  async listProjects(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const accessToken = ExtensionAuthController.requireBearerToken(req);
      res.json(await this.service.listProjects(accessToken));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  async projectToken(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const body = req.body as ExtensionProjectTokenRequest;
      const authorization = req.header('authorization');
      let auth: AuthResult;
      if ('project_id' in body) {
        const accessToken = ExtensionAuthController.requireBearerToken(req);
        auth = await this.service.exchangeProjectToken(accessToken, body.project_id);
      } else {
        if (authorization) {
          res.status(400).json({ error: 'ambiguous_auth_mode' });
          return;
        }
        auth = await this.service.refreshProjectToken(body.refresh_token);
      }
      res.json(ExtensionAuthController.toAuthResponse(auth));
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  async revoke(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const body = req.body as ExtensionRevokeRequest;
      await this.service.revoke(body.refresh_token);
      res.status(204).send();
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  registerRoutes(express: Express): void {
    const extensionPath = `${AUTH_BASE_PATH}/api/extension`;
    const cors = this.cors.bind(this);
    for (const path of [
      extensionPath,
      `${extensionPath}/projects`,
      `${extensionPath}/project-token`,
      `${extensionPath}/revoke`,
    ]) {
      express.options(path, cors);
    }
    express.post(
      extensionPath,
      cors,
      validateBody(ExtensionAuthRequestSchema),
      this.authenticate.bind(this)
    );
    express.get(`${extensionPath}/projects`, cors, this.listProjects.bind(this));
    express.post(
      `${extensionPath}/project-token`,
      cors,
      validateBody(ExtensionProjectTokenRequestSchema),
      this.projectToken.bind(this)
    );
    express.post(
      `${extensionPath}/revoke`,
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
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
      !known && error instanceof Error ? error : undefined
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

  private static requireBearerToken(req: ExpressRequest): string {
    const authorization = req.header('authorization');
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      throw new AuthenticationException('Bearer identity-session access token is required', {
        description: 'missing_access_token',
      });
    }
    return match[1]!;
  }

  private static toAuthResponse(auth: AuthResult): AuthResult {
    return {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      accessTokenExpiresIn: auth.accessTokenExpiresIn,
      refreshTokenExpiresIn: auth.refreshTokenExpiresIn,
    };
  }
}
