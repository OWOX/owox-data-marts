import { SourceResolverToolsService } from './source-resolver-tools.service';
import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { AssistantOrchestratorRequest } from './ai-assistant-types';

const buildTemplateRequest = (message: string): AssistantOrchestratorRequest => ({
  projectId: 'project-1',
  dataMartId: 'data-mart-1',
  history: [{ role: AiAssistantMessageRole.USER, content: message }],
  sessionContext: {
    sessionId: 'session-1',
    scope: AiAssistantScope.TEMPLATE,
    templateId: 'template-1',
  },
});

describe('SourceResolverToolsService', () => {
  const createService = () => {
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightArtifactService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
      listByDataMartIdAndProjectIdExcludingArtifactIds: jest.fn(),
    };
    const insightTemplateSourceService = {
      getByIdAndTemplateId: jest.fn(),
    };

    const service = new SourceResolverToolsService(
      insightTemplateService as never,
      insightArtifactService as never,
      insightTemplateSourceService as never
    );

    return {
      service,
      insightTemplateService,
      insightArtifactService,
      insightTemplateSourceService,
    };
  };

  it('resolves source by explicit key only', () => {
    const { service } = createService();
    const sources = [
      {
        templateSourceId: 'template-source-1',
        key: 'consumption_2025',
        sourceIntentResolution: 'none' as const,
      },
    ];

    const byKey = service.resolveSourceByKey(sources, 'consumption_2025');
    expect(byKey.matchedSource?.key).toBe('consumption_2025');
    expect(byKey.confidence).toBe(1);

    const notByAlias = service.resolveSourceByKey(sources, 'monthly consumption');
    expect(notByAlias.matchedSource).toBeUndefined();
    expect(notByAlias.confidence).toBe(0);
  });

  it('lists template sources in source-only format', async () => {
    const { service, insightTemplateService, insightArtifactService } = createService();
    const request = buildTemplateRequest('show consumption for 2026');

    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'template-1',
      sources: [
        {
          templateSourceId: 'template-source-1',
          key: 'consumption_2026',
          artifactId: 'artifact-2',
        },
      ],
    });
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'artifact-2',
      title: 'Consumption 2026',
      sql: 'SELECT 1',
    });

    const result = await service.listTemplateSources(request);

    expect(insightTemplateService.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'template-1',
      'data-mart-1',
      'project-1'
    );
    expect(insightArtifactService.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'artifact-2',
      'data-mart-1',
      'project-1'
    );
    expect(result).toEqual({
      sources: [
        {
          templateSourceId: 'template-source-1',
          key: 'consumption_2026',
          sourceTitle: 'Consumption 2026',
          sql: 'SELECT 1',
        },
      ],
      diagnostics: [],
    });
  });

  it('resolves template source SQL by template source id from source entity relation', async () => {
    const { service, insightTemplateSourceService } = createService();
    const request = buildTemplateRequest('refine source sql');

    insightTemplateSourceService.getByIdAndTemplateId.mockResolvedValue({
      id: 'template-source-1',
      key: 'monthly_consumption_2025',
      artifactId: 'artifact-1',
      sql: () => 'SELECT * FROM monthly_consumption',
    });

    const result = await service.resolveTemplateSourceSqlByTemplateSourceId({
      request,
      templateSourceId: 'template-source-1',
    });

    expect(insightTemplateSourceService.getByIdAndTemplateId).toHaveBeenCalledWith(
      'template-source-1',
      'template-1'
    );
    expect(result).toEqual({
      templateSourceId: 'template-source-1',
      sourceKey: 'monthly_consumption_2025',
      sql: 'SELECT * FROM monthly_consumption',
    });
  });
});
