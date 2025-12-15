import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PubSubService } from '../../common/pubsub/pubsub.service';
import { ConsumptionContext } from '../ai-insights/data-mart-insights.types';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsConfig } from '../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../entities/data-mart.entity';
import { Report } from '../entities/report.entity';
import { ConnectorService } from './connector.service';

@Injectable()
export class ConsumptionTrackingService {
  private readonly logger = new Logger(ConsumptionTrackingService.name);

  private readonly pubSubService?: PubSubService;

  private readonly connectorRunConsumptionTopic?: string;
  private readonly aiProcessRunConsumptionTopic?: string;
  private readonly sheetsReportRunConsumptionTopic?: string;
  private readonly lookerReportRunConsumptionTopic?: string;
  private readonly emailReportRunConsumptionTopic?: string;
  private readonly slackReportRunConsumptionTopic?: string;
  private readonly googleChatReportRunConsumptionTopic?: string;
  private readonly msTeamsReportRunConsumptionTopic?: string;

  constructor(
    private readonly connectorService: ConnectorService,
    configService: ConfigService
  ) {
    const consumptionPubSubProject = configService.get<string>('CONSUMPTION_PUBSUB_PROJECT_ID');
    if (consumptionPubSubProject) {
      this.pubSubService = new PubSubService({ gcpProjectId: consumptionPubSubProject });
      this.logger.log(`Consumption PubSub project ID: ${consumptionPubSubProject}`);

      this.connectorRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_CONNECTOR_RUN_TOPIC'
      );
      if (this.connectorRunConsumptionTopic) {
        this.logger.log(`Consumption Connector Run topic: ${this.connectorRunConsumptionTopic}`);
      }

      this.sheetsReportRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_SHEETS_REPORT_RUN_TOPIC'
      );
      if (this.sheetsReportRunConsumptionTopic) {
        this.logger.log(
          `Consumption Sheets Report Run topic: ${this.sheetsReportRunConsumptionTopic}`
        );
      }

      this.lookerReportRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_LOOKER_REPORT_RUN_TOPIC'
      );
      if (this.lookerReportRunConsumptionTopic) {
        this.logger.log(
          `Consumption Looker Report Run topic: ${this.lookerReportRunConsumptionTopic}`
        );
      }

      this.emailReportRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_EMAIL_REPORT_RUN_TOPIC'
      );
      if (this.emailReportRunConsumptionTopic) {
        this.logger.log(
          `Consumption Email Report Run topic: ${this.emailReportRunConsumptionTopic}`
        );
      }

      this.slackReportRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_SLACK_REPORT_RUN_TOPIC'
      );
      if (this.slackReportRunConsumptionTopic) {
        this.logger.log(
          `Consumption Slack Report Run topic: ${this.slackReportRunConsumptionTopic}`
        );
      }

      this.googleChatReportRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_GOOGLE_CHAT_REPORT_RUN_TOPIC'
      );
      if (this.googleChatReportRunConsumptionTopic) {
        this.logger.log(
          `Consumption Google Chat Report Run topic: ${this.googleChatReportRunConsumptionTopic}`
        );
      }

      this.msTeamsReportRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_MS_TEAMS_REPORT_RUN_TOPIC'
      );
      if (this.msTeamsReportRunConsumptionTopic) {
        this.logger.log(
          `Consumption MS Teams Report Run topic: ${this.msTeamsReportRunConsumptionTopic}`
        );
      }

      this.aiProcessRunConsumptionTopic = configService.get<string>(
        'CONSUMPTION_AI_PROCESS_RUN_TOPIC'
      );
      if (this.aiProcessRunConsumptionTopic) {
        this.logger.log(`Consumption AI Process Run topic: ${this.aiProcessRunConsumptionTopic}`);
      }
    }
  }

  public async registerConnectorRunConsumption(
    dataMart: DataMart,
    connectorRunId: string
  ): Promise<void> {
    if (!this.pubSubService || !this.connectorRunConsumptionTopic) {
      this.logger.debug('Connector run consumption tracking is not configured, skipping...');
      return;
    }
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;
    const connectorName = connector.source.name;
    const connectorTitle = (await this.connectorService.getAvailableConnectors()).filter(
      c => c.name === connectorName
    )[0]?.title;
    await this.sendConsumptionCommand(this.connectorRunConsumptionTopic, {
      ...this.baseDataMartConsumptionPayload(dataMart),
      inputSource: connectorTitle ? connectorTitle : connectorName,
      processRunId: connectorRunId,
    });
  }

  public async registerSheetsReportRunConsumption(
    report: Report,
    sheetsDetails: {
      googleSheetsDocumentTitle: string;
      googleSheetsListTitle: string;
    }
  ): Promise<void> {
    if (!this.pubSubService || !this.sheetsReportRunConsumptionTopic) {
      this.logger.debug('Google Sheets report consumption tracking is not configured, skipping...');
      return;
    }
    const reportConfig = report.destinationConfig as GoogleSheetsConfig;
    await this.sendConsumptionCommand(this.sheetsReportRunConsumptionTopic, {
      ...this.baseReportConsumptionPayload(report),
      googleSheetsDocumentId: reportConfig.spreadsheetId,
      googleSheetsDocumentTitle: sheetsDetails.googleSheetsDocumentTitle,
      googleSheetsListId: reportConfig.sheetId,
      googleSheetsListTitle: sheetsDetails.googleSheetsListTitle,
    });
  }

  public async registerLookerReportRunConsumption(report: Report): Promise<void> {
    if (!this.pubSubService || !this.lookerReportRunConsumptionTopic) {
      this.logger.debug('Looker Studio report consumption tracking is not configured, skipping...');
      return;
    }
    await this.sendConsumptionCommand(
      this.lookerReportRunConsumptionTopic,
      this.baseReportConsumptionPayload(report)
    );
  }

  public async registerEmailBasedReportRunConsumption(report: Report): Promise<void> {
    const destinationType = report.dataDestination.type;
    let consumptionTopic: string | undefined;
    switch (destinationType) {
      case DataDestinationType.EMAIL:
        consumptionTopic = this.emailReportRunConsumptionTopic;
        break;
      case DataDestinationType.SLACK:
        consumptionTopic = this.slackReportRunConsumptionTopic;
        break;
      case DataDestinationType.GOOGLE_CHAT:
        consumptionTopic = this.googleChatReportRunConsumptionTopic;
        break;
      case DataDestinationType.MS_TEAMS:
        consumptionTopic = this.msTeamsReportRunConsumptionTopic;
        break;
      default:
        throw new Error(`Unsupported report destination type: ${report.destinationConfig.type}`);
    }

    if (!this.pubSubService || !consumptionTopic) {
      this.logger.debug(
        `${destinationType} report consumption tracking is not configured, skipping...`
      );
      return;
    }
    await this.sendConsumptionCommand(consumptionTopic, this.baseReportConsumptionPayload(report));
  }

  public async registerAiProcessRunConsumption(
    tokensProcessed: number,
    context: ConsumptionContext
  ): Promise<void> {
    if (!this.pubSubService || !this.aiProcessRunConsumptionTopic) {
      this.logger.debug('AI process run consumption tracking is not configured, skipping...');
      return;
    }
    await this.sendConsumptionCommand(this.aiProcessRunConsumptionTopic, {
      ...this.baseDataMartConsumptionPayload(context.dataMart),
      tokensProcessed,
      contextType: context.contextType,
      contextId: context.contextId,
      contextTitle: context.contextTitle,
      processRunId: `${context.contextId}-${Date.now()}-${randomBytes(3).toString('hex')}`,
    });
  }

  private async sendConsumptionCommand(topic: string, cmd: unknown): Promise<void> {
    try {
      const messageId = await this.pubSubService?.publishMessageWithDefaultWrap(topic, cmd);
      this.logger.log(
        `Sent consumption command to PubSub. Message: ${messageId}. Topic: ${topic}. CMD: ${JSON.stringify(cmd)}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send consumption command to PubSub: ${error.message}. Topic: ${topic}. CMD: ${JSON.stringify(cmd)}`,
        error.stack
      );
    }
  }

  private baseDataMartConsumptionPayload(dataMart: DataMart) {
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

  private baseReportConsumptionPayload(report: Report) {
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
}
