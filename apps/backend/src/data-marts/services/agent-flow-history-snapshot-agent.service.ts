import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiMessage, AiRole } from '../../common/ai-insights/agent/ai-core';
import { AI_CHAT_PROVIDER } from '../../common/ai-insights/services/ai-chat-provider.token';
import { AiChatProvider } from '../../common/ai-insights/agent/ai-core';
import { buildJsonSchema } from '../../common/ai-insights/utils/build-json-schema-by-zod-schema';
import { AssistantChatMessage } from '../ai-insights/agent-flow/ai-assistant-types';
import {
  AgentFlowConversationSnapshot,
  AgentFlowConversationSnapshotContent,
  AgentFlowConversationSnapshotContentSchema,
} from '../ai-insights/agent-flow/types';

const historySnapshotResponseJsonSchema = JSON.stringify(
  buildJsonSchema(AgentFlowConversationSnapshotContentSchema),
  null,
  2
);

@Injectable()
export class AgentFlowHistorySnapshotAgent {
  private readonly logger = new Logger(AgentFlowHistorySnapshotAgent.name);

  constructor(@Inject(AI_CHAT_PROVIDER) private readonly aiProvider: AiChatProvider) {}

  async buildSnapshot(params: {
    existingSnapshot: AgentFlowConversationSnapshot | null;
    turnsToCompress: AssistantChatMessage[];
  }): Promise<AgentFlowConversationSnapshotContent> {
    if (params.turnsToCompress.length === 0) {
      return this.snapshotToContent(params.existingSnapshot);
    }

    const messages: AiMessage[] = [
      {
        role: AiRole.SYSTEM,
        content: [
          'You maintain a compact conversation snapshot for assistant context.',
          'Summarize only provided data, do not invent facts.',
          'Return ONLY a valid JSON object matching this schema:',
          historySnapshotResponseJsonSchema,
          'Rules:',
          '- keep entries concise and factual',
          '- preserve language of user turns when possible',
          '- do not include markdown or explanations outside JSON',
        ].join('\n'),
      },
      {
        role: AiRole.USER,
        content: this.buildSnapshotUserPrompt(params.existingSnapshot, params.turnsToCompress),
      },
    ];

    const response = await this.aiProvider.chat({
      messages,
      tools: [],
      toolMode: 'none',
      temperature: 0,
      maxTokens: 2000,
      responseFormat: { type: 'json_object' },
    });

    return this.parseResponse(response.message.content);
  }

  private buildSnapshotUserPrompt(
    existingSnapshot: AgentFlowConversationSnapshot | null,
    turnsToCompress: AssistantChatMessage[]
  ): string {
    const snapshotBlock = existingSnapshot
      ? JSON.stringify(this.snapshotToContent(existingSnapshot))
      : 'null';
    const turnsBlock = turnsToCompress
      .map((turn, index) => `[${index + 1}] ${turn.role}: ${turn.content}`)
      .join('\n');

    return [
      `Existing snapshot: ${snapshotBlock}`,
      `Turns to compress:\n${turnsBlock}`,
      'Return merged snapshot as JSON object.',
    ].join('\n\n');
  }

  private snapshotToContent(
    snapshot: AgentFlowConversationSnapshot | null
  ): AgentFlowConversationSnapshotContent {
    if (!snapshot) {
      return {
        goal: null,
        decisions: [],
        appliedChanges: [],
        openQuestions: [],
        importantFacts: [],
        lastUserIntent: null,
      };
    }

    return {
      goal: snapshot.goal,
      decisions: snapshot.decisions,
      appliedChanges: snapshot.appliedChanges,
      openQuestions: snapshot.openQuestions,
      importantFacts: snapshot.importantFacts,
      lastUserIntent: snapshot.lastUserIntent,
    };
  }

  private parseResponse(content?: string): AgentFlowConversationSnapshotContent {
    const parsed = this.safeJsonParse(content ?? '');
    const validated = AgentFlowConversationSnapshotContentSchema.safeParse(parsed);

    if (!validated.success) {
      this.logger.warn('History snapshot agent returned invalid schema payload');
      return this.snapshotToContent(null);
    }

    return validated.data;
  }

  private safeJsonParse(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
}
