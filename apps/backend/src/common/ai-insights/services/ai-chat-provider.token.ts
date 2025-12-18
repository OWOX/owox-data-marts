import { z } from 'zod';

export enum AiProviderName {
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
}

export const AI_CHAT_PROVIDER = Symbol('AI_CHAT_PROVIDER');

export const AI_PROVIDER_ENV = 'AI_PROVIDER' as const;

export const AiProviderNameSchema = z.nativeEnum(AiProviderName);

export const DEFAULT_AI_PROVIDER = AiProviderName.OPENAI;

export function normalizeAiProviderName(raw: unknown): AiProviderName {
  const parsed = AiProviderNameSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_AI_PROVIDER;
}
