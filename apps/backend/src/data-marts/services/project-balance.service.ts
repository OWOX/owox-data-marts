import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import {
  CanPerformOperationsResponseDto,
  CanPerformOperationsResponseSchema,
} from '../dto/domain/can-perform-operations-response.dto';
import { ProjectBalanceDto, ProjectBalanceSchema } from '../dto/domain/project-balance.dto';
import { ProjectPlanType } from '../enums/project-plan-type.enum';

/**
 * Service for validating operations based on balance.
 * This service interacts with the Balance API to check if operations can be performed on a project
 * and to retrieve the project's balance details.
 */
@Injectable()
export class ProjectBalanceService {
  private readonly logger = new Logger(ProjectBalanceService.name);
  private readonly impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();

  private readonly baseUrl: string | undefined;
  private readonly targetAudience: string | undefined;
  private readonly serviceAccountEmail: string | undefined;
  private readonly isBalanceServiceConfigured: boolean;

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
      const data = await response.json();
      return CanPerformOperationsResponseSchema.parse(data);
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
      const data = await response.json();
      return ProjectBalanceSchema.parse(data);
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
    const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
      this.serviceAccountEmail!,
      this.targetAudience!
    );
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
}
