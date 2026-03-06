import { AssistantChatMessage } from './ai-assistant-types';

export interface TextConversationTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function getLastUserMessage<T extends TextConversationTurn>(history: T[]): string {
  const lastUser = [...history].reverse().find(message => message.role === 'user');
  return lastUser?.content ?? '';
}

export function replaceLastUserMessage(
  history: AssistantChatMessage[],
  content: string
): AssistantChatMessage[] {
  const historyCopy = [...history];
  for (let i = historyCopy.length - 1; i >= 0; i--) {
    if (historyCopy[i].role === 'user') {
      historyCopy[i] = { ...historyCopy[i], content };
      break;
    }
  }
  return historyCopy;
}
