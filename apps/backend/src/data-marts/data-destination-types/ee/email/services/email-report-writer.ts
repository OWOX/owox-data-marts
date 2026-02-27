import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { OwoxProducer } from '@owox/internal-helpers';
import { PublicOriginService } from '../../../../../common/config/public-origin.service';
import {
  EMAIL_PROVIDER_FACADE,
  EmailProviderFacade,
} from '../../../../../common/email/shared/email-provider.facade';
import { BusinessViolationException } from '../../../../../common/exceptions/business-violation.exception';
import {
  COLOR_THEME,
  MarkdownParser,
} from '../../../../../common/markdown/markdown-parser.service';
import { OWOX_PRODUCER } from '../../../../../common/producer/producer.module';
import { DataMartInsightTemplateFacadeImpl } from '../../../../ai-insights/data-mart-insight-template.facade';
import {
  DataMartInsightTemplateStatus,
  DataMartPromptMetaEntry,
} from '../../../../ai-insights/data-mart-insights.types';
import {
  getPromptTotalUsage,
  getTemplateTotalUsage,
} from '../../../../ai-insights/utils/compute-model-usage';
import { ReportDataBatch } from '../../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../../dto/domain/report-data-description.dto';
import { Report } from '../../../../entities/report.entity';
import { EmailReportRunSuccessfullyEvent } from '../../../../events/email-report-run-successfully.event';
import { GoogleChatReportRunSuccessfullyEvent } from '../../../../events/google-chat-report-run-successfully.event';
import { MsTeamsReportRunSuccessfullyEvent } from '../../../../events/ms-teams-report-run-successfully.event';
import { SlackReportRunSuccessfullyEvent } from '../../../../events/slack-report-run-successfully.event';
import {
  ReportRunExecutionContext,
  ReportRunLogger,
} from '../../../../report-run-logging/report-run-logger';
import { ConsumptionTrackingService } from '../../../../services/consumption-tracking.service';
import { DataDestinationCredentialsResolver } from '../../../data-destination-credentials-resolver.service';
import { isEmailConfig } from '../../../data-destination-config.guards';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import { ReportCondition } from '../../../enums/report-condition.enum';
import { DataDestinationReportWriter } from '../../../interfaces/data-destination-report-writer.interface';
import { EmailConfig } from '../schemas/email-config.schema';
import { EmailCredentialsSchema, type EmailCredentials } from '../schemas/email-credentials.schema';
import { renderEmailReportTemplate } from '../templates/email-report.template';

/**
 * An abstract class that provides a base implementation for writing email reports.
 * It implements the `DataDestinationReportWriter` interface and handles the preparation,
 * processing, and finalization of reports to be sent via email.
 *
 * Subclasses must define the abstract properties `type` and `logger`.
 */
abstract class BaseEmailReportWriter implements DataDestinationReportWriter {
  abstract readonly type: DataDestinationType;
  protected abstract readonly logger: Logger;

  private static readonly MESSAGES = {
    REPORT_STARTED: 'Report started',
    REPORT_COMPLETED: 'Report completed',
    REPORT_FAILED: 'Report template rendering failed',
    REPORT_SKIPPED_BY_CONDITION: 'Report processing is ignored due to sending condition',
    ERROR_SENDING: 'Error sending Report data',
  } as const;

  private emailConfig: EmailConfig;
  private emailCredentials: EmailCredentials;
  private reportDataDescription: ReportDataDescription;
  private report: Report;
  private reportDataRows: unknown[][] = [];
  private executionLogger?: ReportRunLogger;

  protected constructor(
    private readonly emailProvider: EmailProviderFacade,
    private readonly markdownParser: MarkdownParser,
    private readonly publicOriginService: PublicOriginService,
    private readonly insightTemplateFacade: DataMartInsightTemplateFacadeImpl,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    private readonly producer: OwoxProducer,
    private readonly credentialsResolver: DataDestinationCredentialsResolver
  ) {}

  public setExecutionContext(ctx: ReportRunExecutionContext): void {
    this.executionLogger = ctx.logger;
  }

  public async prepareToWriteReport(
    report: Report,
    reportDataDescription: ReportDataDescription
  ): Promise<void> {
    if (!isEmailConfig(report.destinationConfig)) {
      throw new Error('Invalid Email destination configuration provided');
    }
    this.emailConfig = report.destinationConfig;

    const resolvedCredentials = await this.credentialsResolver.resolve(report.dataDestination);
    const parsed = EmailCredentialsSchema.safeParse(resolvedCredentials);
    if (!parsed.success) {
      throw new Error('Invalid Email credentials provided');
    }
    this.emailCredentials = parsed.data;

    this.reportDataDescription = reportDataDescription;
    this.report = report;
  }

  public async writeReportDataBatch(reportDataBatch: ReportDataBatch): Promise<void> {
    this.reportDataRows.push(...reportDataBatch.dataRows);
  }

  public async finalize(processingError?: Error): Promise<void> {
    if (processingError) {
      this.handleProcessingError(processingError);
      return;
    }

    if (this.shouldSkipEmailDueToCondition()) {
      this.logger.debug(BaseEmailReportWriter.MESSAGES.REPORT_SKIPPED_BY_CONDITION);
      this.executionLogger?.log({
        type: 'log',
        message: BaseEmailReportWriter.MESSAGES.REPORT_SKIPPED_BY_CONDITION,
      });
    } else {
      const rendered = await this.renderMessageTemplate();
      const emailHtml = await this.prepareEmailHtml(rendered);
      await this.sendEmail(emailHtml);
    }

    await this.consumptionTrackingService.registerEmailBasedReportRunConsumption(this.report);
    await this.produceSuccessEvent();
  }

  private handleProcessingError(error: Error): void {
    this.executionLogger?.error(error);
    this.logger.warn(BaseEmailReportWriter.MESSAGES.ERROR_SENDING, error);
  }

  private shouldSkipEmailDueToCondition(): boolean {
    const condition = this.emailConfig.reportCondition;
    const hasData = this.reportDataRows.length > 0;

    return (
      (condition === ReportCondition.RESULT_IS_EMPTY && hasData) ||
      (condition === ReportCondition.RESULT_IS_NOT_EMPTY && !hasData)
    );
  }

  private async renderMessageTemplate(): Promise<string> {
    this.executionLogger?.log({
      type: 'log',
      message: BaseEmailReportWriter.MESSAGES.REPORT_STARTED,
    });

    const {
      rendered = '',
      status,
      prompts = [] as DataMartPromptMetaEntry[],
    } = await this.insightTemplateFacade.render({
      template: this.emailConfig.messageTemplate,
      params: {
        projectId: this.report.dataMart.projectId,
        dataMartId: this.report.dataMart.id,
      },
      promptProcessedContext: {
        entityName: 'REPORT',
        entityId: this.report.id,
        userId: this.report.createdById,
        projectId: this.report.dataMart.projectId,
      },
      consumptionContext: {
        contextType: 'REPORT',
        contextId: this.report.id,
        contextTitle: this.report.title,
        dataMart: this.report.dataMart,
      },
      context: {
        dataHeaders: this.reportDataDescription.dataHeaders,
        dataHeadersCount: this.reportDataDescription.dataHeaders.length,
        dataRows: this.reportDataRows,
        dataRowsCount: this.reportDataRows.length,
        tableSources: {
          main: {
            dataHeaders: this.reportDataDescription.dataHeaders,
            dataRows: this.reportDataRows,
          },
        },
      },
      disableBaseTagHandlers: false,
    });

    if (prompts.length > 0) {
      this.logPromptsMeta(prompts);
      this.logTemplateTelemetry(prompts);
    }

    this.logRenderedOutput(rendered);

    if (status === DataMartInsightTemplateStatus.WARNING) {
      throw new BusinessViolationException(BaseEmailReportWriter.MESSAGES.REPORT_FAILED);
    }

    if (status === DataMartInsightTemplateStatus.ERROR) {
      throw new Error(BaseEmailReportWriter.MESSAGES.REPORT_FAILED);
    }

    this.executionLogger?.log({
      type: 'log',
      message: BaseEmailReportWriter.MESSAGES.REPORT_COMPLETED,
    });

    return rendered;
  }

  private logPromptsMeta(prompts: DataMartPromptMetaEntry[]): void {
    for (const p of prompts) {
      this.logPromptMetaEntry(p);
      this.logPromptTelemetry(p);
      this.logReasoningPreview(p);
    }
  }

  private logPromptMetaEntry(prompt: DataMartPromptMetaEntry): void {
    this.executionLogger?.log({
      type: 'prompt_meta',
      prompt: prompt.payload?.prompt,
      artifact: prompt.meta?.artifact,
      status: prompt.meta?.status,
    });
  }

  private logPromptTelemetry(prompt: DataMartPromptMetaEntry): void {
    const telemetry = prompt.meta?.telemetry;
    const llmCalls = telemetry?.llmCalls ?? [];
    const toolCalls = telemetry?.toolCalls ?? [];
    const failedToolCalls = toolCalls.filter(call => !call.success).length;
    const lastLlm = llmCalls.length ? llmCalls[llmCalls.length - 1] : undefined;

    const summary = {
      llmCalls: llmCalls.length,
      toolCalls: toolCalls.length,
      failedToolCalls,
      lastFinishReason: lastLlm?.finishReason,
      totalUsage: getPromptTotalUsage(llmCalls),
    };

    this.executionLogger?.log({ type: 'prompt_telemetry', ...summary });
  }

  private logReasoningPreview(prompt: DataMartPromptMetaEntry): void {
    const telemetry = prompt.meta?.telemetry;
    const llmCalls = telemetry?.llmCalls ?? [];
    const lastLlm = llmCalls.length ? llmCalls[llmCalls.length - 1] : undefined;
    const preview = lastLlm?.reasoningPreview;

    if (typeof preview === 'string' && preview.length > 0) {
      this.executionLogger?.log({
        type: 'prompt_reasoning_preview',
        preview,
      });
    }
  }

  private logTemplateTelemetry(prompts: DataMartPromptMetaEntry[]): void {
    this.executionLogger?.log({
      type: 'template_telemetry',
      ...getTemplateTotalUsage(prompts ?? []),
    });
  }

  private logRenderedOutput(rendered: string): void {
    if (rendered && rendered.length > 0) {
      this.executionLogger?.log({
        type: 'output',
        output: rendered,
      });
    }
  }

  private async prepareEmailHtml(markdownContent: string): Promise<string> {
    const reportHtml = await this.markdownParser.parseToHtml(markdownContent, COLOR_THEME.LIGHT);

    return renderEmailReportTemplate({
      dataMartId: this.report.dataMart.id,
      dataMartTitle: this.report.dataMart.title,
      projectId: this.report.dataMart.projectId,
      reportBody: reportHtml,
      publicOrigin: this.publicOriginService.getPublicOrigin(),
    });
  }

  private async sendEmail(emailHtml: string): Promise<void> {
    await this.emailProvider.sendEmail(
      this.emailCredentials.to,
      this.emailConfig.subject,
      emailHtml
    );

    this.executionLogger?.log({ type: 'email_sent', to: this.emailCredentials.to });
  }

  private async produceSuccessEvent(): Promise<void> {
    const dataMart = this.report.dataMart;
    const runId = this.report.id;
    const userId = this.report.createdById;

    switch (this.type) {
      case DataDestinationType.EMAIL:
        await this.producer.produceEvent(
          new EmailReportRunSuccessfullyEvent(dataMart.id, runId, dataMart.projectId, userId)
        );
        break;
      case DataDestinationType.SLACK:
        await this.producer.produceEvent(
          new SlackReportRunSuccessfullyEvent(dataMart.id, runId, dataMart.projectId, userId)
        );
        break;
      case DataDestinationType.MS_TEAMS:
        await this.producer.produceEvent(
          new MsTeamsReportRunSuccessfullyEvent(dataMart.id, runId, dataMart.projectId, userId)
        );
        break;
      case DataDestinationType.GOOGLE_CHAT:
        await this.producer.produceEvent(
          new GoogleChatReportRunSuccessfullyEvent(dataMart.id, runId, dataMart.projectId, userId)
        );
        break;
    }
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class EmailReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(EmailReportWriter.name);
  readonly type = DataDestinationType.EMAIL;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService,
    insightTemplateFacade: DataMartInsightTemplateFacadeImpl,
    consumptionTrackingService: ConsumptionTrackingService,
    @Inject(OWOX_PRODUCER)
    producer: OwoxProducer,
    credentialsResolver: DataDestinationCredentialsResolver
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      producer,
      credentialsResolver
    );
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class SlackReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(SlackReportWriter.name);
  readonly type = DataDestinationType.SLACK;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService,
    insightTemplateFacade: DataMartInsightTemplateFacadeImpl,
    consumptionTrackingService: ConsumptionTrackingService,
    @Inject(OWOX_PRODUCER)
    producer: OwoxProducer,
    credentialsResolver: DataDestinationCredentialsResolver
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      producer,
      credentialsResolver
    );
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class MsTeamsReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(MsTeamsReportWriter.name);
  readonly type = DataDestinationType.MS_TEAMS;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService,
    insightTemplateFacade: DataMartInsightTemplateFacadeImpl,
    consumptionTrackingService: ConsumptionTrackingService,
    @Inject(OWOX_PRODUCER)
    producer: OwoxProducer,
    credentialsResolver: DataDestinationCredentialsResolver
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      producer,
      credentialsResolver
    );
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class GoogleChatReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(GoogleChatReportWriter.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService,
    insightTemplateFacade: DataMartInsightTemplateFacadeImpl,
    consumptionTrackingService: ConsumptionTrackingService,
    @Inject(OWOX_PRODUCER)
    producer: OwoxProducer,
    credentialsResolver: DataDestinationCredentialsResolver
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      producer,
      credentialsResolver
    );
  }
}
