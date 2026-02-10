import type { IdentityOwoxClient } from '../../client/IdentityOwoxClient.js';
import type { AuthFlowRequest, AuthFlowResponse } from '../../client/dto/authFlowDto.js';
import { logger } from '../../core/logger.js';

export type UserInfoPayload = AuthFlowRequest;

/**
 * Client wrapper for Platform auth flow completion with logging.
 * Delegates HTTP communication to IdentityOwoxClient.
 */
export class PlatformAuthFlowClient {
  constructor(private readonly identityClient: IdentityOwoxClient) {}

  /** Exchanges user info for a one-time authorization code. */
  async completeAuthFlow(payload: UserInfoPayload): Promise<{ code: string }> {
    logger.info('Completing auth flow', {
      hasState: Boolean(payload.state),
      signinProvider: payload.userInfo.signinProvider,
      userId: payload.userInfo.uid,
    });

    try {
      // Delegate HTTP communication to the client layer
      const response: AuthFlowResponse = await this.identityClient.completeAuthFlow(payload);

      logger.info('Auth flow completed successfully', {
        hasCode: Boolean(response.code),
      });

      return { code: response.code };
    } catch (error) {
      // Log error with context for troubleshooting
      logger.error('Failed to complete auth flow', {}, error as Error);
      throw error;
    }
  }
}
