import { ConsumptionContext } from '../../ai-insights/data-mart-insights.types';
import { GoogleSheetsConfig } from '../../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { ProjectBalanceDto } from '../../dto/domain/project-balance.dto';
import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';

export enum RunKind {
  CONNECTOR_RUN = 'CONNECTOR_RUN',
  DATA_QUALITY_RUN = 'DATA_QUALITY_RUN',
  AI_PROCESS_RUN = 'AI_PROCESS_RUN',
  SHEETS_REPORT_RUN = 'SHEETS_REPORT_RUN',
  LOOKER_REPORT_RUN = 'LOOKER_REPORT_RUN',
  EMAIL_BASED_REPORT_RUN = 'EMAIL_BASED_REPORT_RUN',
  HTTP_DATA_RUN = 'HTTP_DATA_RUN',
  MCP_QUERY_RUN = 'MCP_QUERY_RUN',
}

export const REPORT_RUN_KINDS: readonly RunKind[] = [
  RunKind.SHEETS_REPORT_RUN,
  RunKind.LOOKER_REPORT_RUN,
  RunKind.EMAIL_BASED_REPORT_RUN,
  RunKind.HTTP_DATA_RUN,
  RunKind.MCP_QUERY_RUN,
];

export function isReportRun(kind: RunKind): boolean {
  return REPORT_RUN_KINDS.includes(kind);
}

export interface SheetsReportDetails {
  googleSheetsDocumentTitle: string;
  googleSheetsListTitle: string;
}

/**
 * Balance checks and consumption reporting for a project. Also the DI token:
 * the binding-specific implementation is chosen by projectBillingProvider.
 */
export abstract class ProjectBillingService {
  abstract verifyCanPerformOperations(projectId: string, runKind: RunKind): Promise<void>;

  abstract registerConnectorRunConsumption(
    dataMart: DataMart,
    connectorRunId: string
  ): Promise<void>;

  abstract registerDataQualityRunConsumption(
    dataMart: DataMart,
    dataMartRunId: string
  ): Promise<void>;

  abstract registerAiProcessRunConsumption(
    tokensProcessed: number,
    context: ConsumptionContext
  ): Promise<void>;

  abstract registerSheetsReportRunConsumption(
    report: Report,
    sheetsDetails: SheetsReportDetails
  ): Promise<void>;

  abstract registerLookerReportRunConsumption(report: Report): Promise<void>;

  abstract registerEmailBasedReportRunConsumption(report: Report): Promise<void>;

  abstract registerHttpDataRunConsumption(dataMart: DataMart, runId: string): Promise<void>;

  abstract registerMcpQueryRunConsumption(dataMart: DataMart, runId: string): Promise<void>;

  protected baseDataMartConsumptionPayload(dataMart: DataMart) {
    return {
      projectId: dataMart.projectId,
      dataMartId: dataMart.id,
      dataMartTitle: dataMart.title,
      dataStorageId: dataMart.storage.id,
      dataStorageTitle: dataMart.storage.title,
      dataStorageType: dataMart.storage.type,
      runTime: new Date().toISOString(),
    };
  }

  protected baseReportConsumptionPayload(report: Report) {
    return {
      ...this.baseDataMartConsumptionPayload(report.dataMart),
      dataDestinationId: report.dataDestination.id,
      dataDestinationTitle: report.dataDestination.title,
      dataDestinationType: report.dataDestination.type,
      reportId: report.id,
      reportTitle: report.title,
      reportRunId: `${report.id}-${Date.now()}`,
    };
  }

  protected sheetsReportConsumptionPayload(report: Report, sheetsDetails: SheetsReportDetails) {
    const reportConfig = report.destinationConfig as GoogleSheetsConfig;
    return {
      ...this.baseReportConsumptionPayload(report),
      googleSheetsDocumentId: reportConfig.spreadsheetId,
      googleSheetsDocumentTitle: sheetsDetails.googleSheetsDocumentTitle,
      googleSheetsListId: reportConfig.sheetId,
      googleSheetsListTitle: sheetsDetails.googleSheetsListTitle,
    };
  }

  protected httpDataConsumptionPayload(dataMart: DataMart, runId: string) {
    return {
      ...this.baseDataMartConsumptionPayload(dataMart),
      reportRunId: runId,
    };
  }

  protected mcpQueryConsumptionPayload(dataMart: DataMart, runId: string) {
    return {
      ...this.baseDataMartConsumptionPayload(dataMart),
      runId,
    };
  }

  protected zeroBalance(): ProjectBalanceDto {
    return {
      subscriptionPlanType: ProjectPlanType.FREE,
      availableCredits: 0,
      consumedCredits: 0,
      creditUsagePercentage: 0,
    };
  }
}
