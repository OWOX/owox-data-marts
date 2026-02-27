import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { BaseSqlHandleResolverService } from './base-sql-handle-resolver.service';

describe('BaseSqlHandleResolverService', () => {
  const createRequest = () => ({
    projectId: 'project-1',
    dataMartId: 'data-mart-1',
    history: [
      {
        role: AiAssistantMessageRole.USER,
        content: 'refine sql',
        createdAt: '2026-02-27T10:00:00.000Z',
      },
    ],
    sessionContext: {
      sessionId: 'session-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
    },
  });

  const createService = () => {
    const aiAssistantSessionService = {
      getAssistantMessageByIdAndSessionId: jest.fn(),
    };
    const sourceResolverToolsService = {
      resolveTemplateSourceSqlByTemplateSourceId: jest.fn(),
      resolveTemplateSourceSqlByKey: jest.fn(),
      resolveArtifactSqlById: jest.fn(),
    };

    return {
      service: new BaseSqlHandleResolverService(
        aiAssistantSessionService as never,
        sourceResolverToolsService as never
      ),
      aiAssistantSessionService,
      sourceResolverToolsService,
    };
  };

  it('resolves rev handle via assistant message', async () => {
    const { service, aiAssistantSessionService } = createService();
    const request = createRequest();

    aiAssistantSessionService.getAssistantMessageByIdAndSessionId.mockResolvedValue({
      id: 'assistant-message-42',
      sqlCandidate: 'SELECT 42',
    });

    const resolved = await service.resolve('rev:assistant-message-42', request);

    expect(aiAssistantSessionService.getAssistantMessageByIdAndSessionId).toHaveBeenCalledWith(
      'assistant-message-42',
      'session-1'
    );
    expect(resolved).toEqual({
      baseSql: 'SELECT 42',
      baseAssistantMessageId: 'assistant-message-42',
      origin: { type: 'handle', handle: 'rev:assistant-message-42', kind: 'rev' },
    });
  });

  it('throws when handle cannot be resolved by any kind', async () => {
    const { service, aiAssistantSessionService, sourceResolverToolsService } = createService();
    const request = createRequest();

    aiAssistantSessionService.getAssistantMessageByIdAndSessionId.mockRejectedValue(
      new Error('not found')
    );
    sourceResolverToolsService.resolveTemplateSourceSqlByTemplateSourceId.mockRejectedValue(
      new Error('not found')
    );
    sourceResolverToolsService.resolveTemplateSourceSqlByKey.mockRejectedValue(
      new Error('not found')
    );
    sourceResolverToolsService.resolveArtifactSqlById.mockRejectedValue(new Error('not found'));

    await expect(service.resolve('unknown-handle', request)).rejects.toThrow(
      'Unable to resolve SQL for baseSqlHandle "unknown-handle"'
    );
  });

  it('resolves src handle via templateSourceId', async () => {
    const { service, sourceResolverToolsService } = createService();
    const request = createRequest();

    sourceResolverToolsService.resolveTemplateSourceSqlByTemplateSourceId.mockResolvedValue({
      templateSourceId: '0e12a5d0-865e-4d1a-95d9-bf67a127f2c8',
      sourceKey: 'monthly_consumption',
      artifactId: 'artifact-1',
      sql: 'SELECT * FROM source_sql',
    });

    const resolved = await service.resolve('src:0e12a5d0-865e-4d1a-95d9-bf67a127f2c8', request);

    expect(
      sourceResolverToolsService.resolveTemplateSourceSqlByTemplateSourceId
    ).toHaveBeenCalledWith({
      request,
      templateSourceId: '0e12a5d0-865e-4d1a-95d9-bf67a127f2c8',
    });
    expect(resolved).toEqual({
      baseSql: 'SELECT * FROM source_sql',
      origin: {
        type: 'handle',
        handle: 'src:0e12a5d0-865e-4d1a-95d9-bf67a127f2c8',
        kind: 'src',
      },
    });
  });
});
