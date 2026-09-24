import {
  AppEditionConfig,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { ConsumptionContext } from '../../ai-insights/data-mart-insights.types';
import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { InternalProjectBillingService } from './internal-project-billing.service';
import { LicenseProjectBillingService } from './license-project-billing.service';
import { ProjectBillingService, RunKind, SheetsReportDetails } from './project-billing.service';
import { RestrictedProjectBillingService } from './restricted-project-billing.service';

/** The hourly license refresh can change the binding, so the target is re-read on every call. */
export class BindingAwareProjectBillingService extends ProjectBillingService {
  constructor(
    private readonly appEditionConfig: AppEditionConfig,
    private readonly internal: InternalProjectBillingService,
    private readonly license: LicenseProjectBillingService,
    private readonly restricted: RestrictedProjectBillingService
  ) {
    super();
  }

  private delegate(): ProjectBillingService {
    const binding = this.appEditionConfig.getLicenseContext()?.binding;
    if (binding === ProjectBinding.INTERNAL) {
      return this.internal.isBalanceConfigured() ? this.internal : this.restricted;
    }
    return binding === ProjectBinding.LICENSE ? this.license : this.restricted;
  }

  verifyCanPerformOperations(projectId: string, runKind: RunKind): Promise<void> {
    return this.delegate().verifyCanPerformOperations(projectId, runKind);
  }

  registerConnectorRunConsumption(dataMart: DataMart, connectorRunId: string): Promise<void> {
    return this.delegate().registerConnectorRunConsumption(dataMart, connectorRunId);
  }

  registerDataQualityRunConsumption(dataMart: DataMart, dataMartRunId: string): Promise<void> {
    return this.delegate().registerDataQualityRunConsumption(dataMart, dataMartRunId);
  }

  registerAiProcessRunConsumption(
    tokensProcessed: number,
    context: ConsumptionContext
  ): Promise<void> {
    return this.delegate().registerAiProcessRunConsumption(tokensProcessed, context);
  }

  registerSheetsReportRunConsumption(
    report: Report,
    sheetsDetails: SheetsReportDetails
  ): Promise<void> {
    return this.delegate().registerSheetsReportRunConsumption(report, sheetsDetails);
  }

  registerLookerReportRunConsumption(report: Report): Promise<void> {
    return this.delegate().registerLookerReportRunConsumption(report);
  }

  registerEmailBasedReportRunConsumption(report: Report): Promise<void> {
    return this.delegate().registerEmailBasedReportRunConsumption(report);
  }

  registerExcelReportRunConsumption(report: Report, runId: string): Promise<void> {
    return this.delegate().registerExcelReportRunConsumption(report, runId);
  }

  registerHttpDataRunConsumption(dataMart: DataMart, runId: string): Promise<void> {
    return this.delegate().registerHttpDataRunConsumption(dataMart, runId);
  }

  registerMcpQueryRunConsumption(dataMart: DataMart, runId: string): Promise<void> {
    return this.delegate().registerMcpQueryRunConsumption(dataMart, runId);
  }
}
