import { AiProviderName, normalizeAiProviderName } from './ai-chat-provider.token';

describe('normalizeAiProviderName', () => {
  it.each([
    ['openrouter', AiProviderName.OPENROUTER],
    [' OpenRouter ', AiProviderName.OPENROUTER],
    ['OPENAI', AiProviderName.OPENAI],
    ['unknown', AiProviderName.OPENAI],
    ['', AiProviderName.OPENAI],
    [undefined, AiProviderName.OPENAI],
  ])('maps %p to %s', (raw, expected) => {
    expect(normalizeAiProviderName(raw)).toBe(expected);
  });
});
