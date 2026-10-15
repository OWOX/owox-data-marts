jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
jest.mock('../../utils/sync-owners', () => ({ syncOwners: jest.fn() }));

import { BadRequestException } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import { CreateCredentialService, normalizeAiConfiguration } from './create-credential.service';

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

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const googleDefinition = {
  definitionId: 'google-service-account',
  source: 'builtin',
  compatibilityLine: null,
  contract: {
    id: 'google-service-account',
    displayName: 'Google Service Account',
    description: '',
    origins: ['https://*.googleapis.com'],
    auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
  },
};

function setupCreate(state = 'verified', message = 'Google issued a token for this key') {
  const credentials = {
    create: jest.fn((value: object) => ({ id: 'credential-1', ...value })),
    save: jest.fn((value: object) => Promise.resolve(value)),
    getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'credential-1' }),
  };
  const validationProbe = {
    run: jest.fn().mockResolvedValue({ state, message, validatedAt: new Date() }),
  };
  const service = new CreateCredentialService(
    credentials as never,
    { get: jest.fn().mockResolvedValue(googleDefinition) } as never,
    { build: jest.fn().mockResolvedValue({ id: 'credential-1' }) } as never,
    validationProbe as never,
    { validateContextIds: jest.fn() } as never,
    {} as never,
    { create: jest.fn() } as never,
    { create: jest.fn(), save: jest.fn() } as never
  );
  const persist = jest.spyOn(
    service as unknown as { persist: (...args: unknown[]) => Promise<unknown> },
    'persist'
  );
  return { service, credentials, validationProbe, persist };
}

describe('CreateCredentialService with a Google service account key', () => {
  const input = (value: string) => ({
    title: 'Docs writer',
    definitionId: 'google-service-account',
    secret: { value },
  });

  it('asks Google before the write transaction and saves the public metadata', async () => {
    const state = setupCreate();

    await state.service.run(context, input(serviceAccountKey()));

    expect(state.validationProbe.run.mock.invocationCallOrder[0]).toBeLessThan(
      state.persist.mock.invocationCallOrder[0]
    );
    expect(state.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: {
          clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
          projectId: 'acme-docs',
          privateKeyId: 'key-1',
        },
      })
    );
  });

  it('saves nothing when Google rejects the key', async () => {
    const state = setupCreate('rejected', 'invalid_grant: Invalid JWT Signature.');

    await expect(state.service.run(context, input(serviceAccountKey()))).rejects.toThrow(
      new BadRequestException('invalid_grant: Invalid JWT Signature.')
    );
    expect(state.persist).not.toHaveBeenCalled();
    expect(state.credentials.save).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a key before asking Google', async () => {
    const state = setupCreate();

    await expect(state.service.run(context, input('{"type":'))).rejects.toThrow(
      new BadRequestException('The key is not valid JSON')
    );
    expect(state.validationProbe.run).not.toHaveBeenCalled();
  });
});
