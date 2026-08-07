import { Injectable, Logger } from '@nestjs/common';
import { RunRestrictedException } from '../../../common/exceptions/run-restricted.exception';
import { ProjectBalanceDto } from '../../dto/domain/project-balance.dto';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';
import {
  ConsumptionEvent,
  isReportRun,
  ProjectBilling,
  RunAuthorizationRequest,
  RunGrant,
} from './project-billing';

export const REPORT_RUNS_RESTRICTED_MESSAGE =
  'Report Runs require an active OWOX Data Marts Cloud license. Create a managed license key in ' +
  'OWOX Data Marts Cloud Project Settings and set it as LICENSE_KEY to enable execution.';

/**
 * Applied when no valid managed license is present. Report Runs are denied; Process Runs
 * keep executing unbilled, which is what a deployment without Cloud billing already does.
 */
@Injectable()
export class RestrictedProjectBilling implements ProjectBilling {
  private readonly logger = new Logger(RestrictedProjectBilling.name);

  public async authorizeRun(request: RunAuthorizationRequest): Promise<RunGrant> {
    if (isReportRun(request.runKind)) {
      throw new RunRestrictedException(REPORT_RUNS_RESTRICTED_MESSAGE);
    }
    return { projectId: request.projectId, runKind: request.runKind };
  }

  public async registerConsumption(grant: RunGrant, event: ConsumptionEvent): Promise<void> {
    this.logger.debug(
      `No licensed billing binding, skipping ${event.kind} consumption for project ${grant.projectId}`
    );
  }

  public async getBalance(): Promise<ProjectBalanceDto> {
    return {
      subscriptionPlanType: ProjectPlanType.FREE,
      availableCredits: 0,
      consumedCredits: 0,
      creditUsagePercentage: 0,
    };
  }
}
