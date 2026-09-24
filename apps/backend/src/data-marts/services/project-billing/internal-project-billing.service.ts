import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { randomBytes } from 'crypto';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { PubSubService } from '../../../common/pubsub/pubsub.service';
import { ConsumptionContext } from '../../ai-insights/data-mart-insights.types';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import {
  CanPerformOperationsResponseDto,
  CanPerformOperationsResponseSchema,
} from '../../dto/domain/can-perform-operations-response.dto';
import { ProjectBalanceDto, ProjectBalanceSchema } from '../../dto/domain/project-balance.dto';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ConnectorService } from '../connector/connector.service';
import {
  ProjectBillingService,
  REPORT_RUN_KINDS,
  RunKind,
  SheetsReportDetails,
} from './project-billing.service';

const TOPIC_ENV_BY_RUN_KIND: Record<Exclude<RunKind, RunKind.EMAIL_BASED_REPORT_RUN>, string> = {
  [RunKind.CONNECTOR_RUN]: 'CONSUMPTION_CONNECTOR_RUN_TOPIC',
  [RunKind.DATA_QUALITY_RUN]: 'CONSUMPTION_DATA_QUALITY_RUN_TOPIC',
  [RunKind.AI_PROCESS_RUN]: 'CONSUMPTION_AI_PROCESS_RUN_TOPIC',
  [RunKind.SHEETS_REPORT_RUN]: 'CONSUMPTION_SHEETS_REPORT_RUN_TOPIC',
  [RunKind.LOOKER_REPORT_RUN]: 'CONSUMPTION_LOOKER_REPORT_RUN_TOPIC',
  [RunKind.EXCEL_REPORT_RUN]: 'CONSUMPTION_EXCEL_REPORT_RUN_TOPIC',
  [RunKind.HTTP_DATA_RUN]: 'CONSUMPTION_HTTP_DATA_REPORT_RUN_TOPIC',
  [RunKind.MCP_QUERY_RUN]: 'CONSUMPTION_MCP_QUERY_RUN_TOPIC',
};

export interface ForwardedLicenseAttribution {
  projectId: string;
  licenseKeyId: string;
  title: string;
  origin: string;
}

const TOPIC_ENV_BY_EMAIL_BASED_DESTINATION: Partial<Record<DataDestinationType, string>> = {
  [DataDestinationType.EMAIL]: 'CONSUMPTION_EMAIL_REPORT_RUN_TOPIC',
  [DataDestinationType.SLACK]: 'CONSUMPTION_SLACK_REPORT_RUN_TOPIC',
  [DataDestinationType.GOOGLE_CHAT]: 'CONSUMPTION_GOOGLE_CHAT_REPORT_RUN_TOPIC',
  [DataDestinationType.MS_TEAMS]: 'CONSUMPTION_MS_TEAMS_REPORT_RUN_TOPIC',
};

/**
 * Billing for Cloud deployments: balance checks against the Balance API and
 * consumption commands published straight to the configured PubSub topics.
 */
@Injectable()
export class InternalProjectBillingService extends ProjectBillingService {
  private readonly logger = new Logger(InternalProjectBillingService.name);
  private readonly impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();

  private readonly pubSubService?: PubSubService;
  private readonly baseUrl?: string;
  private readonly targetAudience?: string;
  private readonly serviceAccountEmail?: string;
  private readonly balanceConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly connectorService: ConnectorService
  ) {
    super();

    this.serviceAccountEmail = this.configService.get<string>(
      'BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT'
    );
    this.targetAudience = this.configService.get<string>('BALANCE_ENDPOINT_TARGET_AUDIENCE');
    this.baseUrl = this.configService.get<string>('BALANCE_ENDPOINT_BASE_URL')?.replace(/\/$/, '');

    if (!this.baseUrl && !this.serviceAccountEmail && !this.targetAudience) {
      this.balanceConfigured = false;
      this.logger.log('Balance service is not configured. Skipping balance checks.');
    } else if (!this.baseUrl || !this.serviceAccountEmail || !this.targetAudience) {
      throw new Error(
        'Balance service is partially configured. Please check the following environment variables: BALANCE_ENDPOINT_BASE_URL, BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT, BALANCE_ENDPOINT_TARGET_AUDIENCE'
      );
    } else {
      this.balanceConfigured = true;
    }

    const consumptionPubSubProject = this.configService.get<string>(
      'CONSUMPTION_PUBSUB_PROJECT_ID'
    );
    if (consumptionPubSubProject) {
      this.pubSubService = new PubSubService({ gcpProjectId: consumptionPubSubProject });
      this.logger.log(`Consumption PubSub project ID: ${consumptionPubSubProject}`);
    }
  }

  public isBalanceConfigured(): boolean {
    return this.balanceConfigured;
  }

  public assertForwardedConsumptionConfigured(): void {
    const topicEnvKeys = REPORT_RUN_KINDS.flatMap(kind =>
      kind === RunKind.EMAIL_BASED_REPORT_RUN
        ? Object.values(TOPIC_ENV_BY_EMAIL_BASED_DESTINATION)
        : [TOPIC_ENV_BY_RUN_KIND[kind]]
    ).filter((key): key is string => Boolean(key));
    const missing = ['CONSUMPTION_PUBSUB_PROJECT_ID', ...topicEnvKeys].filter(
      key => !this.configService.get<string>(key)
    );

    if (missing.length) {
      throw new Error(
        `LICENSE_ISSUANCE_ENABLED requires forwarded consumption configuration. Missing: ${missing.join(', ')}`
      );
    }
  }

  public async verifyCanPerformOperations(projectId: string): Promise<void> {
    const result = await this.canPerformOperations(projectId);
    if (!result.allowed) {
      throw new ProjectOperationBlockedException(result.blockedReasons);
    }
  }

  public async canPerformOperations(projectId: string): Promise<CanPerformOperationsResponseDto> {
    if (!this.balanceConfigured) {
      return { allowed: true, blockedReasons: [] };
    }

    try {
      const response = await this.fetchBalanceApi(
        `${this.baseUrl}/${projectId}/operation/can-perform`
      );
      return CanPerformOperationsResponseSchema.parse(await response.json());
    } catch (error) {
      this.logger.error(
        `Error checking balance for project ${projectId}: ${error?.message || error}`
      );
      throw error;
    }
  }

  public async getBalance(projectId: string): Promise<ProjectBalanceDto> {
    if (!this.balanceConfigured) {
      return this.zeroBalance();
    }

    try {
      const response = await this.fetchBalanceApi(`${this.baseUrl}/${projectId}/balance`);
      return ProjectBalanceSchema.parse(await response.json());
    } catch (error) {
      this.logger.error(
        `Error getting balance for project ${projectId}: ${error?.message || error}`
      );
      throw error;
    }
  }

  public async registerConnectorRunConsumption(
    dataMart: DataMart,
    connectorRunId: string
  ): Promise<void> {
    if (!this.pubSubService || !this.resolveTopic(RunKind.CONNECTOR_RUN)) {
      this.logger.debug(
        `${RunKind.CONNECTOR_RUN} consumption tracking is not configured, skipping...`
      );
      return;
    }
    const { connector } = dataMart.definition as DataMartConnectorDefinition;
    const connectorTitle = (await this.connectorService.getAvailableConnectors()).find(
      c => c.name === connector.source.name
    )?.title;
    await this.publish(RunKind.CONNECTOR_RUN, {
      ...this.baseDataMartConsumptionPayload(dataMart),
      inputSource: connectorTitle ?? connector.source.name,
      processRunId: connectorRunId,
    });
  }

  public async registerDataQualityRunConsumption(
    dataMart: DataMart,
    dataMartRunId: string
  ): Promise<void> {
    await this.publish(RunKind.DATA_QUALITY_RUN, {
      ...this.baseDataMartConsumptionPayload(dataMart),
      processRunId: dataMartRunId,
    });
  }

  public async registerAiProcessRunConsumption(
    tokensProcessed: number,
    context: ConsumptionContext
  ): Promise<void> {
    await this.publish(RunKind.AI_PROCESS_RUN, {
      ...this.baseDataMartConsumptionPayload(context.dataMart),
      tokensProcessed,
      contextType: context.contextType,
      contextId: context.contextId,
      contextTitle: context.contextTitle,
      processRunId: `${context.contextId}-${Date.now()}-${randomBytes(3).toString('hex')}`,
    });
  }

  public async registerSheetsReportRunConsumption(
    report: Report,
    sheetsDetails: SheetsReportDetails
  ): Promise<void> {
    await this.publish(
      RunKind.SHEETS_REPORT_RUN,
      this.sheetsReportConsumptionPayload(report, sheetsDetails)
    );
  }

  public async registerLookerReportRunConsumption(report: Report): Promise<void> {
    await this.publish(RunKind.LOOKER_REPORT_RUN, this.baseReportConsumptionPayload(report));
  }

  public async registerEmailBasedReportRunConsumption(report: Report): Promise<void> {
    await this.publish(
      RunKind.EMAIL_BASED_REPORT_RUN,
      this.baseReportConsumptionPayload(report),
      report.dataDestination.type
    );
  }

  public async registerExcelReportRunConsumption(report: Report, runId: string): Promise<void> {
    await this.publish(RunKind.EXCEL_REPORT_RUN, this.excelReportConsumptionPayload(report, runId));
  }

  public async registerHttpDataRunConsumption(dataMart: DataMart, runId: string): Promise<void> {
    await this.publish(RunKind.HTTP_DATA_RUN, this.httpDataConsumptionPayload(dataMart, runId));
  }

  public async registerMcpQueryRunConsumption(dataMart: DataMart, runId: string): Promise<void> {
    await this.publish(RunKind.MCP_QUERY_RUN, this.mcpQueryConsumptionPayload(dataMart, runId));
  }

  /**
   * Consumption forwarded through the license gateway is billed to the license's own project;
   * the verified sender identity survives as selfManaged* fields so billing UI can link back
   * to the originating deployment's entities.
   */
  public async publishForwardedConsumption(
    kind: RunKind,
    payload: Record<string, unknown>,
    license: ForwardedLicenseAttribution
  ): Promise<void> {
    await this.publish(
      kind,
      {
        ...payload,
        selfManagedProjectId: payload.projectId,
        selfManagedLicenseKeyId: license.licenseKeyId,
        selfManagedLicenseTitle: license.title,
        selfManagedOrigin: license.origin,
        projectId: license.projectId,
      },
      payload.dataDestinationType as DataDestinationType | undefined,
      true
    );
  }

  private async publish(
    kind: RunKind,
    command: Record<string, unknown>,
    destinationType?: DataDestinationType,
    throwOnFailure = false
  ): Promise<void> {
    try {
      const topic = this.resolveTopic(kind, destinationType);
      if (!this.pubSubService || !topic) {
        const message = `${kind} consumption tracking is not configured`;
        if (throwOnFailure) {
          throw new Error(message);
        }
        this.logger.debug(`${message}, skipping...`);
        return;
      }

      const messageId = await this.pubSubService.publishMessageWithDefaultWrap(topic, command);
      this.logger.log(
        `Sent consumption command to PubSub. Message: ${messageId}. Topic: ${topic}. CMD: ${JSON.stringify(command)}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send ${kind} consumption command to PubSub: ${
          error instanceof Error ? error.message : String(error)
        }. CMD: ${JSON.stringify(command)}`,
        error instanceof Error ? error.stack : undefined
      );
      if (throwOnFailure) {
        throw error;
      }
    }
  }

  private resolveTopic(kind: RunKind, destinationType?: DataDestinationType): string | undefined {
    if (kind !== RunKind.EMAIL_BASED_REPORT_RUN) {
      return this.configService.get<string>(TOPIC_ENV_BY_RUN_KIND[kind]);
    }

    const envKey = destinationType && TOPIC_ENV_BY_EMAIL_BASED_DESTINATION[destinationType];
    if (!envKey) {
      throw new Error(`Unsupported report destination type: ${destinationType}`);
    }
    return this.configService.get<string>(envKey);
  }

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
