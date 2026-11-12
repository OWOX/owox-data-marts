import type { ConfigService } from '@nestjs/config';
import {
  buildOpenRouterProviderConfig,
  buildOpenRouterProviderSpecificFields,
  parseOpenRouterCommaSeparatedConfig,
  readOpenRouterRoutingOptions,
} from './openrouter-routing';

describe('openrouter routing helpers', () => {
  it('builds provider routing with only and order in the configured priority order', () => {
    const provider = buildOpenRouterProviderConfig({
      allowedProviders: ['google-vertex', 'azure'],
      dataCollection: 'deny',
      zdr: true,
    });

    expect(provider).toEqual({
      require_parameters: true,
      only: ['google-vertex', 'azure'],
      order: ['google-vertex', 'azure'],
      data_collection: 'deny',
      zdr: true,
    });
  });

  it('keeps provider privacy fields when allowed providers are not configured', () => {
    const provider = buildOpenRouterProviderConfig({
      allowedProviders: null,
      dataCollection: 'deny',
      zdr: true,
    });

    expect(provider).toEqual({
      require_parameters: true,
      data_collection: 'deny',
      zdr: true,
    });
  });

  it('adds chat model fallbacks only when fallback models are configured', () => {
    const fields = buildOpenRouterProviderSpecificFields({
      allowedProviders: ['google-vertex'],
      fallbackModels: ['model-b', 'model-c'],
      dataCollection: 'allow',
      zdr: false,
    });

    expect(fields).toEqual({
      provider: {
        require_parameters: true,
        only: ['google-vertex'],
        order: ['google-vertex'],
        data_collection: 'allow',
        zdr: false,
      },
      models: ['model-b', 'model-c'],
    });
  });

  it('parses comma-separated provider lists like the common OpenRouter provider', () => {
    const parsed = parseOpenRouterCommaSeparatedConfig(' Google-Vertex, azure, google-vertex ', {
      toLowerCase: true,
    });

    expect(parsed ? Array.from(parsed) : null).toEqual(['google-vertex', 'azure']);
  });
});

describe('readOpenRouterRoutingOptions', () => {
  const read = (env: Record<string, string>) =>
    readOpenRouterRoutingOptions({
      get: (key: string) => env[key],
    } as unknown as ConfigService);

  it.each([
    [{}],
    [{ AI_ZDR: '', AI_DATA_COLLECTION: '' }],
    [{ AI_ZDR: '  ', AI_DATA_COLLECTION: '  ' }],
  ])('uses the defaults for %p', env => {
    expect(read(env)).toEqual({ allowedProviders: null, dataCollection: 'deny', zdr: true });
  });

  it('reads set values', () => {
    expect(
      read({ AI_ZDR: ' False ', AI_DATA_COLLECTION: 'allow', AI_ALLOWED_PROVIDERS: 'A, b' })
    ).toEqual({ allowedProviders: new Set(['a', 'b']), dataCollection: 'allow', zdr: false });
  });
});
