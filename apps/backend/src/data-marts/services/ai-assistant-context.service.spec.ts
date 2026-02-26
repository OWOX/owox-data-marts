import { Repository } from 'typeorm';
import {
  AgentFlowConversationSnapshot,
  AgentFlowStateSnapshot,
} from '../ai-insights/agent-flow/types';
import { AiAssistantContext } from '../entities/ai-assistant-context.entity';
import { AiAssistantContextService } from './ai-assistant-context.service';

const createConversationSnapshot = (
  patch: Partial<AgentFlowConversationSnapshot> = {}
): AgentFlowConversationSnapshot => ({
  goal: 'Build monthly report',
  decisions: ['reuse source'],
  appliedChanges: ['loaded template'],
  openQuestions: [],
  importantFacts: [],
  lastUserIntent: 'show monthly credits',
  compressedTurns: 7,
  updatedAt: '2026-02-21T12:00:00.000Z',
  ...patch,
});

const createStateSnapshot = (
  patch: Partial<AgentFlowStateSnapshot> = {}
): AgentFlowStateSnapshot => ({
  sessionId: 'session-1',
  templateId: 'template-1',
  sources: [],
  appliedActions: [],
  pendingActions: [],
  sqlRevisions: [],
  ...patch,
});

describe('AiAssistantContextService', () => {
  const createService = () => {
    const repository = {
      findOne: jest.fn(),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(),
    } as unknown as Repository<AiAssistantContext>;

    return {
      service: new AiAssistantContextService(repository),
      repository,
    };
  };

  it('loads context by session id', async () => {
    const { service, repository } = createService();
    const context = { sessionId: 'session-1' } as AiAssistantContext;

    (repository.findOne as jest.Mock).mockResolvedValue(context);

    await expect(service.getBySessionId('session-1')).resolves.toBe(context);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { sessionId: 'session-1' } });
  });

  it('does not save when summary and snapshot are unchanged', async () => {
    const { service, repository } = createService();
    const conversationSnapshot = createConversationSnapshot();
    const stateSnapshot = createStateSnapshot();

    await service.saveIfChanged({
      sessionId: 'session-1',
      storedContext: {
        sessionId: 'session-1',
        conversationSnapshot,
        stateSnapshot,
        version: 2,
      } as AiAssistantContext,
      conversationSnapshot,
      stateSnapshot,
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('saves changed context with incremented version', async () => {
    const { service, repository } = createService();
    const conversationSnapshot = createConversationSnapshot({ goal: 'Updated goal' });
    const stateSnapshot = createStateSnapshot();

    await service.saveIfChanged({
      sessionId: 'session-1',
      storedContext: {
        sessionId: 'session-1',
        conversationSnapshot: createConversationSnapshot(),
        stateSnapshot,
        version: 2,
      } as AiAssistantContext,
      conversationSnapshot,
      stateSnapshot,
    });

    expect(repository.create).toHaveBeenCalledWith({
      sessionId: 'session-1',
      conversationSnapshot,
      stateSnapshot,
      version: 3,
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        version: 3,
      })
    );
  });
});
