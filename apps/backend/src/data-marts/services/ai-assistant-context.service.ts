import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentFlowConversationSnapshot,
  AgentFlowStateSnapshot,
} from '../ai-insights/agent-flow/types';
import { AiAssistantContext } from '../entities/ai-assistant-context.entity';

@Injectable()
export class AiAssistantContextService {
  constructor(
    @InjectRepository(AiAssistantContext)
    private readonly repository: Repository<AiAssistantContext>
  ) {}

  async getBySessionId(sessionId: string): Promise<AiAssistantContext | null> {
    return this.repository.findOne({ where: { sessionId } });
  }

  async saveIfChanged(params: {
    sessionId: string;
    storedContext: AiAssistantContext | null;
    conversationSnapshot: AgentFlowConversationSnapshot | null;
    stateSnapshot: AgentFlowStateSnapshot;
  }): Promise<void> {
    const previousSummary = params.storedContext?.conversationSnapshot ?? null;
    const previousSnapshot = params.storedContext?.stateSnapshot ?? null;

    if (
      JSON.stringify(previousSummary) === JSON.stringify(params.conversationSnapshot) &&
      JSON.stringify(previousSnapshot) === JSON.stringify(params.stateSnapshot)
    ) {
      return;
    }

    await this.repository.save(
      this.repository.create({
        sessionId: params.sessionId,
        conversationSnapshot: params.conversationSnapshot,
        stateSnapshot: params.stateSnapshot,
        version: (params.storedContext?.version ?? 0) + 1,
      })
    );
  }
}
