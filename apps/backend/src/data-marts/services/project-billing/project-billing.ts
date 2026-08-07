import { randomBytes } from 'crypto';
import { ConsumptionContext } from '../../ai-insights/data-mart-insights.types';
import { GoogleSheetsConfig } from '../../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { ProjectBalanceDto } from '../../dto/domain/project-balance.dto';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';

export const PROJECT_BILLING = Symbol('PROJECT_BILLING');

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

const REPORT_RUN_KINDS: ReadonlySet<RunKind> = new Set([
  RunKind.SHEETS_REPORT_RUN,
  RunKind.LOOKER_REPORT_RUN,
  RunKind.EMAIL_BASED_REPORT_RUN,
  RunKind.HTTP_DATA_RUN,
  RunKind.MCP_QUERY_RUN,
]);

export function isReportRun(kind: RunKind): boolean {
  return REPORT_RUN_KINDS.has(kind);
}

export interface RunAuthorizationRequest {
  projectId: string;
  runKind: RunKind;
}

/** Obtainable only from authorizeRun, so consumption cannot be reported unauthorized. */
export interface RunGrant {
  readonly projectId: string;
  readonly runKind: RunKind;
}

export type ConsumptionEvent =
  | { kind: RunKind.CONNECTOR_RUN; dataMart: DataMart; connectorRunId: string }
  | { kind: RunKind.DATA_QUALITY_RUN; dataMart: DataMart; dataMartRunId: string }
  | { kind: RunKind.AI_PROCESS_RUN; tokensProcessed: number; context: ConsumptionContext }
  | {
      kind: RunKind.SHEETS_REPORT_RUN;
      report: Report;
      sheetsDetails: { googleSheetsDocumentTitle: string; googleSheetsListTitle: string };
    }
  | { kind: RunKind.LOOKER_REPORT_RUN; report: Report }
  | { kind: RunKind.EMAIL_BASED_REPORT_RUN; report: Report }
  | { kind: RunKind.HTTP_DATA_RUN; dataMart: DataMart; runId: string }
  | { kind: RunKind.MCP_QUERY_RUN; dataMart: DataMart; runId: string };

export interface ProjectBilling {
  authorizeRun(request: RunAuthorizationRequest): Promise<RunGrant>;
  registerConsumption(grant: RunGrant, event: ConsumptionEvent): Promise<void>;
  getBalance(projectId: string): Promise<ProjectBalanceDto>;
}

export function buildConsumptionPayload(event: ConsumptionEvent): Record<string, unknown> {
  switch (event.kind) {
    case RunKind.CONNECTOR_RUN: {
      const { connector } = event.dataMart.definition as DataMartConnectorDefinition;
      return {
        ...dataMartPayload(event.dataMart),
        inputSource: connector.source.name,
        processRunId: event.connectorRunId,
      };
    }
    case RunKind.DATA_QUALITY_RUN:
      return {
        ...dataMartPayload(event.dataMart),
        processRunId: event.dataMartRunId,
      };
    case RunKind.AI_PROCESS_RUN:
      return {
        ...dataMartPayload(event.context.dataMart),
        tokensProcessed: event.tokensProcessed,
        contextType: event.context.contextType,
        contextId: event.context.contextId,
        contextTitle: event.context.contextTitle,
        processRunId: `${event.context.contextId}-${Date.now()}-${randomBytes(3).toString('hex')}`,
      };
    case RunKind.SHEETS_REPORT_RUN: {
      const reportConfig = event.report.destinationConfig as GoogleSheetsConfig;
      return {
        ...reportPayload(event.report),
        googleSheetsDocumentId: reportConfig.spreadsheetId,
        googleSheetsDocumentTitle: event.sheetsDetails.googleSheetsDocumentTitle,
        googleSheetsListId: reportConfig.sheetId,
        googleSheetsListTitle: event.sheetsDetails.googleSheetsListTitle,
      };
    }
    case RunKind.LOOKER_REPORT_RUN:
    case RunKind.EMAIL_BASED_REPORT_RUN:
      return reportPayload(event.report);
    case RunKind.HTTP_DATA_RUN:
      return {
        ...dataMartPayload(event.dataMart),
        reportRunId: event.runId,
      };
    case RunKind.MCP_QUERY_RUN:
      return {
        ...dataMartPayload(event.dataMart),
        runId: event.runId,
      };
  }
}

function dataMartPayload(dataMart: DataMart) {
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

function reportPayload(report: Report) {
  return {
    ...dataMartPayload(report.dataMart),
    dataDestinationId: report.dataDestination.id,
    dataDestinationTitle: report.dataDestination.title,
    dataDestinationType: report.dataDestination.type,
    reportId: report.id,
    reportTitle: report.title,
    reportRunId: `${report.id}-${Date.now()}`,
  };
}
