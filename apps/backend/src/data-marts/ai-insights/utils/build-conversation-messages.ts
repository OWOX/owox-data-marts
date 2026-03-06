import { AiMessage, AiRole } from '../../../common/ai-insights/agent/ai-core';
import { ConversationTurn } from '../agent/types';

export function buildConversationMessages(turns: ConversationTurn[] | undefined): AiMessage[] {
  if (!turns || turns.length === 0) {
    return [];
  }

  const messages: AiMessage[] = [];
  for (const turn of turns) {
    const content = turn.content?.trim();
    if (!content) {
      continue;
    }

    if (turn.role === AiRole.SYSTEM) {
      messages.push({ role: AiRole.SYSTEM, content });
      continue;
    }

    if (turn.role === AiRole.ASSISTANT) {
      messages.push({ role: AiRole.ASSISTANT, content });
      continue;
    }

    messages.push({ role: AiRole.USER, content });
  }

  return messages;
}
