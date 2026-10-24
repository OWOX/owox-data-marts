jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { normalizeCredentialRequirement } from '../../data-marts/credentials/credential.types';
import { CredentialConsumerBindingFacadeImpl } from '../../data-marts/credentials/facades/credential-consumer-binding.facade.impl';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { GetCurrentPluginActionExecutionService } from './get-current-plugin-action-execution.service';

const CONTEXT: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'user-1',
  roles: ['editor'],
  authFlow: 'plugin',
  pluginId: 'plugin-1',
  installationId: 'installation-1',
  executionId: 'execution-1',
};

// The real readiness service, with every requirement bound to a Credential, usable unless disabled.
function setup(credentialRequirements: string[], disabled: string[] = []) {
  const bindings = {
    findOneBy: jest.fn(({ requirementKey }: { requirementKey: string }) =>
      Promise.resolve({
        credentialId: `credential-${requirementKey}`,
        requirementSnapshot: normalizeCredentialRequirement(requirementKey),
      })
    ),
  };
  const credentials = {
    findOneBy: jest.fn(({ id }: { id: string }) =>
      Promise.resolve({
        id,
        enabled: !disabled.includes(id),
        definitionId: id === 'credential-ai' ? 'openai' : 'github',
        secret: { value: 'secret' },
        aiModelMappings: { fast: 'model-1' },
        aiModelMappingModes: null,
        aiModelMappingSources: null,
      })
    ),
  };
  const definitions = {
    getForCredential: jest.fn((credential: { id: string }) =>
      Promise.resolve({ contract: credential.id === 'credential-ai' ? { ai: {} } : {} })
    ),
  };
  const access = { canAccess: jest.fn().mockResolvedValue(true) };
  const facade = new CredentialConsumerBindingFacadeImpl(
    bindings as never,
    credentials as never,
    definitions as never,
    access as never,
    {} as never
  );
  const service = new GetCurrentPluginActionExecutionService(
    {
      findWithInput: jest.fn().mockResolvedValue({
        id: 'execution-1',
        pluginId: 'plugin-1',
        pluginVersionId: 'version-1',
        installationId: 'installation-1',
        projectId: 'project-1',
        userId: 'user-1',
        action: 'run',
        input: null,
        trigger: 'frontend',
        deadlineAt: new Date('2026-10-14T12:01:00.000Z'),
      }),
    } as never,
    { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
    {
      findById: jest.fn().mockResolvedValue({
        id: 'version-1',
        semver: '1.0.0',
        credentialRequirements,
      }),
    } as never,
    facade
  );
  return { service, bindings };
}

describe('GetCurrentPluginActionExecutionService with the real consumer readiness', () => {
  it('lists both the exact and the AI handle of a plugin that requires both', async () => {
    const { service } = setup(['github', 'ai']);

    const current = await service.run({ context: CONTEXT, aiCredentials: true });

    expect(current.credentialHandles).toEqual([
      { name: 'github', kind: 'exact' },
      { name: 'ai', kind: 'ai', models: ['fast'] },
    ]);
  });

  it('leaves a disabled AI Credential out and keeps the exact handle', async () => {
    const { service } = setup(['github', 'ai'], ['credential-ai']);

    const current = await service.run({ context: CONTEXT, aiCredentials: true });

    expect(current.credentialHandles).toEqual([{ name: 'github', kind: 'exact' }]);
  });

  it('gives an SDK without AI support its exact handle, whatever the AI Credential state', async () => {
    const { service, bindings } = setup(['github', 'ai'], ['credential-ai']);

    const current = await service.run({ context: CONTEXT });

    expect(current.credentialHandles).toEqual([{ name: 'github', kind: 'exact' }]);
    expect(bindings.findOneBy).not.toHaveBeenCalledWith(
      expect.objectContaining({ requirementKey: 'ai' })
    );
  });
});
