import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { PublicOriginService } from '../../../../../common/config/public-origin.service';
import {
  EMAIL_PROVIDER_FACADE,
  EmailProviderFacade,
} from '../../../../../common/email/shared/email-provider.facade';
import {
  COLOR_THEME,
  MarkdownParser,
} from '../../../../../common/markdown/markdown-parser.service';
import { ReportDataBatch } from '../../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../../dto/domain/report-data-description.dto';
import { Report } from '../../../../entities/report.entity';
import { isEmailConfig } from '../../../data-destination-config.guards';
import { isEmailCredentials } from '../../../data-destination-credentials.guards';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import { ReportCondition } from '../../../enums/report-condition.enum';
import { DataDestinationReportWriter } from '../../../interfaces/data-destination-report-writer.interface';
import { EmailConfig } from '../schemas/email-config.schema';
import { EmailCredentials } from '../schemas/email-credentials.schema';
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

  private emailConfig: EmailConfig;
  private emailCredentials: EmailCredentials;
  private reportDataDescription: ReportDataDescription;
  private report: Report;
  private reportDataRows: unknown[][] = [];

  protected constructor(
    private readonly emailProvider: EmailProviderFacade,
    private readonly markdownParser: MarkdownParser,
    private readonly publicOriginService: PublicOriginService
  ) {}

  public async prepareToWriteReport(
    report: Report,
    reportDataDescription: ReportDataDescription
  ): Promise<void> {
    if (!isEmailConfig(report.destinationConfig)) {
      throw new Error('Invalid Email destination configuration provided');
    }
    this.emailConfig = report.destinationConfig;

    if (!isEmailCredentials(report.dataDestination.credentials)) {
      throw new Error('Invalid Google Sheets credentials provided');
    }
    this.emailCredentials = report.dataDestination.credentials;

    this.reportDataDescription = reportDataDescription;
    this.report = report;
  }

  public async writeReportDataBatch(reportDataBatch: ReportDataBatch): Promise<void> {
    this.reportDataRows.push(...reportDataBatch.dataRows);
  }

  public async finalize(processingError?: Error): Promise<void> {
    if (processingError) {
      this.logger.warn('Error sending report data', processingError);
      return;
    }

    const condition = this.emailConfig.reportCondition;
    if (
      (condition === ReportCondition.RESULT_IS_EMPTY && this.reportDataRows.length !== 0) ||
      (condition === ReportCondition.RESULT_IS_NOT_EMPTY && this.reportDataRows.length === 0)
    ) {
      this.logger.debug('Email is ignored due to sending condition');
      return;
    }

    // TODO: integrate with AI Insights
    const reportHtml = await this.markdownParser.parseToHtml(
      this.emailConfig.messageTemplate,
      COLOR_THEME.LIGHT
    );

    const emailHtml = renderEmailReportTemplate({
      dataMartId: this.report.dataMart.id,
      dataMartTitle: this.report.dataMart.title,
      projectId: this.report.dataMart.projectId,
      reportBody: reportHtml,
      publicOrigin: this.publicOriginService.getPublicOrigin(),
    });

    await this.emailProvider.sendEmail(
      this.emailCredentials.to,
      this.emailConfig.subject,
      emailHtml
    );
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class EmailReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(EmailReportWriter.name);
  readonly type = DataDestinationType.EMAIL;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService
  ) {
    super(emailProvider, markdownParser, publicOriginService);
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class SlackReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(SlackReportWriter.name);
  readonly type = DataDestinationType.SLACK;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService
  ) {
    super(emailProvider, markdownParser, publicOriginService);
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class MsTeamsReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(MsTeamsReportWriter.name);
  readonly type = DataDestinationType.MS_TEAMS;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService
  ) {
    super(emailProvider, markdownParser, publicOriginService);
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class GoogleChatReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(GoogleChatReportWriter.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    publicOriginService: PublicOriginService
  ) {
    super(emailProvider, markdownParser, publicOriginService);
  }
}
