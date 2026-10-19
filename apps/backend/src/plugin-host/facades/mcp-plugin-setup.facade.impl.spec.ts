import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import { GetPluginDetailsService } from '../use-cases/get-plugin-details.service';
import { GetPluginGalleryService } from '../use-cases/get-plugin-gallery.service';
import { ListInstallationsService } from '../use-cases/list-installations.service';
import { McpPluginSetupMapper } from '../mappers/mcp-plugin-setup.mapper';
import { McpPluginSetupFacadeImpl } from './mcp-plugin-setup.facade.impl';

const actor = { projectId: 'project/1', userId: 'member-1', roles: ['editor' as const] };
const pluginId = '243dab94-bd94-4f5d-9447-7337bf04b477';

function pluginSetupFixture() {
  const plugin = {
    id: pluginId,
    repoOwner: 'Owner',
    repoName: 'private-repo',
    isPrivateRepo: true,
    currentVersionId: 'version-1',
    suspendedAt: null as Date | null,
    createdAt: new Date('2026-01-01'),
    nextUpdateCheckAt: null,
  };
  const version = {
    id: 'version-1',
    semver: '1.0.0',
    displayName: 'Useful Plugin',
    description: 'A plugin',
    deliveryUrl: 'https://private.example/?secret=never-return',
    commitSha: 'private-commit',
    credentialRequirements: ['github'],
    collections: [{ secret: 'never-return' }],
    backend: null,
  };
  const ownInstallation = {
    id: 'own-installation',
    pluginId,
    projectId: actor.projectId,
    userId: actor.userId,
    installedAt: new Date('2026-01-02'),
    uninstalledAt: null as Date | null,
  };
  const rows = [
    ownInstallation,
    {
      ...ownInstallation,
      id: 'foreign-installation',
      projectId: 'another-project',
      userId: 'other',
    },
  ];
  // Keep the real domain view services: these scoped reads must not regress to global lookups.
  const installations = {
    findOne: jest.fn(
      async (id: string, projectId: string, userId: string) =>
        rows.find(
          row => row.pluginId === id && row.projectId === projectId && row.userId === userId
        ) ?? null
    ),
    findByMember: jest.fn(async (projectId: string, userId: string) =>
      rows.filter(row => row.projectId === projectId && row.userId === userId)
    ),
  };
  const plugins = {
    findById: jest.fn(async (id: string) => (id === pluginId ? plugin : null)),
    findByIds: jest.fn(async (ids: string[]) => (ids.includes(pluginId) ? [plugin] : [])),
  };
  const versions = {
    findById: jest.fn(async () => version),
    findByIds: jest.fn(async () => [version]),
  };
  const publications = {
    findVisibleTo: jest.fn(async () => []),
  };
  const viewMapper = new PluginPresentationMapper();
  const gallery = new GetPluginGalleryService(
    publications as never,
    installations as never,
    plugins as never,
    versions as never,
    viewMapper
  );
  const details = new GetPluginDetailsService(
    plugins as never,
    versions as never,
    publications as never,
    installations as never,
    viewMapper
  );
  const history = new ListInstallationsService(
    installations as never,
    plugins as never,
    versions as never,
    viewMapper,
    publications as never
  );
  const bindings = {
    inspectConsumerReadiness: jest.fn(async () => ({
      configured: true,
      providerValidity: 'unknown',
      requirements: [{ key: 'github', optional: false, state: 'configured' }],
    })),
  };
  const updates = {
    run: jest.fn(async () => ({
      pluginId,
      currentVersionId: 'version-2',
      currentSemver: '2.0.0',
      outcome: 'updated',
      nextCheckAt: null,
      diagnostics: { deliveryUrl: 'never-return' },
    })),
  };
  const mapper = new McpPluginSetupMapper(
    new PublicOriginService(
      new ConfigService({
        PUBLIC_ORIGIN: 'https://self-host.test',
      })
    )
  );
  const facade = new McpPluginSetupFacadeImpl(
    gallery,
    details,
    history,
    installations as never,
    bindings as never,
    updates as never,
    mapper,
    {
      reviewStatus: jest
        .fn()
        .mockResolvedValue({ status: 'required_in_app', appUrl: 'https://self-host.test/review' }),
    } as never
  );
  return {
    facade,
    plugin,
    version,
    ownInstallation,
    rows,
    bindings,
    updates,
    publications,
    plugins,
  };
}

describe('McpPluginSetupFacadeImpl', () => {
  it('lists visible Plugins plus current-member history without leaking another member installation', async () => {
    const { facade, ownInstallation } = pluginSetupFixture();
    ownInstallation.uninstalledAt = new Date('2026-02-01');
    const result = await facade.listAvailablePlugins(actor);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pluginId, installationState: 'uninstalled' });
    expect(JSON.stringify(result)).not.toMatch(/private-repo|never-return|foreign-installation/);
  });

  it('deduplicates publication discovery and the current member installation history', async () => {
    const { facade, publications } = pluginSetupFixture();
    publications.findVisibleTo.mockResolvedValue([{ pluginId, scope: 'project' }] as never);
    expect(await facade.listAvailablePlugins(actor)).toHaveLength(1);
    expect(publications.findVisibleTo).toHaveBeenCalledWith(actor.projectId, actor.userId);
  });

  it('permits a direct reference while accurately reporting unverifiable configuration readiness', async () => {
    const { facade } = pluginSetupFixture();
    const result = await facade.getPluginSetup(actor, pluginId);
    expect(result).toMatchObject({
      plugin: { pluginId, installationState: 'installed' },
      installation: { installationId: 'own-installation' },
      credentials: { configured: true, providerValidity: 'unknown' },
      readiness: 'configuration_unverified',
      configuration: {
        mode: 'app',
        verification: 'unknown',
        appUrl: `https://self-host.test/ui/project%2F1/plugins/${pluginId}/open`,
      },
      approval: { status: 'required_in_app' },
    });
    expect(JSON.stringify(result)).not.toMatch(/private-repo|never-return|private-commit/);
  });

  it('rechecks current scoped credential use and reports revoked bindings without claiming ready', async () => {
    const { facade, bindings } = pluginSetupFixture();
    bindings.inspectConsumerReadiness.mockResolvedValue({
      configured: false,
      providerValidity: 'unknown',
      requirements: [{ key: 'github', optional: false, state: 'inaccessible' }],
    });
    expect(await facade.getPluginSetup(actor, pluginId)).toMatchObject({
      readiness: 'credentials_required',
    });
  });

  it('keeps suspension and uninstall history distinct from credential readiness', async () => {
    const { facade, plugin, ownInstallation, bindings } = pluginSetupFixture();
    plugin.suspendedAt = new Date();
    expect(await facade.getPluginSetup(actor, pluginId)).toMatchObject({ readiness: 'suspended' });
    plugin.suspendedAt = null;
    ownInstallation.uninstalledAt = new Date();
    bindings.inspectConsumerReadiness.mockClear();
    expect(await facade.getPluginSetup(actor, pluginId)).toMatchObject({
      readiness: 'uninstalled',
      credentials: null,
    });
    expect(bindings.inspectConsumerReadiness).not.toHaveBeenCalled();
  });

  it('does not inspect another project or member installation', async () => {
    const { facade, bindings } = pluginSetupFixture();
    const result = await facade.getPluginSetup({ ...actor, projectId: 'third-project' }, pluginId);
    expect(result).toMatchObject({ installation: null, readiness: 'not_installed' });
    expect(bindings.inspectConsumerReadiness).not.toHaveBeenCalled();
  });

  it('returns an app step for configuration and never invents a typed contract', async () => {
    const { facade } = pluginSetupFixture();
    expect(await facade.getPluginConfiguration(actor, pluginId)).toMatchObject({
      mode: 'app',
      verification: 'unknown',
      manualStep: expect.any(String),
    });
  });

  it('rejects non-setup roles and propagates stored read failures', async () => {
    const { facade, plugins } = pluginSetupFixture();
    await expect(
      facade.listAvailablePlugins({ ...actor, roles: ['viewer'] })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(facade.getPluginSetup(actor, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    plugins.findById.mockRejectedValueOnce(new Error('Storage unavailable') as never);
    await expect(facade.getPluginSetup(actor, pluginId)).rejects.toThrow('Storage unavailable');
  });

  it('sanitizes a failed update without exposing provider error payloads', async () => {
    const { facade, updates } = pluginSetupFixture();
    updates.run.mockRejectedValueOnce(
      new Error('private provider body: secret=never-return') as never
    );
    await expect(facade.checkPluginUpdates(actor, pluginId)).rejects.toThrow(
      'The managed Plugin update check could not be completed'
    );
  });

  it('runs the shared managed check under current member context and omits publisher diagnostics', async () => {
    const { facade, plugin, updates } = pluginSetupFixture();
    plugin.suspendedAt = new Date();
    const result = await facade.checkPluginUpdates(actor, pluginId);
    expect(result).toMatchObject({
      outcome: 'updated',
      sharedDeploymentEffect: true,
      currentVersionId: 'version-2',
    });
    expect(updates.run).toHaveBeenCalledWith(expect.objectContaining({ context: actor, pluginId }));
    expect(JSON.stringify(result)).not.toContain('never-return');
    expect('diagnostics' in result).toBe(false);
  });
});
