import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { createTestApp } from '@owox/test-utils';
import { normalizeCredentialRequirement } from 'src/data-marts/credentials/credential.types';
import { CredentialConsumerBinding } from 'src/data-marts/credentials/entities/credential-consumer-binding.entity';
import { requirementRevision } from 'src/data-marts/credentials/services/credential-requirement-revision';
import * as supertest from 'supertest';
import { AuthorizationContext } from 'src/idp/types/auth.types';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import {
  PLUGIN_INSTALLATION_LOOKUP,
  PluginInstallationLookupPort,
} from 'src/plugin-host/facades/plugin-installation-lookup.facade';
import { GetPluginDetailsCommand } from 'src/plugin-host/dto/domain/get-plugin-details.command';
import { GetPluginInstallationCredentialSelectionsCommand } from 'src/plugin-host/dto/domain/get-plugin-installation-credential-selections.command';
import { GetPluginInstallationEntryCommand } from 'src/plugin-host/dto/domain/get-plugin-installation-entry.command';
import { InstallPluginCommand } from 'src/plugin-host/dto/domain/install-plugin.command';
import { ListInstallationsCommand } from 'src/plugin-host/dto/domain/list-installations.command';
import { UninstallPluginCommand } from 'src/plugin-host/dto/domain/uninstall-plugin.command';
import { GetPluginDetailsService } from 'src/plugin-host/use-cases/get-plugin-details.service';
import { GetPluginInstallationCredentialSelectionsService } from 'src/plugin-host/use-cases/get-plugin-installation-credential-selections.service';
import { GetPluginInstallationEntryService } from 'src/plugin-host/use-cases/get-plugin-installation-entry.service';
import { InstallPluginService } from 'src/plugin-host/use-cases/install-plugin.service';
import { ListInstallationsService } from 'src/plugin-host/use-cases/list-installations.service';
import { UninstallPluginService } from 'src/plugin-host/use-cases/uninstall-plugin.service';
import { Repository } from 'typeorm';
import { createCredential } from './fixtures/storage-credentials';

const ALICE: AuthorizationContext = { projectId: 'project-1', userId: 'alice' };
const BOB: AuthorizationContext = { projectId: 'project-1', userId: 'bob' };
const VIEWER: Payload = {
  userId: 'viewer-1',
  email: 'viewer@localhost',
  roles: ['viewer'],
  fullName: 'Business User',
  projectId: 'project-1',
};
const VIEWER_HEADER = { 'x-owox-authorization': 'viewer-token' };
const OWOX_AI_ENV = {
  AI_BASE_URL: 'https://ai.example.com/v1',
  AI_API_KEY: 'test-key',
  AI_PLUGIN_FAST_MODEL: 'fast-model',
  AI_PLUGIN_REASONING_MODEL: 'reasoning-model',
};

describe('Plugin installations (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let installService: InstallPluginService;
  let uninstallService: UninstallPluginService;
  let listService: ListInstallationsService;
  let entryService: GetPluginInstallationEntryService;
  let detailsService: GetPluginDetailsService;
  let selectionsService: GetPluginInstallationCredentialSelectionsService;
  let bindings: Repository<CredentialConsumerBinding>;
  let lookup: PluginInstallationLookupPort;
  let plugins: Repository<Plugin>;
  let versions: Repository<PluginVersion>;
  let installations: Repository<PluginInstallation>;
  let pluginId: string;
  let versionId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    installService = app.get(InstallPluginService);
    uninstallService = app.get(UninstallPluginService);
    listService = app.get(ListInstallationsService);
    entryService = app.get(GetPluginInstallationEntryService);
    detailsService = app.get(GetPluginDetailsService);
    selectionsService = app.get(GetPluginInstallationCredentialSelectionsService);
    bindings = app.get(getRepositoryToken(CredentialConsumerBinding));
    lookup = app.get(PLUGIN_INSTALLATION_LOOKUP);
    plugins = app.get(getRepositoryToken(Plugin));
    versions = app.get(getRepositoryToken(PluginVersion));
    installations = app.get(getRepositoryToken(PluginInstallation));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: '987654321',
        repoOwner: 'OWOX',
        repoName: 'example-plugin',
        repoHtmlUrl: 'https://github.com/OWOX/example-plugin',
      })
    );
    pluginId = plugin.id;

    const version = await versions.save(
      versions.create({
        pluginId,
        semver: '1.0.0',
        commitSha: 'abc123',
        githubReleaseId: '5',
        tagName: 'v1.0.0',
        displayName: 'Example Plugin',
        description: 'Does something',
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com',
        releasePublishedAt: null,
      })
    );
    versionId = version.id;

    await plugins.update(pluginId, { currentVersionId: versionId });
  });

  afterEach(async () => {
    await bindings.createQueryBuilder().delete().execute();
    await installations.createQueryBuilder().delete().execute();
    await versions.createQueryBuilder().delete().execute();
    await plugins.createQueryBuilder().delete().execute();
  });

  const install = (context: AuthorizationContext) =>
    installService.run(new InstallPluginCommand(pluginId, versionId, context));
  const uninstall = (context: AuthorizationContext) =>
    uninstallService.run(new UninstallPluginCommand(pluginId, context));
  const list = (context: AuthorizationContext, includeUninstalled = false) =>
    listService.run(new ListInstallationsCommand(context, includeUninstalled));
  const entry = (installationId: string, context: AuthorizationContext) =>
    entryService.run(new GetPluginInstallationEntryCommand(installationId, context));
  const details = (context: AuthorizationContext) =>
    detailsService.run(new GetPluginDetailsCommand(pluginId, context));
  const selections = (installationId: string, context: AuthorizationContext) =>
    selectionsService.run(
      new GetPluginInstallationCredentialSelectionsCommand(installationId, context)
    );

  it('preserves the first-install date across an uninstall and restore', async () => {
    const first = await install(ALICE);
    await uninstall(ALICE);
    const restored = await install(ALICE);

    expect(restored.installationId).toBe(first.installationId);
    expect(restored.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(restored.uninstalledAt).toBeNull();
    expect(await installations.count()).toBe(1);
  });

  // Two members of one project must not be able to affect each other's access.
  it('keeps two members in one project independent', async () => {
    await install(ALICE);
    await install(BOB);

    await uninstall(ALICE);

    const [bobRow] = await list(BOB, false);
    expect(bobRow.installationState).toBe('installed');
    expect(await list(ALICE, false)).toHaveLength(0);
  });

  // The single reason installation history exists: a plugin nobody publishes any more
  // has vanished from the Gallery, so history is the only way back to it.
  it('restores from history with no publication in existence', async () => {
    await install(ALICE);
    await uninstall(ALICE);

    const history = await list(ALICE, true);
    expect(history).toHaveLength(1);
    expect(history[0].installationState).toBe('uninstalled');

    await expect(install(ALICE)).resolves.toMatchObject({ uninstalledAt: null });
  });

  it('refuses a stale confirmation and reports the version that is current now', async () => {
    const newer = await versions.save(
      versions.create({
        pluginId,
        semver: '2.0.0',
        commitSha: 'def456',
        githubReleaseId: '6',
        tagName: 'v2.0.0',
        displayName: 'Example Plugin',
        description: 'Does something',
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com',
        releasePublishedAt: null,
      })
    );
    await plugins.update(pluginId, { currentVersionId: newer.id });

    await expect(
      installService.run(new InstallPluginCommand(pluginId, versionId, ALICE))
    ).rejects.toMatchObject({
      code: 'PLUGIN_STALE_VERSION',
      errorDetails: { currentVersionId: newer.id, currentSemver: '2.0.0' },
    });
  });

  describe('while suspended', () => {
    beforeEach(async () => {
      await install(ALICE);
      await plugins.update(pluginId, { suspendedAt: new Date() });
    });

    it('blocks the entry point but keeps uninstalling available', async () => {
      const [row] = await list(ALICE, false);

      await expect(entry(row.installationId, ALICE)).rejects.toMatchObject({
        code: 'PLUGIN_SUSPENDED',
      });
      // A member must always be able to walk away from a plugin that has gone wrong.
      await expect(uninstall(ALICE)).resolves.toBeUndefined();
    });

    it('blocks restoring', async () => {
      await uninstall(ALICE);

      await expect(install(ALICE)).rejects.toMatchObject({ code: 'PLUGIN_SUSPENDED' });
    });
  });

  describe('entry point', () => {
    it("returns the delivery url only for the caller's own live installation", async () => {
      const installed = await install(ALICE);

      await expect(entry(installed.installationId, ALICE)).resolves.toMatchObject({
        deliveryUrl: 'https://plugin.example.com',
      });
      await expect(entry(installed.installationId, BOB)).rejects.toThrow();
    });

    /**
     * The host puts this straight into the plugin's context as `pluginId`. Handing back
     * the version id there would give plugins an identity that changes with every
     * release -- the opposite of the stable identity the design promises.
     */
    it('identifies the plugin by its own id, not the current version', async () => {
      const installed = await install(ALICE);

      const point = await entry(installed.installationId, ALICE);

      expect(point.pluginId).toBe(pluginId);
      expect(point.versionId).toBe(versionId);
      expect(point.pluginId).not.toBe(point.versionId);
    });
  });

  describe('Credential grants', () => {
    let credentialId: string;

    beforeEach(async () => {
      credentialId = await createCredential(app, {
        projectId: 'project-1',
        definitionId: 'openai',
        title: 'Team OpenAI',
        secret: { value: 'sk-test' },
        publicMetadata: null,
        ownerIds: ['alice'],
        contextIds: [],
      });
    });

    const bind = (
      consumerId: string,
      requirementKey: string,
      over: Partial<CredentialConsumerBinding> = {}
    ) => {
      const snapshot = normalizeCredentialRequirement(requirementKey);
      return bindings.save(
        bindings.create({
          projectId: 'project-1',
          credentialId,
          consumerType: 'plugin-installation',
          consumerId,
          requirementKey,
          requirementSnapshot: snapshot,
          requirementRevision: requirementRevision(snapshot),
          configuredById: 'alice',
          active: true,
          ...over,
        })
      );
    };

    it('returns only the active grants made for the current version', async () => {
      const installed = await install(ALICE);
      await versions.update(versionId, {
        credentialRequirements: ['ai', 'github', 'slack', 'jira'],
      });
      await bind(installed.installationId, 'ai');
      await bind(installed.installationId, 'github', { projectId: 'project-2' });
      await bind(installed.installationId, 'slack', { active: false });
      const stale = { ...normalizeCredentialRequirement('jira'), optional: true };
      await bind(installed.installationId, 'jira', {
        requirementSnapshot: stale,
        requirementRevision: requirementRevision(stale),
      });

      await expect(selections(installed.installationId, ALICE)).resolves.toEqual({
        credentialSelections: { ai: credentialId },
      });
    });

    it("answers 404 for another member's installation and for a removed one", async () => {
      const installed = await install(ALICE);
      await versions.update(versionId, { credentialRequirements: ['ai'] });
      await bind(installed.installationId, 'ai');

      await expect(selections(installed.installationId, BOB)).rejects.toMatchObject({
        status: 404,
      });
      await uninstall(ALICE);
      await expect(selections(installed.installationId, ALICE)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  /**
   * No publication is created anywhere in this suite, which is the point: withdrawing a
   * publication leaves an installed plugin listed nowhere, and members still come to its own
   * page to update or uninstall it. Reporting the caller's installation as absent there
   * strands them on a plugin they are still running.
   */
  describe('direct plugin page', () => {
    it.each([
      ['not_installed', async () => undefined],
      ['installed', async () => void (await install(ALICE))],
      [
        'uninstalled',
        async () => {
          await install(ALICE);
          await uninstall(ALICE);
        },
      ],
    ])('reports the caller as %s', async (expected, arrange) => {
      await arrange();

      const page = await details(ALICE);

      expect(page.installationState).toBe(expected);
      // Unpublished throughout, so nothing explains why it would be in the Gallery.
      expect(page.visibleViaScopes).toEqual([]);
    });

    it("does not leak another member's installation", async () => {
      await install(BOB);

      await expect(details(ALICE)).resolves.toMatchObject({
        installationState: 'not_installed',
      });
    });
  });

  /** The rest of this suite drives services directly; only the wired app shows pipes and route order. */
  describe('OWOX AI over HTTP', () => {
    beforeAll(() => {
      const idp = (app.getHttpAdapter().getInstance() as { get(name: 'idp'): IdpProvider }).get(
        'idp'
      );
      jest.spyOn(idp, 'parseToken').mockResolvedValue(VIEWER);
      jest.spyOn(idp, 'introspectToken').mockResolvedValue(VIEWER);
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    beforeEach(async () => {
      await versions.update(versionId, { credentialRequirements: ['ai'] });
      // A scheduled plugin skips the GitHub check that a first install runs.
      await plugins.update(pluginId, { nextUpdateCheckAt: new Date(Date.now() + 86_400_000) });
    });

    afterEach(() => {
      for (const name of Object.keys(OWOX_AI_ENV)) delete process.env[name];
    });

    const installWithOwoxAi = () =>
      agent
        .post(`/api/plugins/${pluginId}/installation`)
        .set(VIEWER_HEADER)
        .send({ expectedVersionId: versionId, credentialSelections: { ai: 'owox-ai' } });

    it('answers the OWOX AI status to a viewer, not the plugin lookup', async () => {
      Object.assign(process.env, OWOX_AI_ENV);

      const res = await agent.get('/api/plugins/owox-ai').set(VIEWER_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ models: ['fast', 'reasoning'], billed: expect.any(Boolean) });
    });

    it('lets the OWOX AI selection through request validation', async () => {
      const res = await installWithOwoxAi();

      // The use case refuses it because OWOX AI is off; the request shape was valid.
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('OWOX AI does not provide every model');
    });

    it('installs with OWOX AI when the deployment provides it', async () => {
      Object.assign(process.env, OWOX_AI_ENV);

      const res = await installWithOwoxAi();

      expect(res.status).toBe(200);
      await expect(
        installations.findOneByOrFail({ id: res.body.installationId })
      ).resolves.toMatchObject({ owoxAi: true, userId: VIEWER.userId });
    });

    // The Credentials tab saves through the install request and starts from the selections read.
    it('moves an installed plugin to OWOX AI and away from it again', async () => {
      Object.assign(process.env, OWOX_AI_ENV);
      await versions.update(versionId, { credentialRequirements: [{ id: 'ai', optional: true }] });
      const save = (ai: string | null) =>
        agent
          .post(`/api/plugins/${pluginId}/installation`)
          .set(VIEWER_HEADER)
          .send({ expectedVersionId: versionId, credentialSelections: { ai } });
      const first = await save(null);
      expect(first.status).toBe(200);
      const { installationId } = first.body as { installationId: string };
      const state = async () => ({
        owoxAi: (await installations.findOneByOrFail({ id: installationId })).owoxAi,
        read: (
          await agent
            .get(`/api/plugins/installations/${installationId}/credential-selections`)
            .set(VIEWER_HEADER)
        ).body as unknown,
      });

      expect((await save('owox-ai')).status).toBe(200);
      await expect(state()).resolves.toEqual({
        owoxAi: true,
        read: { credentialSelections: { ai: 'owox-ai' } },
      });

      expect((await save(null)).status).toBe(200);
      await expect(state()).resolves.toEqual({ owoxAi: false, read: { credentialSelections: {} } });
    });
  });

  describe('runtime lookup facade', () => {
    it('reports an active installation to the runtime authorization track', async () => {
      const installed = await install(ALICE);

      await expect(lookup.findSnapshot(installed.installationId)).resolves.toMatchObject({
        pluginId,
        projectId: 'project-1',
        userId: 'alice',
        isActive: true,
        isSuspended: false,
      });
    });

    it('reports a removed installation as inactive rather than absent', async () => {
      const installed = await install(ALICE);
      await uninstall(ALICE);

      await expect(lookup.findSnapshot(installed.installationId)).resolves.toMatchObject({
        isActive: false,
      });
    });

    it('reports suspension, which is what gates a plugin at runtime', async () => {
      const installed = await install(ALICE);
      await plugins.update(pluginId, { suspendedAt: new Date() });

      await expect(lookup.findSnapshot(installed.installationId)).resolves.toMatchObject({
        isSuspended: true,
      });
    });

    it('returns null for an unknown installation', async () => {
      await expect(lookup.findSnapshot('does-not-exist')).resolves.toBeNull();
    });
  });
});
