import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { AuthorizationContext } from 'src/idp/types/auth.types';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import { PluginPublicationProject } from 'src/plugin-host/entities/plugin-publication-project.entity';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import {
  PublishPluginCommand,
  UnpublishPluginCommand,
} from 'src/plugin-host/dto/domain/publish-plugin.command';
import { PublishPluginService } from 'src/plugin-host/use-cases/publish-plugin.service';
import { SyncPluginReleasesService } from 'src/plugin-host/use-cases/sync-plugin-releases.service';
import { UnpublishPluginService } from 'src/plugin-host/use-cases/unpublish-plugin.service';
import { GithubApiService } from 'src/plugin-host/services/github-api.service';
import { PublicationAuthorizationService } from 'src/plugin-host/services/publication-authorization.service';
import { Repository } from 'typeorm';

const REPO = 'OWOX/example-plugin';
const GITHUB_REPO_ID = '987654321';

const PUBLISHER: AuthorizationContext = {
  projectId: 'project-1',
  userId: 'user-1',
  apiKeyId: 'key-1',
  roles: ['admin'],
};

/**
 * Exercises the deployment audience rules against real tables.
 *
 * The unit tests mock the publication repository, so this is where the computed
 * uniqueness key, the unique index behind it, and row-level activation are actually
 * proven to behave.
 */
describe('Plugin publications (e2e)', () => {
  let app: INestApplication;
  let publish: PublishPluginService;
  let unpublish: UnpublishPluginService;
  let plugins: Repository<Plugin>;
  let publications: Repository<PluginPublication>;
  let audiences: Repository<PluginPublicationProject>;
  let pluginId: string;

  beforeAll(async () => {
    app = (await createTestApp()).app;

    // GitHub and release synchronization have their own unit coverage; here they are
    // stubbed so the test is about publication state, not network behaviour.
    const sync = app.get(SyncPluginReleasesService);
    const github = app.get(GithubApiService);
    const authorization = app.get(PublicationAuthorizationService);

    plugins = app.get(getRepositoryToken(Plugin));
    publications = app.get(getRepositoryToken(PluginPublication));
    audiences = app.get(getRepositoryToken(PluginPublicationProject));

    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: GITHUB_REPO_ID,
        repoOwner: 'OWOX',
        repoName: 'example-plugin',
        repoHtmlUrl: 'https://github.com/OWOX/example-plugin',
      })
    );
    pluginId = plugin.id;

    jest.spyOn(sync, 'run').mockResolvedValue({
      pluginId,
      githubRepoId: GITHUB_REPO_ID,
      currentSemver: '1.0.0',
      // Both or neither: publishing refuses a plugin with no installable version, so a
      // stub reporting a SemVer without its version id is not a state sync can produce.
      currentVersionId: 'version-1',
      report: {
        syncedAt: new Date().toISOString(),
        accessMode: 'anonymous' as never,
        acceptedSemvers: [],
        unchangedSemvers: [],
        rejections: [],
      },
    });
    jest.spyOn(github, 'getRepo').mockResolvedValue({ githubRepoId: GITHUB_REPO_ID } as never);
    jest.spyOn(authorization, 'assertMayManage').mockImplementation(() => undefined);

    publish = app.get(PublishPluginService);
    unpublish = app.get(UnpublishPluginService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const doPublish = (scope: PluginPublicationScope, audience = {}, context = PUBLISHER) =>
    publish.run(new PublishPluginCommand(REPO, scope, context, audience));

  const doUnpublish = (scope: PluginPublicationScope, audience = {}, context = PUBLISHER) =>
    unpublish.run(new UnpublishPluginCommand(REPO, scope, context, audience));

  afterEach(async () => {
    // TypeORM refuses delete({}) outright, and audience rows must go before the
    // publications they reference.
    await audiences.createQueryBuilder().delete().execute();
    await publications.createQueryBuilder().delete().execute();
  });

  it('walks a deployment audience through add, partial removal and exhaustion', async () => {
    await doPublish(PluginPublicationScope.DEPLOYMENT, { projectIds: ['p1', 'p2'] });

    const added = await doPublish(PluginPublicationScope.DEPLOYMENT, { projectIds: ['p3'] });
    expect(added.audienceProjectIds.sort()).toEqual(['p1', 'p2', 'p3']);

    const partial = await doUnpublish(PluginPublicationScope.DEPLOYMENT, { projectIds: ['p1'] });
    expect(partial.audienceProjectIds.sort()).toEqual(['p2', 'p3']);
    expect(partial.isActive).toBe(true);

    const emptied = await doUnpublish(PluginPublicationScope.DEPLOYMENT, {
      projectIds: ['p2', 'p3'],
    });
    expect(emptied.isActive).toBe(false);
    expect(await publications.count()).toBe(1);
  });

  it('restores the same row on republish rather than creating a second one', async () => {
    const first = await doPublish(PluginPublicationScope.MEMBER);
    await doUnpublish(PluginPublicationScope.MEMBER);

    const again = await doPublish(PluginPublicationScope.MEMBER);

    expect(again.publicationId).toBe(first.publicationId);
    expect(await publications.count()).toBe(1);
    const row = await publications.findOneByOrFail({ id: again.publicationId });
    expect(row).toMatchObject({ isActive: true, unpublishedAt: null });
  });

  it("keeps one member out of another member's publication", async () => {
    await doPublish(PluginPublicationScope.MEMBER, {}, PUBLISHER);
    await doPublish(PluginPublicationScope.MEMBER, {}, { ...PUBLISHER, userId: 'user-2' });

    expect(await publications.count()).toBe(2);
    const keys = (await publications.find()).map(row => row.uniquenessKey);
    expect(new Set(keys).size).toBe(2);
  });

  it('lets deployment, project and member publications coexist for one plugin', async () => {
    await doPublish(PluginPublicationScope.DEPLOYMENT, { allProjects: true });
    await doPublish(PluginPublicationScope.PROJECT);
    await doPublish(PluginPublicationScope.MEMBER);

    expect(await publications.count()).toBe(3);
  });

  it('switches from a selected audience to the wildcard only in two steps', async () => {
    await doPublish(PluginPublicationScope.DEPLOYMENT, { projectIds: ['p1'] });

    await expect(
      doPublish(PluginPublicationScope.DEPLOYMENT, { allProjects: true })
    ).rejects.toMatchObject({ code: 'PLUGIN_AUDIENCE_CONFLICT' });

    await doUnpublish(PluginPublicationScope.DEPLOYMENT, { allProjects: true });
    const wildcard = await doPublish(PluginPublicationScope.DEPLOYMENT, { allProjects: true });

    expect(wildcard.allProjects).toBe(true);
    // The old audience must not survive the switch, or a later move back to selected
    // projects would silently re-grant p1.
    expect(wildcard.audienceProjectIds).toEqual([]);
    expect(await audiences.countBy({ isActive: true })).toBe(0);
  });

  it('refuses to carve a single project out of the wildcard', async () => {
    await doPublish(PluginPublicationScope.DEPLOYMENT, { allProjects: true });

    await expect(
      doUnpublish(PluginPublicationScope.DEPLOYMENT, { projectIds: ['p1'] })
    ).rejects.toMatchObject({ code: 'PLUGIN_AUDIENCE_CONFLICT' });

    expect(
      await publications.findOneByOrFail({ scope: PluginPublicationScope.DEPLOYMENT })
    ).toMatchObject({
      isActive: true,
      allProjects: true,
    });
  });
});
