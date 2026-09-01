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

  it('accepts null only for a non-AI Credential definition', () => {
    expect(normalizeAiConfiguration(null, null, undefined)).toEqual({
      mappings: null,
      modes: null,
      sources: null,
    });
    expect(() => normalizeAiConfiguration(null, null, ai)).toThrow(
      'AI Credentials require fast and reasoning model mappings'
    );
  });

  it('requires exact fast and reasoning keys for AI Credentials', () => {
    expect(() =>
      normalizeAiConfiguration({ fast: 'recommended-fast' }, { fast: 'recommended' }, ai)
    ).toThrow('AI model mapping reasoning is required');
    expect(() =>
      normalizeAiConfiguration(
        {
          fast: 'recommended-fast',
          reasoning: 'recommended-reasoning',
          experimental: 'preview-model',
        },
        undefined,
        ai
      )
    ).toThrow('Unsupported AI model mapping experimental');
  });

  it('rejects a catalog model used for the wrong model kind', () => {
    const aiWithEmbedding = {
      ...ai,
      models: {
        ...ai.models,
        embedding: [{ id: 'embedding-model', name: 'Embedding Model' }],
      },
    };

    expect(() =>
      normalizeAiConfiguration(
        { fast: 'embedding-model', reasoning: 'recommended-reasoning' },
        { fast: 'override', reasoning: 'recommended' },
        aiWithEmbedding
      )
    ).toThrow('is not compatible with the fast mapping');
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
