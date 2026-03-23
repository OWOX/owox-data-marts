import { MarkdownParser } from '../../../../../common/markdown/markdown-parser.service';
import { DataMartInsightTemplateFacadeImpl } from '../../../../ai-insights/data-mart-insight-template.facade';
import { DataMartInsightTemplateStatus } from '../../../../ai-insights/data-mart-insights.types';
import { ReportDataBatch } from '../../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../../dto/domain/report-data-header.dto';
import { Report } from '../../../../entities/report.entity';
import { TemplateSourceTypeEnum } from '../../../../enums/template-source-type.enum';
import { InsightTemplate } from '../../../../entities/insight-template.entity';
import { InsightTemplateSourceDataService } from '../../../../services/insight-template-source-data.service';
import { InsightTemplateService } from '../../../../services/insight-template.service';
import { InsightTemplateSourceUsageService } from '../../../../services/insight-template-source-usage.service';
import { DataDestinationCredentialsResolver } from '../../../data-destination-credentials-resolver.service';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import { ReportCondition } from '../../../enums/report-condition.enum';
import { EmailReportWriter } from './email-report-writer';

jest.mock('../../../../../common/markdown/markdown-parser.service', () => ({
  COLOR_THEME: { LIGHT: 'LIGHT' },
  MarkdownParser: function MarkdownParser() {},
}));

describe('EmailReportWriter', () => {
  const createWriter = () => {
    const emailProvider = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const markdownParser = {
      parseToHtml: jest.fn().mockResolvedValue('<p>Rendered</p>'),
    };
    const publicOriginService = {
      getPublicOrigin: jest.fn().mockReturnValue('https://example.test'),
    };
    const insightTemplateFacade = {
      render: jest.fn().mockResolvedValue({
        rendered: 'Rendered markdown',
        status: DataMartInsightTemplateStatus.OK,
        prompts: [],
      }),
    };
    const consumptionTrackingService = {
      registerEmailBasedReportRunConsumption: jest.fn().mockResolvedValue(undefined),
    };
    const producer = {
      produceEvent: jest.fn().mockResolvedValue(undefined),
    };
    const credentialsResolver = {
      resolve: jest.fn().mockResolvedValue({
        type: 'email-credentials',
        to: ['demo@example.com'],
      }),
    };
    const sourceDataService = {
      buildRenderContext: jest.fn().mockResolvedValue({
        tableSources: {},
      }),
    };
    const insightTemplateService = {
      getByIdAndDataMartIdWithSourceEntities: jest.fn().mockResolvedValue({
        id: 'template-1',
        template: '{{table}}',
        sources: [],
      } satisfies Partial<InsightTemplate>),
    };
    const sourceUsageService = {
      getUsedSourceKeys: jest.fn().mockReturnValue(['main']),
    };

    return {
      writer: new EmailReportWriter(
        emailProvider as never,
        markdownParser as never as MarkdownParser,
        publicOriginService as never,
        insightTemplateFacade as never as DataMartInsightTemplateFacadeImpl,
        consumptionTrackingService as never,
        producer as never,
        credentialsResolver as never as DataDestinationCredentialsResolver,
        sourceDataService as never as InsightTemplateSourceDataService,
        insightTemplateService as never as InsightTemplateService,
        sourceUsageService as never as InsightTemplateSourceUsageService
      ),
      emailProvider,
      markdownParser,
      insightTemplateFacade,
      sourceDataService,
      insightTemplateService,
      sourceUsageService,
      credentialsResolver,
      consumptionTrackingService,
      producer,
    };
  };

  const createReport = (): Report =>
    ({
      id: 'report-1',
      title: 'Report',
      createdById: 'user-1',
      destinationConfig: {
        type: 'email-config',
        subject: 'Weekly report',
        reportCondition: ReportCondition.ALWAYS,
        templateSource: {
          type: TemplateSourceTypeEnum.INSIGHT_TEMPLATE,
          config: {
            insightTemplateId: 'template-1',
          },
        },
      },
      dataDestination: {
        id: 'destination-1',
        type: DataDestinationType.EMAIL,
      },
      dataMart: {
        id: 'data-mart-1',
        title: 'Main Data Mart',
        projectId: 'project-1',
      },
    }) as Report;

  const createCustomMessageReport = (): Report =>
    ({
      ...createReport(),
      destinationConfig: {
        type: 'email-config',
        subject: 'Weekly report',
        reportCondition: ReportCondition.ALWAYS,
        templateSource: {
          type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
          config: {
            messageTemplate: 'Credits: {{table}}',
          },
        },
      },
    }) as Report;

  it('passes preloaded main source to buildRenderContext for insight template reports', async () => {
    const { writer, sourceDataService, insightTemplateFacade, emailProvider, sourceUsageService } =
      createWriter();
    const report = createReport();
    const reportDataDescription = new ReportDataDescription([
      new ReportDataHeader('credits', 'Credits', 'Credits description'),
    ]);

    await writer.prepareToWriteReport(report, reportDataDescription);
    await writer.writeReportDataBatch(new ReportDataBatch([[100], [200]], null));
    await writer.finalize(undefined, {
      mainRowsTruncationInfo: {
        rowsLimit: 100,
        hasMoreRowsThanLimit: true,
      },
    });

    expect(sourceUsageService.getUsedSourceKeys).toHaveBeenCalledWith('{{table}}');
    expect(sourceDataService.buildRenderContext).toHaveBeenCalledWith(
      report.dataMart,
      expect.objectContaining({
        id: 'template-1',
      }),
      {
        usedSourceKeys: new Set(['main']),
        preloadedSources: {
          main: {
            dataHeaders: [
              {
                name: 'credits',
                alias: 'Credits',
                description: 'Credits description',
              },
            ],
            dataRows: [[100], [200]],
            dataHeadersCount: 1,
            hasMoreRowsThanLimit: true,
            rowsLimit: 100,
          },
        },
      }
    );
    expect(insightTemplateFacade.render).toHaveBeenCalled();
    expect(emailProvider.sendEmail).toHaveBeenCalled();
  });

  it('passes empty usedSourceKeys set when insight template has no supported data tags', async () => {
    const { writer, sourceDataService, sourceUsageService, insightTemplateService } =
      createWriter();
    const report = createReport();

    sourceUsageService.getUsedSourceKeys.mockReturnValue([]);
    insightTemplateService.getByIdAndDataMartIdWithSourceEntities.mockResolvedValue({
      id: 'template-1',
      template: '# Report without data tags',
      sources: [],
    } satisfies Partial<InsightTemplate>);

    await writer.prepareToWriteReport(report, new ReportDataDescription([]));
    await writer.finalize();

    expect(sourceDataService.buildRenderContext).toHaveBeenCalledWith(
      report.dataMart,
      expect.objectContaining({
        id: 'template-1',
      }),
      {
        usedSourceKeys: new Set(),
        preloadedSources: {
          main: {
            dataHeaders: [],
            dataRows: [],
            dataHeadersCount: 0,
            hasMoreRowsThanLimit: false,
            rowsLimit: 0,
          },
        },
      }
    );
  });

  it('does not use source analyzer or source-data service for CUSTOM_MESSAGE flow', async () => {
    const {
      writer,
      sourceDataService,
      sourceUsageService,
      insightTemplateService,
      emailProvider,
      insightTemplateFacade,
    } = createWriter();
    const report = createCustomMessageReport();

    await writer.prepareToWriteReport(report, new ReportDataDescription([]));
    await writer.finalize();

    expect(sourceUsageService.getUsedSourceKeys).not.toHaveBeenCalled();
    expect(sourceDataService.buildRenderContext).not.toHaveBeenCalled();
    expect(insightTemplateService.getByIdAndDataMartIdWithSourceEntities).not.toHaveBeenCalled();
    expect(insightTemplateFacade.render).toHaveBeenCalled();
    expect(emailProvider.sendEmail).toHaveBeenCalled();
  });
});
