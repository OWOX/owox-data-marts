import { Inject, Injectable, Logger, NotFoundException, Scope } from '@nestjs/common';
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
import { OwoxEventDispatcher } from '../../../../../common/event-dispatcher/owox-event-dispatcher';
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
import { EmailReportRunEvent } from '../../../../events/email-report-run.event';
import { GoogleChatReportRunEvent } from '../../../../events/google-chat-report-run.event';
import { MsTeamsReportRunEvent } from '../../../../events/ms-teams-report-run.event';
import { RunEventStatus } from '../../../../events/run-event-status.type';
import { SlackReportRunEvent } from '../../../../events/slack-report-run.event';
import {
  ReportRunExecutionContext,
  ReportRunLogger,
} from '../../../../report-run-logging/report-run-logger';
import { ConsumptionTrackingService } from '../../../../services/consumption-tracking.service';
import { InsightTemplateSourceDataService } from '../../../../services/insight-template-source-data.service';
import { InsightTemplateService } from '../../../../services/insight-template.service';
import { InsightTemplateSourceUsageService } from '../../../../services/insight-template-source-usage.service';
import { InsightTemplateTableSourceContext } from '../../../../services/insight-template-source-data.service';
import { DataDestinationCredentialsResolver } from '../../../data-destination-credentials-resolver.service';
import { isEmailConfig } from '../../../data-destination-config.guards';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import { TemplateSourceTypeEnum } from '../../../../enums/template-source-type.enum';
import { ReportCondition } from '../../../enums/report-condition.enum';
import {
  DataDestinationReportWriter,
  ReportWriteFinalizeMeta,
} from '../../../interfaces/data-destination-report-writer.interface';
import { RowsTruncationInfo } from '../../../../use-cases/report-execution-policy.resolver';
import { EmailConfig } from '../schemas/email-config.schema';
import { type EmailCredentials, EmailCredentialsSchema } from '../schemas/email-credentials.schema';
import { renderEmailReportTemplate } from '../templates/email-report.template';
import { InsightTemplate } from '../../../../entities/insight-template.entity';

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
  private mainRowsTruncationInfo: RowsTruncationInfo | null = null;
  private executionLogger?: ReportRunLogger;

  protected constructor(
    private readonly emailProvider: EmailProviderFacade,
    private readonly markdownParser: MarkdownParser,
    private readonly publicOriginService: PublicOriginService,
    private readonly insightTemplateFacade: DataMartInsightTemplateFacadeImpl,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly credentialsResolver: DataDestinationCredentialsResolver,
    private readonly sourceDataService: InsightTemplateSourceDataService,
    protected readonly insightTemplateService: InsightTemplateService,
    private readonly sourceUsageService: InsightTemplateSourceUsageService
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

  public async finalize(processingError?: Error, meta?: ReportWriteFinalizeMeta): Promise<void> {
    this.mainRowsTruncationInfo = meta?.mainRowsTruncationInfo ?? null;

    if (processingError) {
      await this.handleProcessingError(processingError);
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
    await this.produceRunEvent('successfully');
  }

  private async handleProcessingError(error: Error): Promise<void> {
    this.executionLogger?.error(error);
    this.logger.warn(BaseEmailReportWriter.MESSAGES.ERROR_SENDING, error);
    await this.produceRunEvent('unsuccessfully');
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

    let templateToRender: string;
    let insightTemplate: InsightTemplate | null = null;

    const templateSourceType = this.emailConfig.templateSource.type;

    if (templateSourceType === TemplateSourceTypeEnum.INSIGHT_TEMPLATE) {
      const insightTemplateId = this.emailConfig.templateSource.config.insightTemplateId;
      try {
        insightTemplate = await this.insightTemplateService.getByIdAndDataMartIdWithSourceEntities(
          insightTemplateId,
          this.report.dataMart.id
        );
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw new BusinessViolationException(
            `Insight template with ID ${insightTemplateId} not found for this DataMart`
          );
        }

        throw error;
      }

      if (!insightTemplate.template) {
        throw new BusinessViolationException(
          `Insight template with ID ${insightTemplateId} has no template content`
        );
      }

      templateToRender = insightTemplate.template;
    } else {
      templateToRender = this.emailConfig.templateSource.config.messageTemplate;
    }

    let renderContext: Record<string, unknown> | undefined;

    if (insightTemplate && templateSourceType === TemplateSourceTypeEnum.INSIGHT_TEMPLATE) {
      const usedSourceKeys = new Set(this.sourceUsageService.getUsedSourceKeys(templateToRender));
      renderContext = await this.sourceDataService.buildRenderContext(
        this.report.dataMart,
        insightTemplate,
        {
          usedSourceKeys,
          preloadedSources: {
            main: this.buildPreloadedMainSource(),
          },
        }
      );
    } else {
      renderContext = {
        dataHeaders: this.reportDataDescription.dataHeaders,
        dataHeadersCount: this.reportDataDescription.dataHeaders.length,
        dataRows: this.reportDataRows,
        tableSources: {
          main: {
            dataHeaders: this.reportDataDescription.dataHeaders.map(h => ({
              name: h.name,
              alias: h.alias,
              description: h.description,
            })),
            dataRows: this.reportDataRows,
          },
        },
      };
    }

    const {
      rendered = '',
      status,
      prompts = [] as DataMartPromptMetaEntry[],
    } = await this.insightTemplateFacade.render({
      template: templateToRender,
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
      context: renderContext,
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

  private buildPreloadedMainSource(): InsightTemplateTableSourceContext {
    return {
      dataHeaders: this.reportDataDescription.dataHeaders.map(h => ({
        name: h.name,
        alias: h.alias,
        description: h.description,
      })),
      dataRows: this.reportDataRows,
      dataHeadersCount: this.reportDataDescription.dataHeaders.length,
      hasMoreRowsThanLimit: this.mainRowsTruncationInfo?.hasMoreRowsThanLimit ?? false,
      rowsLimit: this.mainRowsTruncationInfo?.rowsLimit ?? this.reportDataRows.length,
    };
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

  private async produceRunEvent(status: RunEventStatus): Promise<void> {
    const dataMart = this.report.dataMart;
    const runId = this.report.id;
    const userId = this.report.createdById;

    switch (this.type) {
      case DataDestinationType.EMAIL:
        await this.eventDispatcher.publishExternal(
          new EmailReportRunEvent(dataMart.id, runId, dataMart.projectId, userId, status)
        );
        break;
      case DataDestinationType.SLACK:
        await this.eventDispatcher.publishExternal(
          new SlackReportRunEvent(dataMart.id, runId, dataMart.projectId, userId, status)
        );
        break;
      case DataDestinationType.MS_TEAMS:
        await this.eventDispatcher.publishExternal(
          new MsTeamsReportRunEvent(dataMart.id, runId, dataMart.projectId, userId, status)
        );
        break;
      case DataDestinationType.GOOGLE_CHAT:
        await this.eventDispatcher.publishExternal(
          new GoogleChatReportRunEvent(dataMart.id, runId, dataMart.projectId, userId, status)
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
    eventDispatcher: OwoxEventDispatcher,
    credentialsResolver: DataDestinationCredentialsResolver,
    sourceDataService: InsightTemplateSourceDataService,
    insightTemplateService: InsightTemplateService,
    sourceUsageService: InsightTemplateSourceUsageService
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      eventDispatcher,
      credentialsResolver,
      sourceDataService,
      insightTemplateService,
      sourceUsageService
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
    eventDispatcher: OwoxEventDispatcher,
    credentialsResolver: DataDestinationCredentialsResolver,
    sourceDataService: InsightTemplateSourceDataService,
    insightTemplateService: InsightTemplateService,
    sourceUsageService: InsightTemplateSourceUsageService
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      eventDispatcher,
      credentialsResolver,
      sourceDataService,
      insightTemplateService,
      sourceUsageService
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
    eventDispatcher: OwoxEventDispatcher,
    credentialsResolver: DataDestinationCredentialsResolver,
    sourceDataService: InsightTemplateSourceDataService,
    insightTemplateService: InsightTemplateService,
    sourceUsageService: InsightTemplateSourceUsageService
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      eventDispatcher,
      credentialsResolver,
      sourceDataService,
      insightTemplateService,
      sourceUsageService
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
    eventDispatcher: OwoxEventDispatcher,
    credentialsResolver: DataDestinationCredentialsResolver,
    sourceDataService: InsightTemplateSourceDataService,
    insightTemplateService: InsightTemplateService,
    sourceUsageService: InsightTemplateSourceUsageService
  ) {
    super(
      emailProvider,
      markdownParser,
      publicOriginService,
      insightTemplateFacade,
      consumptionTrackingService,
      eventDispatcher,
      credentialsResolver,
      sourceDataService,
      insightTemplateService,
      sourceUsageService
    );
  }
}
