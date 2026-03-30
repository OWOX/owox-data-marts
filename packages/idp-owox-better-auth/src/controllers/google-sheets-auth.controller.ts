import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { AUTH_BASE_PATH } from '../core/constants.js';
import { createServiceLogger } from '../core/logger.js';
import { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import { BaseException } from '../core/exceptions.js';
import type { AuthResult } from '@owox/idp-protocol';
import {
  GoogleSheetsExtensionAuthRequestSchema,
  type GoogleSheetsExtensionAuthRequest,
} from '../dto/google-sheets-auth-request.dto.js';
import { validateBody } from '../services/middleware/validation-middleware.js';

/**
 * Controller for Google Sheets Extension authentication
 * Handles POST /auth/api/google-sheets-extension endpoint
 */
export class GoogleSheetsExtensionAuthController {
  private readonly logger = createServiceLogger(GoogleSheetsExtensionAuthController.name);

  constructor(private readonly tokenFacade: OwoxTokenFacade) {}

  /**
   * Issues OWOX tokens for the Google Sheets Extension.
   * Accepts either a Google ID token (initial auth) or a refresh token (token renewal).
   * Token validation and user lookup are handled by the identity service.
   */
  async authenticate(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    try {
      const body = req.body as GoogleSheetsExtensionAuthRequest;

      let authResult: AuthResult;

      if (body.google_id_token) {
        this.logger.info('Google Sheets Extension: authenticating via Google ID token', {
          hasProjectId: !!body.project_id,
        });
        authResult = await this.tokenFacade.exchangeGoogleIdToken(
          body.google_id_token,
          body.project_id
        );
      } else {
        this.logger.info('Google Sheets Extension: refreshing tokens via refresh token', {
          hasProjectId: !!body.project_id,
        });
        authResult = await this.tokenFacade.refreshToken(body.refresh_token!);
      }

      const response: AuthResult = {
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken,
        accessTokenExpiresIn: authResult.accessTokenExpiresIn,
        refreshTokenExpiresIn: authResult.refreshTokenExpiresIn,
      };
      res.json(response);
    } catch (error) {
      const isKnownError = error instanceof BaseException;
      const status = isKnownError ? (error.status ?? 500) : 500;
      const message = isKnownError ? error.publicMessage : 'Internal server error';

      this.logger[status >= 500 ? 'error' : 'info'](
        `Google Sheets Extension authentication failed: ${isKnownError ? error.name : 'UnknownError'}`,
        {
          path: req.path,
          status,
          ...(isKnownError ? error.context : {}),
        },
        error instanceof Error ? error : undefined
      );

      res.status(status).json({ error: message });
    }
  }

  registerRoutes(express: Express): void {
    try {
      express.post(
        `${AUTH_BASE_PATH}/api/google-sheets-extension`,
        validateBody(GoogleSheetsExtensionAuthRequestSchema),
        this.authenticate.bind(this)
      );
    } catch (error) {
      this.logger.error(
        'Failed to register Google Sheets Extension auth routes',
        {},
        error instanceof Error ? error : undefined
      );
    }
  }
}
