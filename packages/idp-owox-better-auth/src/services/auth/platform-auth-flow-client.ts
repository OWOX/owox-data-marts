import type { IdentityOwoxClient } from '../../client/index.js';
import type { AuthFlowRequest, AuthFlowResponse } from '../../client/index.js';
import { createServiceLogger } from '../../core/logger.js';
import { maskEmail } from '../../utils/email-utils.js';

export type UserInfoPayload = AuthFlowRequest;

/**
 * Client wrapper for Platform auth flow completion with logging.
 * Delegates HTTP communication to IdentityOwoxClient.
 */
export class PlatformAuthFlowClient {
  private readonly logger = createServiceLogger(PlatformAuthFlowClient.name);

  constructor(private readonly identityClient: IdentityOwoxClient) {}

  async completeAuthFlow(payload: UserInfoPayload): Promise<{ code: string }> {
    this.logger.info('Completing auth flow', {
      hasState: Boolean(payload.state),
      uid: payload.userInfo.uid,
      signinProvider: payload.userInfo.signinProvider,
      email: maskEmail(payload.userInfo.email),
    });

    try {
      const response: AuthFlowResponse = await this.identityClient.completeAuthFlow(payload);

      this.logger.info('Auth flow completed successfully', {
        hasCode: Boolean(response.code),
      });

      return { code: response.code };
    } catch (error) {
      this.logger.error(
        'Failed to complete auth flow',
        {
          uid: payload.userInfo.uid,
          email: maskEmail(payload.userInfo.email),
          signinProvider: payload.userInfo.signinProvider,
        },
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }
}
