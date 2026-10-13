import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { UserProjectionsListDto } from 'src/idp/dto/domain/user-projections-list.dto';
import { IdpProjectionsFacade } from 'src/idp/facades/idp-projections.facade';
import { PLUGIN_RUNTIME_AUTHORIZER } from 'src/idp/ports/plugin-runtime-authorizer.port';
import { IdpProviderService } from 'src/idp/services/idp-provider.service';
import { AuthorizationContext } from 'src/idp/types/auth.types';
import { ListPluginHistoryCommand } from 'src/plugin-host/dto/domain/list-plugin-history.command';
import { PluginAuditEvent } from 'src/plugin-host/entities/plugin-audit-event.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginPublicationProject } from 'src/plugin-host/entities/plugin-publication-project.entity';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginAuditAction } from 'src/plugin-host/enums/plugin-audit-action.enum';
import { PluginPublicationScope } from 'src/plugin-host/enums/plugin-publication-scope.enum';
import { ListPluginHistoryService } from 'src/plugin-host/use-cases/list-plugin-history.service';
import * as supertest from 'supertest';
import { Repository } from 'typeorm';

const P1 = 'history-project-1';
const P2 = 'history-project-2';

describe('Plugin history (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let audits: Repository<PluginAuditEvent>;
  const ids: Record<string, string> = {};
  let clock = Date.UTC(2026, 9, 1);

  const payloads: Record<string, object> = {
    viewer: { userId: 'viewer', projectId: P1, roles: ['viewer'], authFlow: 'app_owox' },
    fresh: {
      userId: 'fresh',
      projectId: 'history-project-3',
      roles: ['viewer'],
      authFlow: 'app_owox',
    },
    plugin: {
      userId: 'viewer',
      projectId: P1,
      roles: ['viewer'],
      authFlow: 'plugin',
      pluginId: 'any',
      installationId: 'any',
    },
  };

  const history = (
    userId: string,
    projectId: string,
    type: 'all' | 'installations' | 'publications' = 'all',
    limit = 50,
    cursor: string | null = null
  ) =>
    app
      .get(ListPluginHistoryService)
      .run(
        new ListPluginHistoryCommand(
          { userId, projectId } as AuthorizationContext,
          type,
          limit,
          cursor
        )
      );

  async function seedPlugin(key: string, over: Partial<Plugin> = {}): Promise<string> {
    const plugins = app.get<Repository<Plugin>>(getRepositoryToken(Plugin));
    const versions = app.get<Repository<PluginVersion>>(getRepositoryToken(PluginVersion));
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: `history-${key}`,
        repoOwner: 'acme',
        repoName: `history-${key}`,
        repoHtmlUrl: `https://github.com/acme/history-${key}`,
        ...over,
      })
    );
    const version = await versions.save(
      versions.create({
        pluginId: plugin.id,
        semver: '1.0.0',
        commitSha: 'a'.repeat(40),
        githubReleaseId: `history-${key}`,
        tagName: 'v1.0.0',
        displayName: `Plugin ${key}`,
        description: key,
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com',
        releasePublishedAt: new Date(),
        collections: [],
      })
    );
    await plugins.update(plugin.id, { currentVersionId: version.id });
    ids[key] = plugin.id;
    return plugin.id;
  }

  async function event(
    key: string,
    over: Partial<PluginAuditEvent>,
    at = new Date((clock += 60_000))
  ) {
    const saved = await audits.save(
      audits.create({
        pluginId: ids[key],
        action: PluginAuditAction.INSTALL,
        authorityScope: PluginPublicationScope.MEMBER,
        projectId: P1,
        userId: 'viewer',
        createdAt: at,
        ...over,
      })
    );
    return saved.id;
  }

  async function publication(
    key: string,
    over: Partial<PluginPublication>,
    audience: { projectId: string; isActive: boolean }[] = []
  ) {
    const publications = app.get<Repository<PluginPublication>>(
      getRepositoryToken(PluginPublication)
    );
    const audiences = app.get<Repository<PluginPublicationProject>>(
      getRepositoryToken(PluginPublicationProject)
    );
    const saved = await publications.save(
      publications.create({
        pluginId: ids[key],
        scope: PluginPublicationScope.PROJECT,
        uniquenessKey: `history:${key}:${String(over.scope)}:${String(over.userId)}`,
        projectId: P1,
        userId: null,
        allProjects: false,
        isActive: true,
        ...over,
      })
    );
    for (const row of audience) {
      await audiences.save(audiences.create({ publicationId: saved.id, ...row }));
    }
  }

  async function installation(key: string, projectId: string, userId: string) {
    const installations = app.get<Repository<PluginInstallation>>(
      getRepositoryToken(PluginInstallation)
    );
    await installations.save(
      installations.create({ pluginId: ids[key], projectId, userId, installedAt: new Date() })
    );
  }

  const expected: Record<string, string> = {};

  beforeAll(async () => {
    const testApp = await createTestApp([
      {
        provide: IdpProviderService,
        useValue: { getProvider: () => ({ parseToken: async (token: string) => payloads[token] }) },
      },
      { provide: PLUGIN_RUNTIME_AUTHORIZER, useValue: { assertActiveInstallation: jest.fn() } },
    ]);
    app = testApp.app;
    agent = testApp.agent;
    audits = app.get(getRepositoryToken(PluginAuditEvent));
    jest
      .spyOn(app.get(IdpProjectionsFacade), 'getUserProjectionList')
      .mockImplementation(
        async userIds =>
          new UserProjectionsListDto(
            userIds.map(userId => ({ userId, fullName: `Name of ${userId}`, email: null }))
          )
      );

    // A: project publication in P1 by max; viewer installed it; three kinds of update.
    await seedPlugin('A');
    await publication('A', { scope: PluginPublicationScope.PROJECT, projectId: P1 });
    await installation('A', P1, 'viewer');
    expected.publishA = await event('A', {
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.PROJECT,
      userId: 'max',
    });
    expected.installA = await event('A', { action: PluginAuditAction.INSTALL });
    expected.updateByMax = await event('A', {
      action: PluginAuditAction.UPDATE,
      authorityScope: PluginPublicationScope.MEMBER,
      userId: 'max',
      afterState: { currentVersionId: null },
    });
    expected.updateByOutsider = await event('A', {
      action: PluginAuditAction.UPDATE,
      authorityScope: PluginPublicationScope.MEMBER,
      projectId: P2,
      userId: 'outsider',
    });
    expected.updateAutomatic = await event('A', {
      action: PluginAuditAction.UPDATE,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: null,
      userId: null,
    });
    expected.suspendA = await event('A', {
      action: PluginAuditAction.SUSPEND,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: 'admin-project',
      userId: 'admin',
    });
    expected.updateByViewer = await event('A', {
      action: PluginAuditAction.UPDATE,
      authorityScope: PluginPublicationScope.MEMBER,
      afterState: { currentVersionId: null },
    });
    expected.resumeA = await event('A', {
      action: PluginAuditAction.RESUME,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: 'admin-project',
      userId: 'admin',
    });
    expected.unpublishA = await event('A', {
      action: PluginAuditAction.UNPUBLISH,
      authorityScope: PluginPublicationScope.PROJECT,
      userId: 'max',
    });
    await event('A', {
      action: PluginAuditAction.UPDATE_CHECK,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: null,
      userId: null,
    });
    // max's own installation in P1 is not the viewer's.
    await event('A', { action: PluginAuditAction.INSTALL, userId: 'max' });

    // B: published in another project only.
    await seedPlugin('B');
    await publication('B', { scope: PluginPublicationScope.PROJECT, projectId: P2 });
    await event('B', {
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.PROJECT,
      projectId: P2,
      userId: 'outsider',
    });
    await event('B', {
      action: PluginAuditAction.SUSPEND,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: 'admin-project',
      userId: 'admin',
    });

    // C: the viewer's own member publication counts; max's member publication does not.
    await seedPlugin('C');
    await publication('C', {
      scope: PluginPublicationScope.MEMBER,
      projectId: P1,
      userId: 'viewer',
    });
    expected.publishC = await event('C', {
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.MEMBER,
    });
    await event('C', {
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.MEMBER,
      userId: 'max',
    });

    // D: deployment publication whose audience row for P1 is withdrawn still counts (accepted approximation).
    await seedPlugin('D');
    await publication(
      'D',
      { scope: PluginPublicationScope.DEPLOYMENT, projectId: null, isActive: false },
      [{ projectId: P1, isActive: false }]
    );
    expected.publishD = await event('D', {
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: 'admin-project',
      userId: 'admin',
    });

    // E: deployment publication for P2 only.
    await seedPlugin('E');
    await publication('E', { scope: PluginPublicationScope.DEPLOYMENT, projectId: null }, [
      { projectId: P2, isActive: true },
    ]);
    await event('E', {
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: 'admin-project',
      userId: 'admin',
    });

    // G: deployment publication to all projects, with no audience rows.
    await seedPlugin('G');
    await publication('G', {
      scope: PluginPublicationScope.DEPLOYMENT,
      projectId: null,
      allProjects: true,
    });
    expected.publishG = await event('G', {
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.DEPLOYMENT,
      projectId: 'admin-project',
      userId: 'admin',
    });

    // F: three installation events of the same second.
    await seedPlugin('F');
    await installation('F', P1, 'viewer');
    const second = new Date((clock += 60_000));
    expected.tie1 = await event('F', { action: PluginAuditAction.INSTALL }, second);
    expected.tie2 = await event('F', { action: PluginAuditAction.UNINSTALL }, second);
    expected.tie3 = await event('F', { action: PluginAuditAction.RESTORE }, second);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('shows exactly the events the viewer may see, newest first', async () => {
    const page = await history('viewer', P1);

    expect(new Set(page.items.map(item => item.id))).toEqual(
      new Set([
        expected.publishA,
        expected.installA,
        expected.updateByMax,
        expected.updateByOutsider,
        expected.updateAutomatic,
        expected.suspendA,
        expected.updateByViewer,
        expected.resumeA,
        expected.unpublishA,
        expected.publishC,
        expected.publishD,
        expected.publishG,
        expected.tie1,
        expected.tie2,
        expected.tie3,
      ])
    );
    const times = page.items.map(item => item.occurredAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(page.nextCursor).toBeNull();
  });

  it('names only members of the viewer project', async () => {
    const byId = new Map((await history('viewer', P1)).items.map(item => [item.id, item]));

    expect(byId.get(expected.publishA)?.actor).toEqual({ kind: 'member', name: 'Name of max' });
    expect(byId.get(expected.updateByMax)?.actor).toEqual({ kind: 'member', name: 'Name of max' });
    expect(byId.get(expected.updateByOutsider)?.actor).toBeNull();
    expect(byId.get(expected.updateAutomatic)?.actor).toBeNull();
    expect(byId.get(expected.suspendA)?.actor).toEqual({ kind: 'deployment' });
    expect(byId.get(expected.publishD)).toMatchObject({
      scope: 'deployment',
      actor: { kind: 'deployment' },
    });
    expect(byId.get(expected.publishC)?.actor).toEqual({ kind: 'you' });
    expect(byId.get(expected.updateByViewer)?.actor).toEqual({ kind: 'you' });
    expect(byId.get(expected.resumeA)?.actor).toEqual({ kind: 'deployment' });
  });

  it('filters installations and publications', async () => {
    const installations = await history('viewer', P1, 'installations');
    const publications = await history('viewer', P1, 'publications');

    expect(new Set(installations.items.map(item => item.id))).toEqual(
      new Set([expected.installA, expected.tie1, expected.tie2, expected.tie3])
    );
    expect(new Set(publications.items.map(item => item.id))).toEqual(
      new Set([
        expected.publishA,
        expected.publishC,
        expected.publishD,
        expected.publishG,
        expected.unpublishA,
      ])
    );
  });

  it('pages through events of the same second without repeats or gaps', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await history('viewer', P1, 'installations', 2, cursor);
      seen.push(...page.items.map(item => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    const unpaged = await history('viewer', P1, 'installations');
    expect(seen).toHaveLength(4);
    expect(seen).toEqual(unpaged.items.map(item => item.id));
  });

  it('shows a viewer with no history only the all-projects listing', async () => {
    const page = await history('fresh', 'history-project-3');

    expect(page.items.map(item => item.id)).toEqual([expected.publishG]);
    expect(page.nextCursor).toBeNull();
  });

  const get = (token: string, query = '') =>
    agent.get(`/api/plugins/history${query}`).set('x-owox-authorization', token);

  it('serves the feed over HTTP', async () => {
    const response = await get('viewer', '?type=publications').expect(200);

    expect(response.body.nextCursor).toBeNull();
    expect(response.body.items).toHaveLength(5);
    expect(
      response.body.items.find((item: { id: string }) => item.id === expected.publishA)
    ).toMatchObject({
      action: 'publish',
      scope: 'project',
      plugin: { pluginId: ids.A, displayName: 'Plugin A', ownerName: 'acme' },
      actor: { kind: 'member', name: 'Name of max' },
      version: null,
      occurredAt: expect.any(String),
    });
  });

  it('refuses a plugin runtime token', async () => {
    await get('plugin').expect(403);
  });

  it.each([
    ['an unknown type', '?type=everything'],
    ['a zero limit', '?limit=0'],
    ['a cursor that is not a UUID', '?cursor=abc'],
    ['a cursor that matches no entry', '?cursor=1b4e28ba-2fa1-11d2-883f-0016d3cca427'],
  ])('answers 400 for %s', async (_case, query) => {
    await get('viewer', query).expect(400);
  });
});
