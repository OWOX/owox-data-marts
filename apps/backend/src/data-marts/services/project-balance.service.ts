import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { CanPerformOperationsResponseDto } from '../dto/domain/can-perform-operations-response.dto';
import { ProjectBalanceDto } from '../dto/domain/project-balance.dto';
import { ProjectPlanType } from '../enums/project-plan-type.enum';

/**
 * Service for validating operations based on balance.
 * This service interacts with the Balance API to check if operations can be performed on a project
 * and to retrieve the project's balance details.
 */
@Injectable()
export class ProjectBalanceService {
  private readonly logger = new Logger(ProjectBalanceService.name);
  private readonly auth = new GoogleAuth();

  private readonly baseUrl: string | undefined;
  private readonly targetAudience: string | undefined;
  private readonly serviceAccountEmail: string | undefined;
  private readonly isBalanceServiceConfigured: boolean;

  // Cache fields
  private cachedIdToken: string;
  private idTokenExpiresAt: number = 0;
  private idTokenPromise: Promise<string> | null = null;

  constructor(private readonly configService: ConfigService) {
    this.serviceAccountEmail = this.configService.get<string>(
      'BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT'
    );
    this.targetAudience = this.configService.get<string>('BALANCE_ENDPOINT_TARGET_AUDIENCE');
    this.baseUrl = this.configService.get<string>('BALANCE_ENDPOINT_BASE_URL');

    if (this.baseUrl && this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }

    if (!this.baseUrl && !this.serviceAccountEmail && !this.targetAudience) {
      // Balance service is not configured. Silently ignore all balance checks.
      this.isBalanceServiceConfigured = false;
      this.logger.log('Balance service is not configured. Skipping balance checks.');
      return;
    }

    if (!this.baseUrl || !this.serviceAccountEmail || !this.targetAudience) {
      throw new Error(
        'Balance service is partially configured. Please check the following environment variables: BALANCE_ENDPOINT_BASE_URL, BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT, BALANCE_ENDPOINT_TARGET_AUDIENCE'
      );
    }

    this.isBalanceServiceConfigured = true;
  }

  /**
   * Verifies that operations can be performed for the specified project.
   * @throws {ProjectOperationBlockedException} If operations are not allowed.
   */
  public async verifyCanPerformOperations(projectId: string): Promise<void> {
    const result = await this.canPerformOperations(projectId);
    if (!result.allowed) {
      throw new ProjectOperationBlockedException(result.blockedReasons);
    }
  }

  /**
   * Checks if operations can be performed for the specified project.
   * @param projectId Project ID
   */
  public async canPerformOperations(projectId: string): Promise<CanPerformOperationsResponseDto> {
    if (!this.isBalanceServiceConfigured) {
      return { allowed: true, blockedReasons: [] };
    }

    try {
      const response = await this.fetchBalanceApi(
        `${this.baseUrl}/${projectId}/operation/can-perform`
      );
      return (await response.json()) as CanPerformOperationsResponseDto;
    } catch (error) {
      this.logger.error(
        `Error checking balance for project ${projectId}: ${error?.message || error}`
      );
      throw error;
    }
  }

  /**
   * Gets project balance for the specified project.
   * @param projectId Project ID
   */
  public async getBalance(projectId: string): Promise<ProjectBalanceDto> {
    if (!this.isBalanceServiceConfigured) {
      return {
        subscriptionPlanType: ProjectPlanType.FREE,
        availableCredits: 0,
        consumedCredits: 0,
        creditUsagePercentage: 0,
      };
    }

    try {
      const response = await this.fetchBalanceApi(`${this.baseUrl}/${projectId}/balance`);
      return (await response.json()) as ProjectBalanceDto;
    } catch (error) {
      this.logger.error(
        `Error getting balance for project ${projectId}: ${error?.message || error}`
      );
      throw error;
    }
  }

  /**
   * Gets Balance API response for the specified project url.
   */
  private async fetchBalanceApi(url: string): Promise<Response> {
    const idToken = await this.getIdToken();
    const response = await fetchWithBackoff(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const errorMessage = `Balance API request failed with status ${response.status}. Response: ${errorBody}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    return response;
  }

  /**
   * Returns a valid ID token, either from cache or by fetching a new one.
   */
  private async getIdToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    // 1. Check if we have a cached token that is valid for at least another 5 minutes
    if (this.cachedIdToken && this.idTokenExpiresAt > now + 300) {
      return this.cachedIdToken;
    }

    // 2. If a request is already in progress, return the existing promise
    if (this.idTokenPromise) {
      return this.idTokenPromise;
    }

    // 3. Start a new token fetch process
    this.idTokenPromise = this.fetchAndCacheIdToken();

    try {
      return await this.idTokenPromise;
    } finally {
      // Clear the promise so that future calls can trigger a new refresh if needed
      this.idTokenPromise = null;
    }
  }

  /**
   * Performs the actual token generation and updates the cache.
   */
  private async fetchAndCacheIdToken(): Promise<string> {
    try {
      const authClient = await this.auth.getClient();

      const targetClient = new Impersonated({
        sourceClient: authClient,
        targetPrincipal: this.serviceAccountEmail!,
        targetScopes: ['openid'],
        lifetime: 3600,
      });

      const token = await targetClient.fetchIdToken(this.targetAudience!, {
        includeEmail: true,
      });

      // Update cache
      this.cachedIdToken = token;

      try {
        // Decode JWT to get expiration time
        const decoded = jwt.decode(token) as { exp: number };
        // Default to 10 min if exp is missing
        this.idTokenExpiresAt = decoded?.exp || Math.floor(Date.now() / 1000) + 600;
      } catch (decodeError) {
        this.logger.warn(
          `Failed to decode ID token expiration. Using default 10 min. Error: ${decodeError?.message || decodeError}`
        );
        this.idTokenExpiresAt = Math.floor(Date.now() / 1000) + 600;
      }

      return token;
    } catch (error) {
      this.logger.error(`Error generating ID token: ${error?.message || error}`);
      throw new Error(
        'Failed to generate ID token. Please check the BALANCE_ENDPOINT_* environment variables.'
      );
    }
  }
}
