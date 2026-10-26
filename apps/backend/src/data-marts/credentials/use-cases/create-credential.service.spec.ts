jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import { BUILTIN_CREDENTIAL_DEFINITIONS } from '../services/builtin-credential-definitions';
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
    displayName: 'BigQuery Service Account',
    description: '',
    origins: ['https://*.googleapis.com'],
    auth: { type: 'google-service-account', label: 'Service account key (JSON)' },
  },
};

function setupCreate(
  state = 'verified',
  message = 'Google issued a token for this key',
  definition: object = googleDefinition
) {
  const credentials = {
    createWithAccess: jest.fn((value: object) => Promise.resolve({ id: 'credential-1', ...value })),
    getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'credential-1' }),
  };
  const validationProbe = {
    run: jest.fn().mockResolvedValue({ state, message, validatedAt: new Date() }),
  };
  const service = new CreateCredentialService(
    credentials as never,
    { get: jest.fn().mockResolvedValue(definition) } as never,
    { build: jest.fn().mockResolvedValue({ id: 'credential-1' }) } as never,
    validationProbe as never
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
    expect(state.credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: {
          clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
          projectId: 'acme-docs',
          privateKeyId: 'key-1',
        },
      }),
      { createdBy: context, ownerIds: [], contextIds: [] }
    );
  });

  it('saves nothing when Google rejects the key', async () => {
    const state = setupCreate('rejected', 'invalid_grant: Invalid JWT Signature.');

    await expect(state.service.run(context, input(serviceAccountKey()))).rejects.toThrow(
      new BadRequestException('invalid_grant: Invalid JWT Signature.')
    );
    expect(state.persist).not.toHaveBeenCalled();
    expect(state.credentials.createWithAccess).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a key before asking Google', async () => {
    const state = setupCreate();

    await expect(state.service.run(context, input('{"type":'))).rejects.toThrow(
      new BadRequestException('The key is not valid JSON')
    );
    expect(state.validationProbe.run).not.toHaveBeenCalled();
  });
});

function builtin(id: string) {
  const contract = BUILTIN_CREDENTIAL_DEFINITIONS.find(definition => definition.id === id);
  return { definitionId: id, source: 'builtin', compatibilityLine: null, contract };
}

const headerDefinition = builtin('github');

describe('CreateCredentialService with a field set', () => {
  const aws = builtin('aws-access-key');
  const fields = {
    accessKeyId: 'key-id-1',
    secretAccessKey: 'secret-access-key-1',
    sessionToken: 'session-token-1',
  };

  it('stores secret fields only in the secret, unknown, without a provider check', async () => {
    const state = setupCreate('verified', 'accepted', aws);

    await state.service.run(context, { title: ' AWS ', definitionId: aws.definitionId, fields });

    expect(state.validationProbe.run).not.toHaveBeenCalled();
    expect(state.credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'AWS',
        secret: {
          fields: { secretAccessKey: 'secret-access-key-1', sessionToken: 'session-token-1' },
        },
        publicMetadata: { fields: { accessKeyId: 'key-id-1' } },
        validationState: 'unknown',
        validationMessage: null,
        validatedAt: null,
      }),
      expect.anything()
    );
  });

  it('refuses a secret value for a field set', async () => {
    const state = setupCreate('verified', 'accepted', aws);

    await expect(
      state.service.run(context, {
        title: 'AWS',
        definitionId: aws.definitionId,
        secret: { value: 'secret-access-key-1' },
        fields,
      })
    ).rejects.toThrow(BadRequestException);
    expect(state.credentials.createWithAccess).not.toHaveBeenCalled();
  });

  it('refuses fields for a header definition', async () => {
    const state = setupCreate('verified', 'accepted', headerDefinition);

    await expect(
      state.service.run(context, {
        title: 'GitHub',
        definitionId: headerDefinition.definitionId,
        secret: { value: 'provider-secret' },
        fields: { token: 'provider-secret' },
      })
    ).rejects.toThrow(BadRequestException);
    expect(state.validationProbe.run).not.toHaveBeenCalled();
    expect(state.credentials.createWithAccess).not.toHaveBeenCalled();
  });

  it('refuses a header definition without a secret value', async () => {
    const state = setupCreate('verified', 'accepted', headerDefinition);

    await expect(
      state.service.run(context, { title: 'GitHub', definitionId: headerDefinition.definitionId })
    ).rejects.toThrow(BadRequestException);
    expect(state.credentials.createWithAccess).not.toHaveBeenCalled();
  });

  it('sends an OAuth definition to the Google connection instead', async () => {
    const state = setupCreate('verified', 'accepted', builtin('google-oauth'));

    await expect(
      state.service.run(context, {
        title: 'Google',
        definitionId: 'google-oauth',
        secret: { value: 'token' },
      })
    ).rejects.toThrow(
      new BadRequestException('Connect a Google account to create this Credential.')
    );
    expect(state.credentials.createWithAccess).not.toHaveBeenCalled();
  });
});

describe('CreateCredentialService ownership', () => {
  it('shares a new Credential for use by default and passes the chosen owners and Contexts', async () => {
    const state = setupCreate('verified', 'accepted', headerDefinition);

    await state.service.run(context, {
      title: 'GitHub',
      definitionId: headerDefinition.definitionId,
      secret: { value: 'provider-secret' },
      ownerIds: ['member-2'],
      contextIds: ['ctx-1'],
    });

    expect(state.credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({ availableForUse: true, availableForMaintenance: false }),
      { createdBy: context, ownerIds: ['member-2'], contextIds: ['ctx-1'] }
    );
  });
});
