import { BadRequestException } from '@nestjs/common';
import { normalizeAiConfiguration } from './create-credential.service';

describe('normalizeAiConfiguration', () => {
  const ai = {
    adapter: 'openai' as const,
    baseUrl: 'https://api.openai.com/v1',
    models: {
      language: [
        { id: 'recommended-fast', name: 'Recommended Fast' },
        { id: 'recommended-reasoning', name: 'Recommended Reasoning' },
        { id: 'custom-fast', name: 'Custom Fast' },
      ],
      embedding: [],
    },
    recommended: {
      fast: 'recommended-fast',
      reasoning: 'recommended-reasoning',
    },
  };

  it('keeps an omitted AI configuration empty for a non-AI Credential definition', () => {
    expect(normalizeAiConfiguration(undefined, undefined, undefined)).toEqual({
      mappings: null,
      modes: null,
      sources: null,
    });
  });

  it('keeps an explicitly empty AI configuration empty for a non-AI Credential definition', () => {
    expect(normalizeAiConfiguration({}, {}, undefined)).toEqual({
      mappings: null,
      modes: null,
      sources: null,
    });
  });

  it('rejects model mappings for a non-AI Credential definition', () => {
    expect(() =>
      normalizeAiConfiguration({ fast: 'provider-model' }, { fast: 'override' }, undefined)
    ).toThrow(BadRequestException);
  });

  it('treats a mappings-only update as an override and preserves other mappings', () => {
    expect(
      normalizeAiConfiguration({ fast: 'custom-fast' }, undefined, ai, {
        mappings: { fast: 'recommended-fast', reasoning: 'recommended-reasoning' },
        modes: { fast: 'recommended', reasoning: 'recommended' },
        sources: { fast: 'catalog', reasoning: 'catalog' },
      })
    ).toEqual({
      mappings: { fast: 'custom-fast', reasoning: 'recommended-reasoning' },
      modes: { fast: 'override', reasoning: 'recommended' },
      sources: { fast: 'catalog', reasoning: 'catalog' },
    });
  });

  it('distinguishes catalog overrides from advanced manual model ids', () => {
    expect(
      normalizeAiConfiguration(
        { fast: 'custom-fast', reasoning: 'advanced-preview-model' },
        { fast: 'override', reasoning: 'override' },
        ai
      )
    ).toEqual({
      mappings: { fast: 'custom-fast', reasoning: 'advanced-preview-model' },
      modes: { fast: 'override', reasoning: 'override' },
      sources: { fast: 'catalog', reasoning: 'manual' },
    });
  });
});
