import { AiRole } from '../../common/ai-insights/agent/ai-core';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AgentFlowHistorySnapshotAgent } from './agent-flow-history-snapshot-agent.service';

describe('AgentFlowHistorySnapshotAgent', () => {
  const createService = () => {
    const aiProvider = {
      chat: jest.fn(),
    };

    return {
      service: new AgentFlowHistorySnapshotAgent(aiProvider as never),
      aiProvider,
    };
  };

  it('returns existing snapshot content when there are no turns to compress', async () => {
    const { service, aiProvider } = createService();

    const result = await service.buildSnapshot({
      existingSnapshot: {
        goal: 'Goal',
        decisions: ['Decision'],
        appliedChanges: ['Applied'],
        openQuestions: [],
        importantFacts: ['Fact'],
        lastUserIntent: 'Intent',
        compressedTurns: 5,
        updatedAt: '2026-02-21T12:00:00.000Z',
      },
      turnsToCompress: [],
    });

    expect(result).toEqual({
      goal: 'Goal',
      decisions: ['Decision'],
      appliedChanges: ['Applied'],
      openQuestions: [],
      importantFacts: ['Fact'],
      lastUserIntent: 'Intent',
    });
    expect(aiProvider.chat).not.toHaveBeenCalled();
  });

  it('builds snapshot content via LLM without post-normalization', async () => {
    const { service, aiProvider } = createService();

    aiProvider.chat.mockResolvedValue({
      message: {
        role: AiRole.ASSISTANT,
        content: JSON.stringify({
          goal: '  New goal  ',
          decisions: ['Decision 1', 'decision 1', ''],
          appliedChanges: ['Applied 1'],
          openQuestions: ['Question?'],
          importantFacts: ['Fact A'],
          lastUserIntent: '  Intent  ',
        }),
      },
      usage: {
        executionTime: 100,
        promptTokens: 10,
        completionTokens: 20,
        reasoningTokens: 0,
        totalTokens: 30,
      },
      finishReason: 'stop',
      model: 'test-model',
    });

    const result = await service.buildSnapshot({
      existingSnapshot: null,
      turnsToCompress: [
        {
          role: AiAssistantMessageRole.USER,
          content: 'message 1',
          createdAt: '2026-02-21T12:00:00.000Z',
        },
        {
          role: AiAssistantMessageRole.ASSISTANT,
          content: 'message 2',
          createdAt: '2026-02-21T12:00:05.000Z',
        },
      ],
    });

    expect(result).toEqual({
      goal: '  New goal  ',
      decisions: ['Decision 1', 'decision 1', ''],
      appliedChanges: ['Applied 1'],
      openQuestions: ['Question?'],
      importantFacts: ['Fact A'],
      lastUserIntent: '  Intent  ',
    });
    expect(aiProvider.chat).toHaveBeenCalledTimes(1);
    expect(aiProvider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: AiRole.SYSTEM,
            content: expect.stringContaining('"required"'),
          }),
        ]),
      })
    );
  });
});
