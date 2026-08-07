import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { PubSubService } from '../../../common/pubsub/pubsub.service';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import {
  CanPerformOperationsResponseDto,
  CanPerformOperationsResponseSchema,
} from '../../dto/domain/can-perform-operations-response.dto';
import { ProjectBalanceDto, ProjectBalanceSchema } from '../../dto/domain/project-balance.dto';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { ProjectPlanType } from '../../enums/project-plan-type.enum';
import { ConnectorService } from '../connector/connector.service';
import {
  buildConsumptionPayload,
  ConsumptionEvent,
  ProjectBilling,
  RunAuthorizationRequest,
  RunGrant,
  RunKind,
} from './project-billing';

const TOPIC_ENV_BY_RUN_KIND: Record<Exclude<RunKind, RunKind.EMAIL_BASED_REPORT_RUN>, string> = {
  [RunKind.CONNECTOR_RUN]: 'CONSUMPTION_CONNECTOR_RUN_TOPIC',
  [RunKind.DATA_QUALITY_RUN]: 'CONSUMPTION_DATA_QUALITY_RUN_TOPIC',
  [RunKind.AI_PROCESS_RUN]: 'CONSUMPTION_AI_PROCESS_RUN_TOPIC',
  [RunKind.SHEETS_REPORT_RUN]: 'CONSUMPTION_SHEETS_REPORT_RUN_TOPIC',
  [RunKind.LOOKER_REPORT_RUN]: 'CONSUMPTION_LOOKER_REPORT_RUN_TOPIC',
  [RunKind.HTTP_DATA_RUN]: 'CONSUMPTION_HTTP_DATA_REPORT_RUN_TOPIC',
  [RunKind.MCP_QUERY_RUN]: 'CONSUMPTION_MCP_QUERY_RUN_TOPIC',
};

const TOPIC_ENV_BY_EMAIL_BASED_DESTINATION: Partial<Record<DataDestinationType, string>> = {
  [DataDestinationType.EMAIL]: 'CONSUMPTION_EMAIL_REPORT_RUN_TOPIC',
  [DataDestinationType.SLACK]: 'CONSUMPTION_SLACK_REPORT_RUN_TOPIC',
  [DataDestinationType.GOOGLE_CHAT]: 'CONSUMPTION_GOOGLE_CHAT_REPORT_RUN_TOPIC',
  [DataDestinationType.MS_TEAMS]: 'CONSUMPTION_MS_TEAMS_REPORT_RUN_TOPIC',
};

@Injectable()
export class InternalProjectBilling implements ProjectBilling {
  private readonly logger = new Logger(InternalProjectBilling.name);
  private readonly impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();

  private readonly pubSubService?: PubSubService;
  private readonly baseUrl: string | undefined;
  private readonly targetAudience: string | undefined;
  private readonly serviceAccountEmail: string | undefined;
  private readonly balanceConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly connectorService: ConnectorService
  ) {
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

  public async authorizeRun(request: RunAuthorizationRequest): Promise<RunGrant> {
    const result = await this.canPerformOperations(request.projectId);
    if (!result.allowed) {
      throw new ProjectOperationBlockedException(result.blockedReasons);
    }
    return { projectId: request.projectId, runKind: request.runKind };
  }

  public async registerConsumption(grant: RunGrant, event: ConsumptionEvent): Promise<void> {
    await this.publish(event.kind, grant.projectId, async () => ({
      destinationType:
        event.kind === RunKind.EMAIL_BASED_REPORT_RUN
          ? event.report.dataDestination.type
          : undefined,
      command: await this.buildCommand(event),
    }));
  }

  public async getBalance(projectId: string): Promise<ProjectBalanceDto> {
    if (!this.balanceConfigured) {
      return {
        subscriptionPlanType: ProjectPlanType.FREE,
        availableCredits: 0,
        consumedCredits: 0,
        creditUsagePercentage: 0,
      };
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

  /** Consumption forwarded through the license gateway is billed to the license's own project. */
  public async publishForwardedConsumption(
    kind: RunKind,
    payload: Record<string, unknown>,
    projectId: string
  ): Promise<void> {
    await this.publish(kind, projectId, async () => ({
      destinationType: payload.dataDestinationType as DataDestinationType | undefined,
      command: { ...payload, projectId },
    }));
  }

  private async publish(
    kind: RunKind,
    projectId: string,
    resolve: () => Promise<{
      destinationType?: DataDestinationType;
      command: Record<string, unknown>;
    }>
  ): Promise<void> {
    try {
      const { destinationType, command } = await resolve();
      const topic = this.resolveTopic(kind, destinationType);
      if (!this.pubSubService || !topic) {
        this.logger.debug(`${kind} consumption tracking is not configured, skipping...`);
        return;
      }

      const messageId = await this.pubSubService.publishMessageWithDefaultWrap(topic, command);
      this.logger.log(
        `Sent consumption command to PubSub. Message: ${messageId}. Topic: ${topic}. CMD: ${JSON.stringify(command)}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send ${kind} consumption command for project ${projectId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
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

  private async buildCommand(event: ConsumptionEvent): Promise<Record<string, unknown>> {
    const payload = buildConsumptionPayload(event);
    if (event.kind !== RunKind.CONNECTOR_RUN) {
      return payload;
    }

    const { connector } = event.dataMart.definition as DataMartConnectorDefinition;
    const connectorTitle = (await this.connectorService.getAvailableConnectors()).find(
      c => c.name === connector.source.name
    )?.title;
    return { ...payload, inputSource: connectorTitle ?? connector.source.name };
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
