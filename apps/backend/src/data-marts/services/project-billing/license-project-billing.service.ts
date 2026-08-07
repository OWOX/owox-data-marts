import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import {
  AppEditionConfig,
  LicenseContext,
} from '../../../common/config/app-edition-config.service';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { CanPerformOperationsResponseSchema } from '../../dto/domain/can-perform-operations-response.dto';
import { ProjectBalanceDto, ProjectBalanceSchema } from '../../dto/domain/project-balance.dto';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';
import {
  buildConsumptionPayload,
  ConsumptionEvent,
  isReportRun,
  ProjectBilling,
  RunAuthorizationRequest,
  RunGrant,
} from './project-billing';

/** Not configurable: the license key travels here as a bearer token, so a redirectable base URL would leak it. */
const LICENSE_CLOUD_BASE_URL = 'https://app.owox.com';

/**
 * Billing for self-managed deployments: authorization and consumption are proxied through
 * OWOX Cloud, which resolves the billing project from the signed license.
 */
@Injectable()
export class LicenseProjectBilling implements ProjectBilling {
  private readonly logger = new Logger(LicenseProjectBilling.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly appEditionConfig: AppEditionConfig
  ) {}

  public async authorizeRun(request: RunAuthorizationRequest): Promise<RunGrant> {
    const grant = { projectId: request.projectId, runKind: request.runKind };
    if (!isReportRun(request.runKind)) {
      return grant;
    }

    const response = await this.callCloud('can-perform');
    const decision = CanPerformOperationsResponseSchema.parse(await response.json());
    if (!decision.allowed) {
      throw new ProjectOperationBlockedException(decision.blockedReasons);
    }
    return grant;
  }

  public async registerConsumption(grant: RunGrant, event: ConsumptionEvent): Promise<void> {
    if (!isReportRun(event.kind)) {
      this.logger.debug(`${event.kind} is not billed through the license gateway, skipping...`);
      return;
    }

    try {
      await this.callCloud('consumption', {
        kind: event.kind,
        payload: buildConsumptionPayload(event),
      });
    } catch (error) {
      this.logger.error(
        `Failed to report ${event.kind} consumption for project ${grant.projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  public async getBalance(): Promise<ProjectBalanceDto> {
    try {
      const response = await this.callCloud('balance');
      return ProjectBalanceSchema.parse(await response.json());
    } catch (error) {
      this.logger.error(
        `Failed to read balance through the license gateway: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return {
        subscriptionPlanType: ProjectPlanType.FREE,
        availableCredits: 0,
        consumedCredits: 0,
        creditUsagePercentage: 0,
      };
    }
  }

  private async callCloud(route: string, body?: Record<string, unknown>): Promise<Response> {
    const license = this.requireLicense();
    const licenseKey = this.configService.get<string>('LICENSE_KEY');
    if (!licenseKey) {
      throw new Error('LICENSE_KEY is not configured');
    }

    const response = await fetchWithBackoff(`${LICENSE_CLOUD_BASE_URL}/api/license/${route}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${licenseKey}`,
        'X-OWOX-License-Key-Id': license.licenseKeyId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });

    if (!response.ok) {
      throw new Error(
        `License gateway request to /api/license/${route} failed with status ${response.status}`
      );
    }
    return response;
  }

  private requireLicense(): LicenseContext {
    const license = this.appEditionConfig.getLicenseContext();
    if (!license) {
      throw new Error('No valid managed license is active');
    }
    return license;
  }
}
