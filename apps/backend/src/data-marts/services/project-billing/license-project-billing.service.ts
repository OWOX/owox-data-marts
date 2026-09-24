import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff } from '@owox/internal-helpers';
import {
  AppEditionConfig,
  LICENSE_KEY_ID_HEADER,
  LicenseContext,
} from '../../../common/config/app-edition-config.service';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ConsumptionContext } from '../../ai-insights/data-mart-insights.types';
import { CanPerformOperationsResponseSchema } from '../../dto/domain/can-perform-operations-response.dto';
import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import {
  isReportRun,
  ProjectBillingService,
  RunKind,
  SheetsReportDetails,
} from './project-billing.service';

/** Not configurable: the license key travels here as a bearer token, so a redirectable base URL would leak it. */
const LICENSE_CLOUD_BASE_URL = 'https://app.owox.com';

/**
 * Billing for self-managed deployments: Report Runs are authorized and billed through
 * OWOX Cloud, which resolves the billing project from the signed license. Process Runs
 * run unbilled.
 */
@Injectable()
export class LicenseProjectBillingService extends ProjectBillingService {
  private readonly logger = new Logger(LicenseProjectBillingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly appEditionConfig: AppEditionConfig
  ) {
    super();
  }

  public async verifyCanPerformOperations(projectId: string, runKind: RunKind): Promise<void> {
    if (!isReportRun(runKind)) {
      return;
    }

    const response = await this.callCloud('can-perform');
    const decision = CanPerformOperationsResponseSchema.parse(await response.json());
    if (!decision.allowed) {
      throw new ProjectOperationBlockedException(decision.blockedReasons);
    }
  }

  public async registerConnectorRunConsumption(): Promise<void> {
    this.skipProcessRun(RunKind.CONNECTOR_RUN);
  }

  public async registerDataQualityRunConsumption(): Promise<void> {
    this.skipProcessRun(RunKind.DATA_QUALITY_RUN);
  }

  public async registerAiProcessRunConsumption(
    _tokensProcessed: number,
    _context: ConsumptionContext
  ): Promise<void> {
    this.skipProcessRun(RunKind.AI_PROCESS_RUN);
  }

  public async registerSheetsReportRunConsumption(
    report: Report,
    sheetsDetails: SheetsReportDetails
  ): Promise<void> {
    await this.sendConsumption(
      RunKind.SHEETS_REPORT_RUN,
      this.sheetsReportConsumptionPayload(report, sheetsDetails)
    );
  }

  public async registerLookerReportRunConsumption(report: Report): Promise<void> {
    await this.sendConsumption(
      RunKind.LOOKER_REPORT_RUN,
      this.baseReportConsumptionPayload(report)
    );
  }

  public async registerEmailBasedReportRunConsumption(report: Report): Promise<void> {
    await this.sendConsumption(
      RunKind.EMAIL_BASED_REPORT_RUN,
      this.baseReportConsumptionPayload(report)
    );
  }

  public async registerExcelReportRunConsumption(report: Report, runId: string): Promise<void> {
    await this.sendConsumption(
      RunKind.EXCEL_REPORT_RUN,
      this.excelReportConsumptionPayload(report, runId)
    );
  }

  public async registerHttpDataRunConsumption(dataMart: DataMart, runId: string): Promise<void> {
    await this.sendConsumption(
      RunKind.HTTP_DATA_RUN,
      this.httpDataConsumptionPayload(dataMart, runId)
    );
  }

  public async registerMcpQueryRunConsumption(dataMart: DataMart, runId: string): Promise<void> {
    await this.sendConsumption(
      RunKind.MCP_QUERY_RUN,
      this.mcpQueryConsumptionPayload(dataMart, runId)
    );
  }

  private skipProcessRun(kind: RunKind): void {
    this.logger.debug(`${kind} is not billed through the license gateway, skipping...`);
  }

  private async sendConsumption(kind: RunKind, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.callCloud('consumption', { kind, payload });
    } catch (error) {
      this.logger.error(
        `Failed to report ${kind} consumption for project ${payload.projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async callCloud(route: string, body?: Record<string, unknown>): Promise<Response> {
    const license = this.requireLicense();
    const licenseKey = this.configService.get<string>('LICENSE_KEY');
    if (!licenseKey) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.LICENSE_REQUIRED]);
    }

    const response = await fetchWithBackoff(`${LICENSE_CLOUD_BASE_URL}/api/license/${route}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${licenseKey}`,
        [LICENSE_KEY_ID_HEADER]: license.licenseKeyId,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 || response.status === 403) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.LICENSE_REQUIRED]);
    }
    if (!response.ok) {
      throw new Error(`License gateway request to ${route} failed with status ${response.status}`);
    }

    return response;
  }

  private requireLicense(): LicenseContext {
    const license = this.appEditionConfig.getLicenseContext();
    if (!license) {
      throw new ProjectOperationBlockedException([ProjectBlockedReason.LICENSE_REQUIRED]);
    }
    return license;
  }
}
