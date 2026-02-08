import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { IdentityOwoxClientConfig } from '../config/idp-owox-config.js';
import { logger } from '../logger.js';

/**
 * Payload sent to the backend to complete auth flow.
 */
export interface UserInfoPayload {
  state: string;
  userInfo: {
    uid: string;
    signinProvider: string;
    email: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    avatar?: string;
  };
}

/**
 * Calls the backend to exchange user info for a one-time auth code.
 */
export class AuthFlowService {
  private readonly impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();

  constructor(
    private readonly config: Pick<
      IdentityOwoxClientConfig,
      'baseUrl' | 'authCompleteEndpoint' | 'c2cServiceAccountEmail' | 'c2cTargetAudience'
    >
  ) {}

  private ensureConfigured(): void {
    if (!this.config.c2cServiceAccountEmail || !this.config.c2cTargetAudience) {
      throw new Error('IDP OWOX auth flow is not configured');
    }
  }

  async completeAuthFlow(payload: UserInfoPayload): Promise<{ code: string }> {
    this.ensureConfigured();
    logger.info('Completing auth flow', {
      hasState: Boolean(payload.state),
      signinProvider: payload.userInfo.signinProvider,
      userId: payload.userInfo.uid,
    });
    const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
      this.config.c2cServiceAccountEmail!,
      this.config.c2cTargetAudience!
    );

    const endpoint = new URL(this.config.authCompleteEndpoint, this.config.baseUrl).toString();
    const response = await fetchWithBackoff(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) {
      const errorMessage = `IDP OWOX request failed with status ${response.status}. Response: ${text}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    try {
      const parsed = JSON.parse(text) as { code?: string };
      if (!parsed.code) {
        throw new Error('Response does not contain code');
      }
      return { code: parsed.code };
    } catch (error) {
      logger.error('Failed to parse IDP OWOX response', {}, error as Error);
      throw new Error('Failed to parse IDP OWOX response');
    }
  }
}
