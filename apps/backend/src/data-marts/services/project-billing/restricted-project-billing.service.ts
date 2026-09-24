import { Injectable, Logger } from '@nestjs/common';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import { isReportRun, ProjectBillingService, RunKind } from './project-billing.service';

/**
 * Applied when no valid managed license is present. Report Runs are denied; Process Runs
 * keep executing unbilled, which is what a deployment without Cloud billing already does.
 */
@Injectable()
export class RestrictedProjectBillingService extends ProjectBillingService {
  private readonly logger = new Logger(RestrictedProjectBillingService.name);

  public async verifyCanPerformOperations(projectId: string, runKind: RunKind): Promise<void> {
    if (isReportRun(runKind)) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.LICENSE_REQUIRED]);
    }
  }

  public async registerConnectorRunConsumption(): Promise<void> {
    this.skip(RunKind.CONNECTOR_RUN);
  }

  public async registerDataQualityRunConsumption(): Promise<void> {
    this.skip(RunKind.DATA_QUALITY_RUN);
  }

  public async registerAiProcessRunConsumption(): Promise<void> {
    this.skip(RunKind.AI_PROCESS_RUN);
  }

  public async registerSheetsReportRunConsumption(): Promise<void> {
    this.skip(RunKind.SHEETS_REPORT_RUN);
  }

  public async registerLookerReportRunConsumption(): Promise<void> {
    this.skip(RunKind.LOOKER_REPORT_RUN);
  }

  public async registerEmailBasedReportRunConsumption(): Promise<void> {
    this.skip(RunKind.EMAIL_BASED_REPORT_RUN);
  }

  public async registerExcelReportRunConsumption(): Promise<void> {
    this.skip(RunKind.EXCEL_REPORT_RUN);
  }

  public async registerHttpDataRunConsumption(): Promise<void> {
    this.skip(RunKind.HTTP_DATA_RUN);
  }

  public async registerMcpQueryRunConsumption(): Promise<void> {
    this.skip(RunKind.MCP_QUERY_RUN);
  }

  private skip(kind: RunKind): void {
    this.logger.debug(`No licensed billing binding, skipping ${kind} consumption`);
  }
}
