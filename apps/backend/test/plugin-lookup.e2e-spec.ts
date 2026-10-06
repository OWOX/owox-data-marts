import { INestApplication, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AUTH_HEADER, createTestApp } from '@owox/test-utils';
import { FindPluginByRepositoryCommand } from 'src/plugin-host/dto/domain/find-plugin-by-repository.command';
import { PluginPublicationProject } from 'src/plugin-host/entities/plugin-publication-project.entity';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import { FindPluginByRepositoryService } from 'src/plugin-host/use-cases/find-plugin-by-repository.service';
import * as supertest from 'supertest';
import { Repository } from 'typeorm';

describe('Plugin lookup by repository (e2e, SQLite)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let lookup: FindPluginByRepositoryService;
  let plugins: Repository<Plugin>;
  let publications: Repository<PluginPublication>;
  let audiences: Repository<PluginPublicationProject>;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    lookup = app.get(FindPluginByRepositoryService);
    plugins = app.get(getRepositoryToken(Plugin));
    publications = app.get(getRepositoryToken(PluginPublication));
    audiences = app.get(getRepositoryToken(PluginPublicationProject));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  afterEach(async () => {
    await audiences.createQueryBuilder().delete().execute();
    await publications.createQueryBuilder().delete().execute();
    await plugins.createQueryBuilder().delete().execute();
  });

  let repoCounter = 0;
  const givenPlugin = (repoOwner: string, repoName: string, isPrivateRepo = false) =>
    plugins.save(
      plugins.create({
        githubRepoId: String(5000 + ++repoCounter),
        repoOwner,
        repoName,
        repoHtmlUrl: `https://github.com/${repoOwner}/${repoName}`,
        isPrivateRepo,
      })
    );

  const givenPublication = (
    plugin: Plugin,
    scope: PluginPublicationScope,
    extra: Partial<PluginPublication> = {}
  ) =>
    publications.save(
      publications.create({
        pluginId: plugin.id,
        scope,
        uniquenessKey: `${scope}:${plugin.id}:${extra.projectId ?? ''}:${extra.userId ?? ''}`,
        isActive: true,
        allProjects: false,
        ...extra,
      })
    );

  const givenDeploymentPlugin = async (repoOwner: string, repoName: string, isPrivate = false) => {
    const plugin = await givenPlugin(repoOwner, repoName, isPrivate);
    await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT, { allProjects: true });
    return plugin;
  };

  const resolve = (repository: string, projectId = 'project-1') =>
    lookup.run(new FindPluginByRepositoryCommand(repository, { projectId, userId: 'user-1' }));

  const givenAudience = (publication: PluginPublication, projectId: string, isActive = true) =>
    audiences.save(audiences.create({ publicationId: publication.id, projectId, isActive }));

  // The test IdP signs every request in as project '0'.
  const lookupOverHttp = (repository: string) =>
    agent.get(`/api/plugins/lookup?repository=${encodeURIComponent(repository)}`).set(AUTH_HEADER);

  it('finds a plugin published to the deployment whatever the case of the link', async () => {
    const plugin = await givenDeploymentPlugin('owox', 'example');

    await expect(resolve('OWOX/Example')).resolves.toEqual({ pluginId: plugin.id });
  });

  it('answers 200 with the plugin id over HTTP for a plugin published to all projects', async () => {
    const plugin = await givenDeploymentPlugin('OWOX', 'everywhere');

    const res = await lookupOverHttp('https://github.com/owox/Everywhere');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pluginId: plugin.id });
  });

  it('finds a plugin for a project in the selected audience of the deployment', async () => {
    const plugin = await givenPlugin('OWOX', 'selected');
    const publication = await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT);
    await givenAudience(publication, 'project-9');

    await expect(resolve('OWOX/selected', 'project-9')).resolves.toEqual({ pluginId: plugin.id });
  });

  it('answers 404 for a project outside the selected audience', async () => {
    const plugin = await givenPlugin('OWOX', 'beta');
    const publication = await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT);
    await givenAudience(publication, 'project-9');

    await expect(resolve('OWOX/beta', 'project-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 once the project is removed from the selected audience', async () => {
    const plugin = await givenPlugin('OWOX', 'removed');
    const publication = await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT);
    await givenAudience(publication, 'project-1', false);
    await givenAudience(publication, 'project-9');

    await expect(resolve('OWOX/removed', 'project-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("answers over HTTP within the caller's audience only", async () => {
    const inside = await givenPlugin('OWOX', 'inside');
    await givenAudience(await givenPublication(inside, PluginPublicationScope.DEPLOYMENT), '0');
    const outside = await givenPlugin('OWOX', 'outside');
    await givenAudience(
      await givenPublication(outside, PluginPublicationScope.DEPLOYMENT),
      'project-9'
    );

    const found = await lookupOverHttp('OWOX/inside');
    const hidden = await lookupOverHttp('OWOX/outside');
    const unknown = await lookupOverHttp('OWOX/unknown');

    expect(found.status).toBe(200);
    expect(found.body).toEqual({ pluginId: inside.id });
    expect(hidden.status).toBe(404);
    // Same shape as an unknown repository; `path` and `timestamp` vary per request, not per plugin.
    expect({ ...hidden.body, path: undefined, timestamp: undefined }).toEqual({
      ...unknown.body,
      path: undefined,
      timestamp: undefined,
    });
  });

  it('resolves to the most recently updated plugin when two share a cached repository name', async () => {
    const stale = await givenDeploymentPlugin('OWOX', 'renamed');
    const current = await givenDeploymentPlugin('OWOX', 'renamed');
    await plugins.update(stale.id, { modifiedAt: new Date('2026-01-01T00:00:00Z') });
    await plugins.update(current.id, { modifiedAt: new Date('2026-02-01T00:00:00Z') });

    await expect(resolve('OWOX/renamed')).resolves.toEqual({ pluginId: current.id });
  });

  it('answers a private repository like an unknown one', async () => {
    await givenDeploymentPlugin('OWOX', 'secret', true);

    await expect(resolve('OWOX/secret')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['a member', PluginPublicationScope.MEMBER, { projectId: 'project-1', userId: 'user-1' }],
    ['a project', PluginPublicationScope.PROJECT, { projectId: 'project-1' }],
  ])('answers 404 for a public plugin published only for %s', async (_, scope, extra) => {
    const plugin = await givenPlugin('OWOX', 'personal');
    await givenPublication(plugin, scope, extra);

    await expect(resolve('OWOX/personal')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 once the deployment publication is withdrawn', async () => {
    const plugin = await givenPlugin('OWOX', 'withdrawn');
    await givenPublication(plugin, PluginPublicationScope.DEPLOYMENT, {
      allProjects: true,
      isActive: false,
    });

    await expect(resolve('OWOX/withdrawn')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('answers 404 for a public plugin that was never published', async () => {
    await givenPlugin('OWOX', 'unpublished');

    await expect(resolve('OWOX/unpublished')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a repeated repository parameter like a malformed one', async () => {
    const res = await agent.get('/api/plugins/lookup?repository=a&repository=b').set(AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REPO_LOCATOR');
  });

  it('rejects a malformed repository string', async () => {
    const res = await agent.get('/api/plugins/lookup?repository=not%20a%20repo').set(AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REPO_LOCATOR');
  });

  it('still resolves a suspended deployment-published plugin', async () => {
    const plugin = await givenDeploymentPlugin('OWOX', 'suspended');
    await plugins.update(plugin.id, { suspendedAt: new Date() });

    await expect(resolve('OWOX/suspended')).resolves.toEqual({ pluginId: plugin.id });
  });
});
