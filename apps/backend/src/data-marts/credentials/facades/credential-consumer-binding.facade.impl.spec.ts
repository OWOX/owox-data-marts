jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CredentialConsumerBindingFacadeImpl } from './credential-consumer-binding.facade.impl';
import { normalizeCredentialRequirement } from '../credential.types';

const credential = {
  id: 'credential-1',
  projectId: 'project-1',
  definitionId: 'github',
  acceptedCompatibilityLine: null,
  enabled: true,
  secret: { value: 'never-return-this' },
  aiModelMappings: null,
};

function setup() {
  const bindings = {
    find: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn(),
    create: jest.fn(value => ({ id: 'binding-1', ...value })),
    save: jest.fn().mockImplementation(value => Promise.resolve(value)),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const credentials = { findOneBy: jest.fn().mockResolvedValue(credential) };
  const definitions = {
    getForCredential: jest.fn().mockResolvedValue({
      definitionId: 'github',
      source: 'builtin',
      compatibilityLine: null,
      contract: {
        id: 'github',
        displayName: 'GitHub',
        description: '',
        auth: { type: 'header', label: 'API key', headerName: 'authorization', prefix: 'Bearer ' },
        origins: ['https://api.github.com'],
      },
    }),
  };
  const access = { canAccess: jest.fn().mockResolvedValue(true) };
  const credentialService = {
    lockActiveByIdAndProjectId: jest.fn().mockResolvedValue(credential),
    markLastUsed: jest.fn().mockResolvedValue(undefined),
  };
  return {
    facade: new CredentialConsumerBindingFacadeImpl(
      bindings as never,
      credentials as never,
      definitions as never,
      access as never,
      credentialService as never
    ),
    bindings,
    credentials,
    definitions,
    access,
    credentialService,
  };
}

const request = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['viewer'],
  consumerType: 'plugin-installation' as const,
  consumerId: 'installation-1',
  requirements: ['github'],
  selections: { github: 'credential-1' },
};

describe('CredentialConsumerBindingFacadeImpl', () => {
  it('normalizes shorthand ai to the logical fast model contract', () => {
    expect(normalizeCredentialRequirement('ai')).toEqual({
      key: 'ai',
      definitionId: null,
      optional: false,
      models: ['fast'],
    });
  });
  it('validates all requirements before saving an active project-owned binding', async () => {
    const state = setup();

    await state.facade.replaceBindings(request);

    expect(state.bindings.save).toHaveBeenCalledWith([
      expect.objectContaining({
        credentialId: 'credential-1',
        requirementKey: 'github',
        configuredById: 'member-1',
        active: true,
      }),
    ]);
    expect(state.credentialService.lockActiveByIdAndProjectId).toHaveBeenCalledWith(
      'credential-1',
      'project-1'
    );
  });

  it('refuses to bind a Credential deleted before the binding lock is acquired', async () => {
    const state = setup();
    state.credentialService.lockActiveByIdAndProjectId.mockResolvedValue(null);

    await expect(state.facade.replaceBindings(request)).rejects.toBeInstanceOf(BadRequestException);
    expect(state.bindings.save).not.toHaveBeenCalled();
  });

  it('rejects an incomplete required selection atomically', async () => {
    const state = setup();
    await expect(
      state.facade.replaceBindings({ ...request, selections: {} })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.bindings.save).not.toHaveBeenCalled();
  });

  it('requires an explicit skip for optional requirements and rejects undeclared selections', async () => {
    const state = setup();
    const optionalRequest = {
      ...request,
      requirements: [{ id: 'openai', optional: true }],
      selections: {},
    };

    await expect(state.facade.replaceBindings(optionalRequest)).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      state.facade.replaceBindings({ ...optionalRequest, selections: { openai: null } })
    ).resolves.toBeUndefined();
    await expect(
      state.facade.replaceBindings({
        ...optionalRequest,
        selections: { openai: null, github: 'credential-1' },
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechecks USE permission every time runtime resolves a binding', async () => {
    const state = setup();
    state.bindings.findOneBy.mockResolvedValue({
      credentialId: 'credential-1',
      requirementKey: 'github',
      requirementSnapshot: {
        key: 'github',
        definitionId: 'github',
        optional: false,
        models: [],
      },
      active: true,
    });
    state.access.canAccess.mockResolvedValue(false);

    await expect(
      state.facade.resolveBinding({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['viewer'],
        consumerType: 'plugin-installation',
        consumerId: 'installation-1',
        requirement: 'github',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['disabled', new ForbiddenException('disabled')],
    ['access-revoked', new ForbiddenException('access revoked')],
    ['consent-pending', new ConflictException('consent pending')],
  ])('omits an optional handle when its Credential is %s', async (_state, failure) => {
    const state = setup();
    state.bindings.findOneBy.mockResolvedValue({
      credentialId: 'credential-1',
      requirementKey: 'github',
      requirementSnapshot: {
        key: 'github',
        definitionId: 'github',
        optional: true,
        models: [],
      },
      active: true,
    });
    jest.spyOn(state.facade, 'resolveBinding').mockRejectedValue(failure);

    await expect(
      state.facade.assertConsumerReady({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['viewer'],
        consumerType: 'plugin-installation',
        consumerId: 'installation-1',
        requirements: [{ id: 'github', optional: true }],
      })
    ).resolves.toEqual([]);
  });

  it('requires setup when an overridden AI model disappears from the catalog', async () => {
    const state = setup();
    state.bindings.findOneBy.mockResolvedValue({
      credentialId: 'credential-1',
      requirementKey: 'ai',
      requirementSnapshot: {
        key: 'ai',
        definitionId: null,
        optional: false,
        models: ['fast'],
      },
      active: true,
    });
    state.credentials.findOneBy.mockResolvedValue({
      ...credential,
      definitionId: 'openai',
      aiModelMappings: { fast: 'removed-model' },
      aiModelMappingModes: { fast: 'override' },
      aiModelMappingSources: { fast: 'catalog' },
    });
    state.definitions.getForCredential.mockResolvedValue({
      definitionId: 'openai',
      source: 'builtin',
      compatibilityLine: null,
      contract: {
        id: 'openai',
        displayName: 'OpenAI',
        description: '',
        auth: { type: 'header', label: 'API key', headerName: 'authorization' },
        origins: ['https://api.openai.com'],
        ai: {
          adapter: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          models: {
            language: [{ id: 'current-model', name: 'Current model' }],
            embedding: [],
          },
          recommended: { fast: 'current-model', reasoning: 'current-model' },
        },
      },
    });

    await expect(
      state.facade.assertConsumerReady({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['viewer'],
        consumerType: 'plugin-installation',
        consumerId: 'installation-1',
        requirements: [{ id: 'ai', optional: false, models: ['fast'] }],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps an advanced manual AI model usable outside the catalog', async () => {
    const state = setup();
    state.bindings.findOneBy.mockResolvedValue({
      credentialId: 'credential-1',
      requirementKey: 'ai',
      requirementSnapshot: {
        key: 'ai',
        definitionId: null,
        optional: false,
        models: ['fast'],
      },
      active: true,
    });
    state.credentials.findOneBy.mockResolvedValue({
      ...credential,
      definitionId: 'openai',
      aiModelMappings: { fast: 'advanced-preview-model' },
      aiModelMappingModes: { fast: 'override' },
      aiModelMappingSources: { fast: 'manual' },
    });
    state.definitions.getForCredential.mockResolvedValue({
      definitionId: 'openai',
      source: 'builtin',
      compatibilityLine: null,
      contract: {
        id: 'openai',
        displayName: 'OpenAI',
        description: '',
        auth: { type: 'header', label: 'API key', headerName: 'authorization' },
        origins: ['https://api.openai.com'],
        ai: {
          adapter: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          models: {
            language: [{ id: 'current-model', name: 'Current model' }],
            embedding: [],
          },
          recommended: { fast: 'current-model', reasoning: 'current-model' },
        },
      },
    });

    await expect(
      state.facade.assertConsumerReady({
        projectId: 'project-1',
        userId: 'member-1',
        roles: ['viewer'],
        consumerType: 'plugin-installation',
        consumerId: 'installation-1',
        requirements: [{ id: 'ai', optional: false, models: ['fast'] }],
      })
    ).resolves.toHaveLength(1);
  });

  it('deactivates removed or structurally changed requirements without touching stable bindings', async () => {
    const state = setup();
    const stable = {
      id: 'stable',
      requirementKey: 'github',
      requirementSnapshot: normalizeCredentialRequirement('github'),
      requirementRevision: 'stable-revision',
      active: true,
    };
    const removed = {
      id: 'removed',
      requirementKey: 'openai',
      requirementSnapshot: normalizeCredentialRequirement('openai'),
      requirementRevision: 'removed-revision',
      active: true,
    };
    const changed = {
      id: 'changed',
      requirementKey: 'ai',
      requirementSnapshot: normalizeCredentialRequirement('ai'),
      requirementRevision: 'changed-revision',
      active: true,
    };
    state.bindings.find.mockResolvedValue([stable, removed, changed]);

    await state.facade.reconcileBindings({
      consumerType: 'plugin-installation',
      consumerIds: ['installation-1'],
      requirements: ['github', { id: 'ai', optional: false, models: ['fast', 'reasoning'] }],
    });

    expect(stable.active).toBe(true);
    expect(state.bindings.update).toHaveBeenCalledTimes(2);
    expect(state.bindings.update).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, requirementRevision: 'removed-revision' }),
      { active: false }
    );
    expect(state.bindings.update).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, requirementRevision: 'changed-revision' }),
      { active: false }
    );
  });
});
