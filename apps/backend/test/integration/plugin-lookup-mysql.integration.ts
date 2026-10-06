import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PluginPublicationProject } from 'src/plugin-host/entities/plugin-publication-project.entity';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import { PluginPublicationService } from 'src/plugin-host/services/plugin-publication.service';

const MYSQL_HOST = process.env.PLUGIN_LOOKUP_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.PLUGIN_LOOKUP_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.PLUGIN_LOOKUP_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.PLUGIN_LOOKUP_MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.PLUGIN_LOOKUP_MYSQL_DATABASE ?? 'owox_test';

const available = !!MYSQL_HOST;
if (!available) {
  console.log('Skipping plugin lookup MySQL integration tests: PLUGIN_LOOKUP_MYSQL_HOST unset');
}
if (available && !MYSQL_PASSWORD) {
  throw new Error('PLUGIN_LOOKUP_MYSQL_HOST is set but PLUGIN_LOOKUP_MYSQL_PASSWORD is empty.');
}

const describeIfAvailable = available ? describe : describe.skip;

describeIfAvailable('Plugin lookup by repository (integration, MySQL)', () => {
  let dataSource: DataSource;
  let service: PluginPublicationService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: [Plugin, PluginPublication, PluginPublicationProject],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    service = new PluginPublicationService(
      dataSource.getRepository(PluginPublication),
      dataSource.getRepository(PluginPublicationProject)
    );
  });

  afterEach(async () => {
    await dataSource.getRepository(PluginPublicationProject).clear();
    await dataSource.getRepository(PluginPublication).clear();
    await dataSource.getRepository(Plugin).clear();
  });

  afterAll(async () => {
    await dataSource.query('DROP TABLE IF EXISTS `plugin_publication_project`');
    await dataSource.query('DROP TABLE IF EXISTS `plugin_publication`');
    await dataSource.query('DROP TABLE IF EXISTS `plugin`');
    await dataSource.destroy();
  });

  async function givenPlugin(
    githubRepoId: string,
    repoOwner: string,
    repoName: string,
    isPrivateRepo: boolean,
    scope: PluginPublicationScope,
    extra: Partial<PluginPublication> = {},
    audience: string[] = []
  ): Promise<Plugin> {
    const plugins = dataSource.getRepository(Plugin);
    const publications = dataSource.getRepository(PluginPublication);
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId,
        repoOwner,
        repoName,
        repoHtmlUrl: `https://github.com/${repoOwner}/${repoName}`,
        isPrivateRepo,
      })
    );
    const publication = await publications.save(
      publications.create({
        pluginId: plugin.id,
        scope,
        uniquenessKey: `${scope}:${plugin.id}:${extra.projectId ?? ''}:${extra.userId ?? ''}`,
        isActive: true,
        allProjects: false,
        ...extra,
      })
    );
    for (const projectId of audience) {
      await dataSource
        .getRepository(PluginPublicationProject)
        .save({ publicationId: publication.id, projectId, isActive: true });
    }
    return plugin;
  }

  it('finds a deployment-published plugin whatever the case of the link', async () => {
    const plugin = await givenPlugin(
      '1',
      'owox',
      'example',
      false,
      PluginPublicationScope.DEPLOYMENT,
      { allProjects: true }
    );

    await expect(
      service.findDeploymentPluginIdByRepo('project-1', 'OWOX', 'Example')
    ).resolves.toBe(plugin.id);
  });

  it('never returns a private repository', async () => {
    await givenPlugin('2', 'OWOX', 'secret', true, PluginPublicationScope.DEPLOYMENT, {
      allProjects: true,
    });

    await expect(
      service.findDeploymentPluginIdByRepo('project-1', 'owox', 'SECRET')
    ).resolves.toBeNull();
  });

  it('does not return a public plugin published only for a member', async () => {
    await givenPlugin('3', 'OWOX', 'personal', false, PluginPublicationScope.MEMBER, {
      projectId: 'project-1',
      userId: 'user-1',
    });

    await expect(
      service.findDeploymentPluginIdByRepo('project-1', 'OWOX', 'personal')
    ).resolves.toBeNull();
  });

  it('resolves a selected audience only for the projects in it', async () => {
    const plugin = await givenPlugin(
      '4',
      'OWOX',
      'beta',
      false,
      PluginPublicationScope.DEPLOYMENT,
      {},
      ['project-9']
    );

    await expect(service.findDeploymentPluginIdByRepo('project-9', 'owox', 'BETA')).resolves.toBe(
      plugin.id
    );
    await expect(
      service.findDeploymentPluginIdByRepo('project-1', 'OWOX', 'beta')
    ).resolves.toBeNull();
  });

  it('prefers the most recently updated plugin when two share a cached name', async () => {
    const stale = await givenPlugin(
      '5',
      'OWOX',
      'renamed',
      false,
      PluginPublicationScope.DEPLOYMENT,
      { allProjects: true }
    );
    const current = await givenPlugin(
      '6',
      'OWOX',
      'renamed',
      false,
      PluginPublicationScope.DEPLOYMENT,
      { allProjects: true }
    );
    await dataSource
      .getRepository(Plugin)
      .update(stale.id, { modifiedAt: new Date('2026-01-01T00:00:00Z') });
    await dataSource
      .getRepository(Plugin)
      .update(current.id, { modifiedAt: new Date('2026-02-01T00:00:00Z') });

    await expect(
      service.findDeploymentPluginIdByRepo('project-1', 'OWOX', 'renamed')
    ).resolves.toBe(current.id);
  });
});
