import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { logger } from '../logger.js';

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

export class AuthFlowService {
  private readonly impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();
  private readonly endpoint: string;
  private readonly serviceAccountEmail: string | undefined;
  private readonly targetAudience: string | undefined;

  constructor() {
    this.endpoint =
      process.env.INTEGRATED_BACKEND_AUTH_COMPLETE_ENDPOINT ||
      'https://integrated-backend.bi.owox.com/internal-api/idp/auth-flow/complete';
    this.serviceAccountEmail = process.env.INTEGRATED_BACKEND_SERVICE_ACCOUNT;
    this.targetAudience = process.env.INTEGRATED_BACKEND_TARGET_AUDIENCE;
  }

  private ensureConfigured(): void {
    if (!this.serviceAccountEmail || !this.targetAudience) {
      throw new Error('Integrated backend auth flow is not configured');
    }
  }

  async completeAuthFlow(payload: UserInfoPayload): Promise<{ code: string }> {
    this.ensureConfigured();
    console.log('❌❌❌ completeAuthFlow', payload);
    const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
      this.serviceAccountEmail!,
      this.targetAudience!
    );

    const response = await fetchWithBackoff(this.endpoint, {
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
      const errorMessage = `Integrated backend request failed with status ${response.status}. Response: ${text}`;
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
      logger.error('Failed to parse integrated backend response', {}, error as Error);
      throw new Error('Failed to parse integrated backend response');
    }
  }
}
