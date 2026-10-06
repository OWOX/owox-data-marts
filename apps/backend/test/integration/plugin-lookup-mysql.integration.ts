import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import { PluginService } from 'src/plugin-host/services/plugin.service';

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
  let service: PluginService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: [Plugin, PluginPublication],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    service = new PluginService(dataSource.getRepository(Plugin));
  });

  afterEach(async () => {
    await dataSource.getRepository(PluginPublication).clear();
    await dataSource.getRepository(Plugin).clear();
  });

  afterAll(async () => {
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
    extra: Partial<PluginPublication> = {}
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
    await publications.save(
      publications.create({
        pluginId: plugin.id,
        scope,
        uniquenessKey: `${scope}:${plugin.id}:${extra.projectId ?? ''}:${extra.userId ?? ''}`,
        isActive: true,
        allProjects: false,
        ...extra,
      })
    );
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
      service.findDeploymentPublishedByRepoName('OWOX', 'Example')
    ).resolves.toMatchObject({ id: plugin.id });
  });

  it('never returns a private repository', async () => {
    await givenPlugin('2', 'OWOX', 'secret', true, PluginPublicationScope.DEPLOYMENT, {
      allProjects: true,
    });

    await expect(service.findDeploymentPublishedByRepoName('owox', 'SECRET')).resolves.toBeNull();
  });

  it('does not return a public plugin published only for a member', async () => {
    await givenPlugin('3', 'OWOX', 'personal', false, PluginPublicationScope.MEMBER, {
      projectId: 'project-1',
      userId: 'user-1',
    });

    await expect(service.findDeploymentPublishedByRepoName('OWOX', 'personal')).resolves.toBeNull();
  });
});
