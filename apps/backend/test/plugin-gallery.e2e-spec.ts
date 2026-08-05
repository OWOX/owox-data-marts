import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { AuthorizationContext } from 'src/idp/types/auth.types';
import { PluginPublicationProject } from 'src/plugin-host/entities/plugin-publication-project.entity';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import { GetPluginGalleryCommand } from 'src/plugin-host/dto/domain/get-plugin-gallery.command';
import { GetPluginGalleryService } from 'src/plugin-host/use-cases/get-plugin-gallery.service';
import { Repository } from 'typeorm';

const MEMBER: AuthorizationContext = { projectId: 'project-1', userId: 'user-1' };
const OTHER_MEMBER: AuthorizationContext = { projectId: 'project-1', userId: 'user-2' };
const OTHER_PROJECT: AuthorizationContext = { projectId: 'project-9', userId: 'user-1' };

/**
 * Proves the three-way visibility union against real SQL.
 *
 * The unit tests mock the publication repository, so the query itself -- the EXISTS
 * subquery over the audience table, and the interaction of the three OR branches -- is
 * only ever executed here.
 */
describe('Plugin gallery (e2e)', () => {
  let app: INestApplication;
  let gallery: GetPluginGalleryService;
  let plugins: Repository<Plugin>;
  let versions: Repository<PluginVersion>;
  let publications: Repository<PluginPublication>;
  let audiences: Repository<PluginPublicationProject>;

  beforeAll(async () => {
    app = (await createTestApp()).app;
    gallery = app.get(GetPluginGalleryService);
    plugins = app.get(getRepositoryToken(Plugin));
    versions = app.get(getRepositoryToken(PluginVersion));
    publications = app.get(getRepositoryToken(PluginPublication));
    audiences = app.get(getRepositoryToken(PluginPublicationProject));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  afterEach(async () => {
    await audiences.createQueryBuilder().delete().execute();
    await publications.createQueryBuilder().delete().execute();
    await versions.createQueryBuilder().delete().execute();
    await plugins.createQueryBuilder().delete().execute();
  });

  let repoCounter = 0;

  async function givenPlugin(overrides: Partial<Plugin> = {}): Promise<Plugin> {
    repoCounter += 1;
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: String(1000 + repoCounter),
        repoOwner: 'OWOX',
        repoName: `plugin-${repoCounter}`,
        repoHtmlUrl: `https://github.com/OWOX/plugin-${repoCounter}`,
        ...overrides,
      })
    );

    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'abc123',
        githubReleaseId: String(2000 + repoCounter),
        tagName: 'v1.0.0',
        displayName: `Plugin ${repoCounter}`,
        description: 'Does something',
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com',
        releasePublishedAt: null,
      })
    );

    await plugins.update(plugin.id, { currentVersionId: version.id });
    return plugins.findOneByOrFail({ id: plugin.id });
  }

  async function givenPublication(
    plugin: Plugin,
    scope: PluginPublicationScope,
    extra: Partial<PluginPublication> = {}
  ): Promise<PluginPublication> {
    return publications.save(
      publications.create({
        pluginId: plugin.id,
        scope,
        uniquenessKey: `${scope}:${plugin.id}:${extra.projectId ?? ''}:${extra.userId ?? ''}`,
        isActive: true,
        allProjects: false,
        ...extra,
      })
    );
  }

  it('shows an all-projects deployment publication to any project', async () => {
    const plugin = await givenPlugin();
    await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT, { allProjects: true });

    expect(await gallery.run(new GetPluginGalleryCommand(MEMBER))).toHaveLength(1);
    expect(await gallery.run(new GetPluginGalleryCommand(OTHER_PROJECT))).toHaveLength(1);
  });

  it('shows a selected-projects publication only to the listed projects', async () => {
    const plugin = await givenPlugin();
    const publication = await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT);
    await audiences.save(
      audiences.create({ publicationId: publication.id, projectId: 'project-1', isActive: true })
    );

    expect(await gallery.run(new GetPluginGalleryCommand(MEMBER))).toHaveLength(1);
    expect(await gallery.run(new GetPluginGalleryCommand(OTHER_PROJECT))).toHaveLength(0);
  });

  it('hides a project once its audience row is deactivated', async () => {
    const plugin = await givenPlugin();
    const publication = await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT);
    await audiences.save(
      audiences.create({ publicationId: publication.id, projectId: 'project-1', isActive: false })
    );

    expect(await gallery.run(new GetPluginGalleryCommand(MEMBER))).toHaveLength(0);
  });

  it('hides an inactive publication entirely', async () => {
    const plugin = await givenPlugin();
    await givenPublication(plugin, PluginPublicationScope.PROJECT, {
      projectId: 'project-1',
      isActive: false,
    });

    expect(await gallery.run(new GetPluginGalleryCommand(MEMBER))).toHaveLength(0);
  });

  it('keeps a member publication private to that member', async () => {
    const plugin = await givenPlugin();
    await givenPublication(plugin, PluginPublicationScope.MEMBER, {
      projectId: 'project-1',
      userId: 'user-1',
    });

    expect(await gallery.run(new GetPluginGalleryCommand(MEMBER))).toHaveLength(1);
    expect(await gallery.run(new GetPluginGalleryCommand(OTHER_MEMBER))).toHaveLength(0);
  });

  it('shows a project publication to every member of that project', async () => {
    const plugin = await givenPlugin();
    await givenPublication(plugin, PluginPublicationScope.PROJECT, { projectId: 'project-1' });

    expect(await gallery.run(new GetPluginGalleryCommand(MEMBER))).toHaveLength(1);
    expect(await gallery.run(new GetPluginGalleryCommand(OTHER_MEMBER))).toHaveLength(1);
  });

  // The single most load-bearing property of the union: three reasons to be visible
  // produce one entry, listing all three.
  it('returns one entry for a plugin published at all three levels', async () => {
    const plugin = await givenPlugin();
    await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT, { allProjects: true });
    await givenPublication(plugin, PluginPublicationScope.PROJECT, { projectId: 'project-1' });
    await givenPublication(plugin, PluginPublicationScope.MEMBER, {
      projectId: 'project-1',
      userId: 'user-1',
    });

    const entries = await gallery.run(new GetPluginGalleryCommand(MEMBER));

    expect(entries).toHaveLength(1);
    expect([...entries[0].visibleViaScopes].sort()).toEqual(['deployment', 'member', 'project']);
  });

  it('lists a suspended plugin, marked unavailable', async () => {
    const plugin = await givenPlugin({ suspendedAt: new Date() });
    await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT, { allProjects: true });

    const [entry] = await gallery.run(new GetPluginGalleryCommand(MEMBER));

    expect(entry.suspended).toBe(true);
  });

  it('never returns a delivery url to a member', async () => {
    const plugin = await givenPlugin();
    await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT, { allProjects: true });

    const [entry] = await gallery.run(new GetPluginGalleryCommand(MEMBER));

    expect(JSON.stringify(entry)).not.toContain('plugin.example.com');
  });
});
