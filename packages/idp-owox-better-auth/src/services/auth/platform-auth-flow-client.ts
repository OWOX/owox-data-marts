import type { Logger } from '@owox/internal-helpers';
import type { IdentityOwoxClient } from '../../client/IdentityOwoxClient.js';
import type { AuthFlowRequest, AuthFlowResponse } from '../../client/dto/authFlowDto.js';
import { logger as defaultLogger } from '../../core/logger.js';

export type UserInfoPayload = AuthFlowRequest;

/**
 * Client wrapper for Platform auth flow completion with logging.
 * Delegates HTTP communication to IdentityOwoxClient.
 */
export class PlatformAuthFlowClient {
  private readonly logger: Logger;

  constructor(
    private readonly identityClient: IdentityOwoxClient,
    logger?: Logger
  ) {
    this.logger = logger ?? defaultLogger;
  }

  /** Exchanges user info for a one-time authorization code. */
  async completeAuthFlow(payload: UserInfoPayload): Promise<{ code: string }> {
    this.logger.info('Completing auth flow', {
      hasState: Boolean(payload.state),
      signinProvider: payload.userInfo.signinProvider,
      userId: payload.userInfo.uid,
    });

    try {
      // Delegate HTTP communication to the client layer
      const response: AuthFlowResponse = await this.identityClient.completeAuthFlow(payload);

      this.logger.info('Auth flow completed successfully', {
        hasCode: Boolean(response.code),
      });

      return { code: response.code };
    } catch (error) {
      // Log error with context for troubleshooting
      this.logger.error('Failed to complete auth flow', {}, error as Error);
      throw error;
    }
  }
}
