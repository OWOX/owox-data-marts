import { DataMartTemplateFacadeImpl } from '../template/data-mart-template.facade.impl';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { InsightTemplateExecutionService } from './insight-template-execution.service';
import { InsightTemplateSourceDataService } from './insight-template-source-data.service';
import { InsightTemplateSourceUsageService } from './insight-template-source-usage.service';

describe('InsightTemplateExecutionService', () => {
  const createService = () => {
    const dataMartRunService = {
      isInsightTemplateRunning: jest.fn().mockResolvedValue(false),
      createAndMarkInsightTemplateRunAsPending: jest.fn().mockResolvedValue({
        id: 'run-1',
        createdById: 'user-1',
      }),
      markInsightTemplateRunAsStarted: jest.fn().mockResolvedValue(undefined),
      markInsightTemplateRunAsFinished: jest.fn().mockResolvedValue(undefined),
    };
    const insightTemplateRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const systemTimeService = {
      now: jest.fn().mockReturnValue('2026-03-19T12:00:00.000Z'),
    };
    const templateFacade = {
      render: jest.fn().mockResolvedValue({
        rendered: 'Rendered output',
      }),
    };
    const sourceDataService = {
      buildRenderContext: jest.fn().mockResolvedValue({
        tableSources: {},
      }),
    };
    const sourceUsageService = {
      getUsedSourceKeys: jest.fn().mockReturnValue(['secondary']),
    };

    return {
      service: new InsightTemplateExecutionService(
        dataMartRunService as never,
        insightTemplateRepository as never,
        systemTimeService as never,
        templateFacade as never as DataMartTemplateFacadeImpl,
        sourceDataService as never as InsightTemplateSourceDataService,
        sourceUsageService as never as InsightTemplateSourceUsageService
      ),
      dataMartRunService,
      insightTemplateRepository,
      templateFacade,
      sourceDataService,
      sourceUsageService,
    };
  };

  const createDataMart = () =>
    ({
      id: 'data-mart-1',
      projectId: 'project-1',
      status: DataMartStatus.PUBLISHED,
    }) as const;

  const createInsightTemplate = (template = '{{table source="secondary"}}') =>
    ({
      id: 'template-1',
      template,
      sources: [],
    }) as const;

  it('passes usedSourceKeys from analyzer into buildRenderContext', async () => {
    const { service, sourceUsageService, sourceDataService, templateFacade } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate();

    await service.run(dataMart as never, insightTemplate as never, 'user-1', 'MANUAL' as never);

    expect(sourceUsageService.getUsedSourceKeys).toHaveBeenCalledWith(insightTemplate.template);
    expect(sourceDataService.buildRenderContext).toHaveBeenCalledWith(dataMart, insightTemplate, {
      usedSourceKeys: new Set(['secondary']),
    });
    expect(templateFacade.render).toHaveBeenCalledWith({
      template: insightTemplate.template,
      context: { tableSources: {} },
    });
  });

  it('passes empty usedSourceKeys set when template has no supported data tags', async () => {
    const { service, sourceUsageService, sourceDataService, dataMartRunService } = createService();
    const dataMart = createDataMart();
    const insightTemplate = createInsightTemplate('# Report without data tags');

    sourceUsageService.getUsedSourceKeys.mockReturnValue([]);

    await service.run(dataMart as never, insightTemplate as never, 'user-1', 'MANUAL' as never);

    expect(sourceDataService.buildRenderContext).toHaveBeenCalledWith(dataMart, insightTemplate, {
      usedSourceKeys: new Set(),
    });
    expect(dataMartRunService.markInsightTemplateRunAsFinished).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-1' }),
      expect.objectContaining({ status: DataMartRunStatus.SUCCESS })
    );
  });
});
