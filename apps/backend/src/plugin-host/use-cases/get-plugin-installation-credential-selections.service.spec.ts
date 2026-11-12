import { NotFoundException } from '@nestjs/common';
import { AuthorizationContext } from '../../idp/types/auth.types';
import { GetPluginInstallationCredentialSelectionsCommand } from '../dto/domain/get-plugin-installation-credential-selections.command';
import { PluginInstallationService } from '../services/plugin-installation.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { GetPluginInstallationCredentialSelectionsService } from './get-plugin-installation-credential-selections.service';

const MEMBER = { projectId: 'j1', userId: 'u1' } as AuthorizationContext;

const installation = (overrides = {}) => ({
  id: 'i1',
  pluginId: 'p1',
  projectId: 'j1',
  userId: 'u1',
  uninstalledAt: null,
  ...overrides,
});

function setup(
  row: unknown = installation(),
  currentVersionId: string | null = 'v1',
  credentialRequirements: unknown[] = ['ai']
) {
  const installations = {
    findById: jest.fn().mockResolvedValue(row),
  } as unknown as jest.Mocked<PluginInstallationService>;
  const pluginService = {
    findById: jest.fn().mockResolvedValue({ id: 'p1', currentVersionId }),
  } as unknown as jest.Mocked<PluginService>;
  const versionService = {
    findById: jest.fn().mockResolvedValue({ id: 'v1', credentialRequirements }),
  } as unknown as jest.Mocked<PluginVersionService>;
  const credentialBindings = {
    listSelections: jest.fn().mockResolvedValue({ ai: 'credential-1' }),
  };

  return {
    service: new GetPluginInstallationCredentialSelectionsService(
      installations,
      pluginService,
      versionService,
      credentialBindings as never
    ),
    credentialBindings,
  };
}

const read = (service: GetPluginInstallationCredentialSelectionsService) =>
  service.run(new GetPluginInstallationCredentialSelectionsCommand('i1', MEMBER));

describe('GetPluginInstallationCredentialSelectionsService', () => {
  it("returns the grants of the caller's live installation against the current version", async () => {
    const state = setup();

    await expect(read(state.service)).resolves.toEqual({
      credentialSelections: { ai: 'credential-1' },
    });
    expect(state.credentialBindings.listSelections).toHaveBeenCalledWith({
      projectId: 'j1',
      consumerType: 'plugin-installation',
      consumerId: 'i1',
      requirements: ['ai'],
    });
  });

  it('asks for no requirements when the plugin has no current version', async () => {
    const state = setup(installation(), null);

    await read(state.service);

    expect(state.credentialBindings.listSelections).toHaveBeenCalledWith(
      expect.objectContaining({ requirements: [] })
    );
  });

  it('reports OWOX AI for the logical ai requirement of an installation that uses it', async () => {
    const state = setup(installation({ owoxAi: true }), 'v1', [
      'github',
      { id: 'ai', optional: true, models: ['fast'] },
    ]);
    state.credentialBindings.listSelections.mockResolvedValue({ github: 'credential-2' });

    await expect(read(state.service)).resolves.toEqual({
      credentialSelections: { github: 'credential-2', ai: 'owox-ai' },
    });
  });

  it('reports no OWOX AI when the current version declares no logical ai requirement', async () => {
    const state = setup(installation({ owoxAi: true }), 'v1', ['github']);
    state.credentialBindings.listSelections.mockResolvedValue({ github: 'credential-2' });

    await expect(read(state.service)).resolves.toEqual({
      credentialSelections: { github: 'credential-2' },
    });
  });

  it.each([
    ['missing', null],
    ["another member's", installation({ userId: 'u2' })],
    ["another project's", installation({ projectId: 'j2' })],
    ['an uninstalled', installation({ uninstalledAt: new Date('2026-07-02') })],
  ])('answers 404 for %s installation without reading grants', async (_case, row) => {
    const state = setup(row);

    await expect(read(state.service)).rejects.toThrow(NotFoundException);
    expect(state.credentialBindings.listSelections).not.toHaveBeenCalled();
  });
});
