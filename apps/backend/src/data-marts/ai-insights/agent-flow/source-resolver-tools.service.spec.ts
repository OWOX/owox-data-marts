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

    const service = new SourceResolverToolsService(
      insightTemplateService as never,
      insightArtifactService as never
    );

    return {
      service,
      insightTemplateService,
      insightArtifactService,
    };
  };

  it('resolves source by explicit key only', () => {
    const { service } = createService();
    const sources = [
      {
        key: 'consumption_2025',
        artifactId: 'artifact-1',
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

  it('builds unlinked artifact catalog excluding linked artifact ids', async () => {
    const { service, insightArtifactService } = createService();
    insightArtifactService.listByDataMartIdAndProjectIdExcludingArtifactIds.mockResolvedValue([
      {
        id: 'artifact-2',
        title: 'Consumption 2026',
        sql: `
          SELECT
            month,
            SUM(consumption) AS consumption
          FROM usage
          WHERE year = 2026
          GROUP BY month
        `,
      },
    ]);

    const result = await service.listUnlinkedArtifactSources({
      request: buildTemplateRequest('show consumption for 2026'),
      linkedArtifactIds: ['artifact-1'],
    });

    expect(
      insightArtifactService.listByDataMartIdAndProjectIdExcludingArtifactIds
    ).toHaveBeenCalledWith({
      dataMartId: 'data-mart-1',
      projectId: 'project-1',
      excludedArtifactIds: ['artifact-1'],
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.artifactId).toBe('artifact-2');
    expect(result.artifacts[0]?.artifactTitle).toBe('Consumption 2026');
  });
});
