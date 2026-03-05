import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import { ConversationTurn } from '../agent/types';
import { buildConversationMessages } from './build-conversation-messages';

export interface BuildAgentInitialMessagesInput {
  systemPrompt: string;
  contextSystemPrompt?: string | null;
  conversationTurns?: ConversationTurn[];
  userPrompt: string;
}

export function buildAgentInitialMessages(input: BuildAgentInitialMessagesInput): AiMessage[] {
  const messages: AiMessage[] = [{ role: AiRole.SYSTEM, content: input.systemPrompt }];

  if (input.contextSystemPrompt && input.contextSystemPrompt.trim().length > 0) {
    messages.push({ role: AiRole.SYSTEM, content: input.contextSystemPrompt });
  }

  messages.push(...buildConversationMessages(input.conversationTurns));
  messages.push({ role: AiRole.USER, content: input.userPrompt });

  return messages;
}
