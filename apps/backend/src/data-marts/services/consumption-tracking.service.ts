import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSubService } from '../../common/pubsub/pubsub.service';
import { GoogleSheetsConfig } from '../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { ConnectorDefinition as DataMartConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../entities/data-mart.entity';
import { Report } from '../entities/report.entity';
import { ConnectorService } from './connector/connector.service';

@Injectable()
export class ConsumptionTrackingService {
  private readonly logger = new Logger(ConsumptionTrackingService.name);

  private readonly pubSubService?: PubSubService;

  private readonly connectorRunConsumptionTopic?: string;
  private readonly sheetsReportRunConsumptionTopic?: string;
  private readonly lookerReportRunConsumptionTopic?: string;

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
      reportRunId: `${report.id}-${Date.now()}`,
    };
  }
}
