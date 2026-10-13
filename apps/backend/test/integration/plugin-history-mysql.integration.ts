import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PluginAuditEvent } from 'src/plugin-host/entities/plugin-audit-event.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginPublicationProject } from 'src/plugin-host/entities/plugin-publication-project.entity';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginAuditAction } from 'src/plugin-host/enums/plugin-audit-action.enum';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import {
  PluginAuditService,
  type PluginHistoryQuery,
} from 'src/plugin-host/services/plugin-audit.service';
import { PluginPublicationService } from 'src/plugin-host/services/plugin-publication.service';

const MYSQL_HOST = process.env.PLUGIN_HISTORY_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.PLUGIN_HISTORY_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.PLUGIN_HISTORY_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.PLUGIN_HISTORY_MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.PLUGIN_HISTORY_MYSQL_DATABASE ?? 'owox_test';

const available = !!MYSQL_HOST;
if (!available) {
  console.log('Skipping plugin history MySQL integration tests: PLUGIN_HISTORY_MYSQL_HOST unset');
}
if (available && !MYSQL_PASSWORD) {
  throw new Error('PLUGIN_HISTORY_MYSQL_HOST is set but PLUGIN_HISTORY_MYSQL_PASSWORD is empty.');
}

const describeIfAvailable = available ? describe : describe.skip;

describeIfAvailable('Plugin history (integration, MySQL)', () => {
  let dataSource: DataSource;
  let audit: PluginAuditService;
  let publications: PluginPublicationService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: [
        Plugin,
        PluginVersion,
        PluginPublication,
        PluginPublicationProject,
        PluginInstallation,
        PluginAuditEvent,
      ],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    // Matches the production migration: whole seconds, which is what makes ties real.
    await dataSource.query(
      'ALTER TABLE plugin_audit_event MODIFY createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP'
    );
    audit = new PluginAuditService(dataSource.getRepository(PluginAuditEvent), {
      publishOnCommit: async () => undefined,
    } as never);
    publications = new PluginPublicationService(
      dataSource.getRepository(PluginPublication),
      dataSource.getRepository(PluginPublicationProject)
    );
  });

  afterEach(async () => {
    await dataSource.getRepository(PluginAuditEvent).clear();
    await dataSource.getRepository(PluginPublicationProject).clear();
    await dataSource.getRepository(PluginPublication).clear();
    await dataSource.getRepository(PluginInstallation).clear();
    await dataSource.getRepository(PluginVersion).clear();
    await dataSource.getRepository(Plugin).clear();
  });

  afterAll(async () => {
    for (const table of [
      'plugin_audit_event',
      'plugin_installation',
      'plugin_publication_project',
      'plugin_publication',
      'plugin_version',
      'plugin',
    ]) {
      await dataSource.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await dataSource.destroy();
  });

  const SECOND = new Date('2026-10-01T10:00:00Z');
  const SECOND_EARLIER = new Date('2026-10-01T09:59:59Z');

  async function givenPlugin(githubRepoId: string, scope: PluginPublicationScope, extra = {}) {
    const plugins = dataSource.getRepository(Plugin);
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId,
        repoOwner: 'owox',
        repoName: `plugin-${githubRepoId}`,
        repoHtmlUrl: `https://github.com/owox/plugin-${githubRepoId}`,
      })
    );
    const repository = dataSource.getRepository(PluginPublication);
    await repository.save(
      repository.create({
        pluginId: plugin.id,
        scope,
        uniquenessKey: `${scope}:${plugin.id}`,
        isActive: true,
        allProjects: false,
        ...extra,
      })
    );
    return plugin;
  }

  const record = async (
    pluginId: string,
    action: PluginAuditAction,
    authorityScope: PluginPublicationScope,
    createdAt: Date,
    over: Partial<PluginAuditEvent> = {}
  ) => {
    const events = dataSource.getRepository(PluginAuditEvent);
    const saved = await events.save(
      events.create({
        pluginId,
        action,
        authorityScope,
        projectId: 'P1',
        userId: 'viewer',
        createdAt,
        ...over,
      })
    );
    return saved.id;
  };

  async function seed() {
    const project = await givenPlugin('1', PluginPublicationScope.PROJECT, { projectId: 'P1' });
    const deployment = await givenPlugin('2', PluginPublicationScope.DEPLOYMENT, {
      allProjects: true,
    });
    const sameSecond = [
      PluginAuditAction.INSTALL,
      PluginAuditAction.UNINSTALL,
      PluginAuditAction.RESTORE,
      PluginAuditAction.UNINSTALL,
      PluginAuditAction.RESTORE,
    ];
    for (const action of sameSecond) {
      await record(project.id, action, PluginPublicationScope.MEMBER, SECOND);
    }
    const projectPublish = await record(
      project.id,
      PluginAuditAction.PUBLISH,
      PluginPublicationScope.PROJECT,
      SECOND_EARLIER,
      { userId: 'max' }
    );
    const deploymentPublish = await record(
      deployment.id,
      PluginAuditAction.PUBLISH,
      PluginPublicationScope.DEPLOYMENT,
      SECOND_EARLIER,
      { projectId: null, userId: 'admin' }
    );
    return { project, deployment, projectPublish, deploymentPublish };
  }

  // The query ListPluginHistoryService builds for a viewer in P1.
  async function query(over: Partial<PluginHistoryQuery>): Promise<PluginHistoryQuery> {
    const listed = await publications.findEverVisibleTo('P1', 'viewer');
    const pluginIds = [...new Set(listed.map(row => row.pluginId))];
    return {
      projectId: 'P1',
      userId: 'viewer',
      installations: true,
      publications: true,
      changes: true,
      deploymentPluginIds: [
        ...new Set(
          listed
            .filter(row => row.scope === PluginPublicationScope.DEPLOYMENT)
            .map(row => row.pluginId)
        ),
      ],
      relevantPluginIds: pluginIds,
      afterId: null,
      take: 100,
      ...over,
    };
  }

  it('pages same-second rows once each, in the unpaged order', async () => {
    await seed();
    const installations = { installations: true, publications: false, changes: false };
    const unpaged = (await audit.findHistory(await query(installations))).map(row => row.id);
    expect(unpaged).toHaveLength(5);

    const seen: string[] = [];
    let afterId: string | null = null;
    for (let pages = 0; pages < 5; pages++) {
      const rows = await audit.findHistory(await query({ ...installations, afterId, take: 3 }));
      const page = rows.slice(0, 2);
      seen.push(...page.map(row => row.id));
      if (rows.length <= 2) {
        break;
      }
      afterId = page[page.length - 1].id;
    }

    expect(seen).toEqual(unpaged);
  });

  it('shows the project publication and the deployment allProjects publication', async () => {
    const { projectPublish, deploymentPublish } = await seed();

    const ids = (await audit.findHistory(await query({}))).map(row => row.id);

    expect(ids).toEqual(expect.arrayContaining([projectPublish, deploymentPublish]));
  });

  it('answers a viewer with no relevant plugins without an empty IN ()', async () => {
    await seed();

    const rows = await audit.findHistory({
      ...(await query({})),
      userId: 'nobody',
      projectId: 'P9',
      deploymentPluginIds: [],
      relevantPluginIds: [],
    });

    expect(rows).toEqual([]);
  });

  it('finds both publications through findEverVisibleTo', async () => {
    const { project, deployment } = await seed();

    const listed = await publications.findEverVisibleTo('P1', 'viewer');

    expect(listed.map(row => row.pluginId).sort()).toEqual([project.id, deployment.id].sort());
  });
});
