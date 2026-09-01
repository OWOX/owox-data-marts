import { NotFoundException } from '@nestjs/common';

jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  RequirePluginAuth: () => () => undefined,
}));

import type { AuthorizationContext } from '../../idp';
import { PluginCredentialRuntimeController } from './plugin-credential-runtime.controller';

const context = {
  projectId: 'project-1',
  userId: 'user-1',
  roles: [],
  pluginId: 'plugin-1',
  installationId: 'installation-1',
} as unknown as AuthorizationContext;

function setup(requirements: unknown[]) {
  return new PluginCredentialRuntimeController(
    { findById: jest.fn().mockResolvedValue({ currentVersionId: 'version-1' }) } as never,
    { findById: jest.fn().mockResolvedValue({ credentialRequirements: requirements }) } as never,
    {} as never,
    {} as never,
    { resolveBinding: jest.fn() } as never
  );
}

describe('PluginCredentialRuntimeController capability boundaries', () => {
  it('does not expose asFetch for a logical AI requirement', async () => {
    const controller = setup([{ id: 'ai', optional: false, models: ['fast'] }]);

    await expect(controller.fetch('ai', {} as never, context, {} as never)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('does not expose AI SDK operations for an exact requirement', async () => {
    const controller = setup(['github']);

    await expect(
      controller.generate(
        'github',
        { version: 1, model: 'fast', options: {} },
        context,
        {} as never
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
