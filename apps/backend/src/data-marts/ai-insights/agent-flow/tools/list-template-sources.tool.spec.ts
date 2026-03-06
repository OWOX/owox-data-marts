import { AiAssistantMessageRole } from '../../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../../enums/ai-assistant-scope.enum';
import { ListTemplateSourcesTool } from './list-template-sources.tool';

describe('ListTemplateSourcesTool', () => {
  const createContext = () =>
    ({
      request: {
        projectId: 'project-1',
        dataMartId: 'data-mart-1',
        conversationContext: {
          turns: [{ role: AiAssistantMessageRole.USER, content: 'show sources' }],
          conversationSnapshot: null,
        },
        sessionContext: {
          sessionId: 'session-1',
          scope: AiAssistantScope.TEMPLATE,
          templateId: 'template-1',
        },
      },
    }) as never;

  it('builds src handle strictly from templateSourceId', async () => {
    const sourceResolver = {
      listTemplateSources: jest.fn().mockResolvedValue({
        sources: [
          {
            templateSourceId: 'tpl-src-1',
            key: 'monthly_consumption',
            artifactId: 'artifact-1',
            artifactTitle: 'Monthly consumption',
            sql: 'SELECT 1',
          },
        ],
        diagnostics: [],
      }),
    };
    const tool = new ListTemplateSourcesTool(sourceResolver as never);

    const output = await tool.execute({}, createContext());

    expect(output.sources).toEqual([
      expect.objectContaining({
        templateSourceId: 'tpl-src-1',
        key: 'monthly_consumption',
        baseSqlHandle: 'src:tpl-src-1',
      }),
    ]);
  });
});
