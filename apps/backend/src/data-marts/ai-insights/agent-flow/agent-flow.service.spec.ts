jest.mock('./agent-flow.agent', () => ({
  AgentFlowAgent: function AgentFlowAgentMock() {},
}));
jest.mock('../../../common/ai-insights/services/prompt-sanitizer.service', () => ({
  PromptSanitizerService: function PromptSanitizerServiceMock() {},
}));

import { AgentFlowService } from './agent-flow.service';
import { AgentFlowContentPolicyRestrictedError } from './agent-flow-policy-sanitizer.service';
import { AiAssistantMessageRole } from '../../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../../enums/ai-assistant-scope.enum';
import { AgentFlowPromptContext } from './types';

describe('AgentFlowService', () => {
  const createRequest = () => ({
    projectId: 'project-1',
    dataMartId: 'data-mart-1',
    history: [
      {
        role: AiAssistantMessageRole.USER,
        content: 'Build SQL',
        createdAt: '2026-02-21T10:00:00.000Z',
      },
    ],
    sessionContext: {
      sessionId: 'session-1',
      scope: AiAssistantScope.TEMPLATE,
      templateId: 'template-1',
    },
  });

  const createPromptContext = (): AgentFlowPromptContext => ({
    recentTurns: [
      {
        role: AiAssistantMessageRole.USER,
        content: 'Build SQL',
        createdAt: '2026-02-21T10:00:00.000Z',
      },
    ],
    conversationSnapshot: null,
    stateSnapshot: {
      sessionId: 'session-1',
      templateId: 'template-1',
      sources: [],
      appliedActions: [],
      pendingActions: [],
      sqlRevisions: [],
    },
  });

  it('returns restricted response when policy sanitizer blocks request', async () => {
    const agent = {
      run: jest.fn().mockRejectedValue(new AgentFlowContentPolicyRestrictedError('safe text')),
    };
    const templatePlaceholderTagsRenderer = {
      render: jest.fn(),
    };
    const service = new AgentFlowService(agent as never, templatePlaceholderTagsRenderer as never);

    const response = await service.run(createRequest(), createPromptContext());

    expect(response.status).toBe('restricted');
    expect(response.decision).toBe('clarify');
    expect(response.meta.reasonDescription).toBe('Blocked by AI content filter.');
    expect(response.meta.sanitizedLastUserMessage).toBe('safe text');
  });

  it('propagates sanitized message from context on successful run', async () => {
    const agent = {
      run: jest.fn().mockResolvedValue({
        result: {
          decision: 'explain',
          explanation: 'done',
          reasonDescription: 'Handled as explain because user asked status.',
        },
        context: {
          request: createRequest(),
          telemetry: { llmCalls: [], toolCalls: [], messageHistory: [] },
          collectedProposedActions: [],
          sanitizedLastUserMessage: 'safe text',
        },
      }),
    };
    const templatePlaceholderTagsRenderer = {
      render: jest.fn(),
    };
    const service = new AgentFlowService(agent as never, templatePlaceholderTagsRenderer as never);

    const response = await service.run(createRequest(), createPromptContext());

    expect(response.status).toBe('ok');
    expect(response.meta.sanitizedLastUserMessage).toBe('safe text');
    expect(response.meta.reasonDescription).toBe('Handled as explain because user asked status.');
  });

  it('converts templateEditIntent into replace_template_document proposed action', async () => {
    const request = createRequest();
    const agent = {
      run: jest.fn().mockResolvedValue({
        result: {
          decision: 'edit_template',
          explanation: 'I prepared a full template rewrite proposal.',
          reasonDescription: 'Template edit requested.',
          templateEditIntent: {
            type: 'replace_template_document',
            text: '# Report\n\n[[TAG:t1]]',
            tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
          },
        },
        context: {
          request,
          telemetry: { llmCalls: [], toolCalls: [], messageHistory: [] },
          collectedProposedActions: [],
          sanitizedLastUserMessage: null,
        },
      }),
    };
    const templatePlaceholderTagsRenderer = {
      render: jest.fn().mockReturnValue({
        ok: true,
        value: {
          template: '# Report\n\n{{table source="main"}}',
          renderedTagsById: { t1: '{{table source="main"}}' },
        },
      }),
    };
    const service = new AgentFlowService(agent as never, templatePlaceholderTagsRenderer as never);

    const response = await service.run(request, createPromptContext());

    expect(response.status).toBe('ok');
    expect(response.decision).toBe('edit_template');
    expect(response.proposedActions).toHaveLength(1);
    expect(response.proposedActions?.[0].type).toBe('replace_template_document');
    if (response.proposedActions?.[0]?.type === 'replace_template_document') {
      expect(response.proposedActions[0].payload.text).toBe('# Report\n\n[[TAG:t1]]');
      expect(response.proposedActions[0].payload.suggestedTemplateEditDiffPreview).toBeUndefined();
    }
  });
});
