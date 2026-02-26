import { AiRole } from '../../common/ai-insights/agent/ai-core';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiAssistantScope } from '../enums/ai-assistant-scope.enum';
import { AgentFlowPromptBuilder } from './agent-flow-prompt-builder.service';

describe('AgentFlowPromptBuilder', () => {
  it('builds initial messages with current user marker in recent turns', () => {
    const service = new AgentFlowPromptBuilder();

    const initialMessages = service.buildInitialMessages({
      request: {
        projectId: 'project-1',
        dataMartId: 'data-mart-1',
        history: [
          {
            role: AiAssistantMessageRole.USER,
            content: 'fallback user message',
            createdAt: '2026-02-20T10:00:00.000Z',
          },
        ],
        sessionContext: {
          sessionId: 'session-1',
          scope: AiAssistantScope.TEMPLATE,
          templateId: 'template-1',
        },
      },
      promptContext: {
        recentTurns: [
          {
            role: AiAssistantMessageRole.USER,
            content: 'hello',
            createdAt: '2026-02-20T10:01:00.000Z',
          },
          {
            role: AiAssistantMessageRole.ASSISTANT,
            content: 'Hi! How can I help?',
            createdAt: '2026-02-20T10:01:10.000Z',
          },
          {
            role: AiAssistantMessageRole.USER,
            content: 'show me monthly consumption',
            createdAt: '2026-02-20T10:01:20.000Z',
          },
        ],
        conversationSnapshot: {
          goal: 'Build monthly consumption source',
          decisions: ['matched template source'],
          appliedChanges: ['loaded template'],
          openQuestions: [],
          importantFacts: [],
          lastUserIntent: 'show me monthly consumption',
          compressedTurns: 4,
          updatedAt: '2026-02-20T10:01:10.000Z',
        },
        stateSnapshot: {
          sessionId: 'session-1',
          templateId: 'template-1',
          sources: [],
          appliedActions: [],
          pendingActions: [],
          sqlRevisions: [],
        },
      },
    });

    expect(initialMessages).toHaveLength(2);
    expect(initialMessages[0].role).toBe(AiRole.SYSTEM);
    expect(initialMessages[1].role).toBe(AiRole.USER);
    expect(initialMessages[0].content).toContain('Output format:');
    expect(initialMessages[0].content).toContain('JSON Schema for the final response object:');
    expect(initialMessages[0].content).toContain('templateEditIntent');
    expect(initialMessages[0].content).toContain('[[TAG:<id>]]');
    expect(initialMessages[0].content).toContain('Do NOT write raw template tags');
    expect(initialMessages[0].content).not.toContain('"const": "apply_template_text_patch"');
    expect(initialMessages[1].content).not.toContain('State snapshot:');
    expect(initialMessages[1].content).toContain('Conversation snapshot:');
    expect(initialMessages[1].content).toContain('Recent turns:');
    expect(initialMessages[1].content).toContain(
      '[Current user message]: show me monthly consumption'
    );
    expect(initialMessages[1].content).not.toContain('[3] user: show me monthly consumption');
    expect(initialMessages[1].content).toContain(
      'Your final message MUST be a valid JSON object matching the schema specification.'
    );
    expect(initialMessages[1].content).toContain(
      '"reasonDescription" must be an internal concise rationale.'
    );
  });
});
