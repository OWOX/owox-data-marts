import { BadRequestException } from '@nestjs/common';
import { UserProjectionsListDto } from '../../idp/dto/domain/user-projections-list.dto';
import type { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import { ListPluginHistoryCommand } from '../dto/domain/list-plugin-history.command';
import type { PluginAuditEvent } from '../entities/plugin-audit-event.entity';
import type { PluginInstallation } from '../entities/plugin-installation.entity';
import type { PluginPublication } from '../entities/plugin-publication.entity';
import type { PluginVersion } from '../entities/plugin-version.entity';
import type { Plugin } from '../entities/plugin.entity';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { PluginPresentationMapper } from '../mappers/plugin-presentation.mapper';
import type { PluginAuditService } from '../services/plugin-audit.service';
import type { PluginInstallationService } from '../services/plugin-installation.service';
import type { PluginPublicationService } from '../services/plugin-publication.service';
import type { PluginVersionService } from '../services/plugin-version.service';
import type { PluginService } from '../services/plugin.service';
import { ListPluginHistoryService } from './list-plugin-history.service';

const context = { projectId: 'project-1', userId: 'viewer' } as AuthorizationContext;

const plugin = (over: Partial<Plugin> = {}): Plugin =>
  ({
    id: 'p1',
    repoOwner: 'acme',
    repoName: 'dashboards',
    isPrivateRepo: false,
    currentVersionId: 'v2',
    ...over,
  }) as Plugin;

const version = (id: string, semver: string, displayName = 'Dashboards'): PluginVersion =>
  ({ id, semver, displayName }) as PluginVersion;

let clock = 0;
const event = (over: Partial<PluginAuditEvent>): PluginAuditEvent =>
  ({
    id: `e${++clock}`,
    pluginId: 'p1',
    action: PluginAuditAction.INSTALL,
    authorityScope: PluginPublicationScope.MEMBER,
    projectId: 'project-1',
    userId: 'viewer',
    apiKeyId: null,
    beforeState: null,
    afterState: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, clock)),
    ...over,
  }) as PluginAuditEvent;

function setup(
  rows: PluginAuditEvent[],
  options: {
    plugins?: Plugin[];
    names?: Record<string, { fullName?: string | null; email?: string | null }>;
  } = {}
) {
  const audit = {
    findHistory: jest.fn().mockResolvedValue(rows),
    exists: jest.fn().mockResolvedValue(true),
  };
  const publications = {
    findEverVisibleTo: jest.fn().mockResolvedValue([
      { pluginId: 'p1', scope: PluginPublicationScope.PROJECT },
      { pluginId: 'p-verified', scope: PluginPublicationScope.DEPLOYMENT },
    ] as PluginPublication[]),
  };
  const installations = {
    findByMember: jest
      .fn()
      .mockResolvedValue([{ pluginId: 'p-installed' }] as PluginInstallation[]),
  };
  const plugins = { findByIds: jest.fn().mockResolvedValue(options.plugins ?? [plugin()]) };
  const versions = {
    findByIds: jest.fn().mockResolvedValue([version('v1', '1.0.0'), version('v2', '1.1.0')]),
  };
  const idp = {
    getUserProjectionList: jest.fn(
      async (ids: string[]) =>
        new UserProjectionsListDto(
          ids.flatMap(userId => {
            const known = options.names?.[userId];
            return known
              ? [{ userId, fullName: known.fullName ?? null, email: known.email ?? null }]
              : [];
          })
        )
    ),
  };
  const service = new ListPluginHistoryService(
    audit as unknown as PluginAuditService,
    publications as unknown as PluginPublicationService,
    installations as unknown as PluginInstallationService,
    plugins as unknown as PluginService,
    versions as unknown as PluginVersionService,
    new PluginPresentationMapper(),
    idp as unknown as IdpProjectionsFacade
  );
  return { service, audit, idp };
}

const run = (
  s: ReturnType<typeof setup>,
  type: 'all' | 'installations' | 'publications' = 'all',
  limit = 50,
  cursor: string | null = null
) => s.service.run(new ListPluginHistoryCommand(context, type, limit, cursor));

describe('ListPluginHistoryService', () => {
  it('asks the audit for every category the viewer may see', async () => {
    const s = setup([]);

    await run(s, 'all', 20, 'e9');

    expect(s.audit.findHistory).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'viewer',
      installations: true,
      publications: true,
      changes: true,
      deploymentPluginIds: ['p-verified'],
      relevantPluginIds: ['p1', 'p-verified', 'p-installed'],
      afterId: 'e9',
      take: 21,
    });
  });

  it.each([
    ['installations', { installations: true, publications: false, changes: false }],
    ['publications', { installations: false, publications: true, changes: false }],
  ] as const)('narrows the categories for %s', async (type, categories) => {
    const s = setup([]);

    await run(s, type);

    expect(s.audit.findHistory).toHaveBeenCalledWith(expect.objectContaining(categories));
  });

  it('rejects a cursor that matches no history entry', async () => {
    const s = setup([]);
    s.audit.exists.mockResolvedValue(false);

    await expect(run(s, 'all', 50, 'missing')).rejects.toBeInstanceOf(BadRequestException);
    expect(s.audit.findHistory).not.toHaveBeenCalled();
  });

  it('returns the last row of a full page as the next cursor', async () => {
    const rows = [event({}), event({}), event({})];
    const s = setup(rows);

    const page = await run(s, 'all', 2);

    expect(page.items.map(item => item.id)).toEqual([rows[0].id, rows[1].id]);
    expect(page.nextCursor).toBe(rows[1].id);
  });

  it('has no next cursor on the last page', async () => {
    const s = setup([event({})]);

    await expect(run(s, 'all', 2)).resolves.toMatchObject({ nextCursor: null });
  });

  it('skips a row whose plugin is gone but keeps paging past it', async () => {
    const rows = [event({}), event({ pluginId: 'gone' }), event({})];
    const s = setup(rows);

    const page = await run(s, 'all', 2);

    expect(page.items.map(item => item.id)).toEqual([rows[0].id]);
    expect(page.nextCursor).toBe(rows[1].id);
  });

  it('hides a no-op restore and a repeat uninstall but keeps the cursor on the raw page', async () => {
    const rows = [
      event({ action: PluginAuditAction.RESTORE, beforeState: { uninstalled: false } }),
      event({ action: PluginAuditAction.UNINSTALL, beforeState: { uninstalled: true } }),
      event({ action: PluginAuditAction.RESTORE, beforeState: { uninstalled: true } }),
    ];
    const s = setup(rows);

    const page = await run(s, 'all', 2);

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBe(rows[1].id);
  });

  it('shows rows written before beforeState existed', async () => {
    const s = setup([
      event({ action: PluginAuditAction.RESTORE }),
      event({ action: PluginAuditAction.UNINSTALL, beforeState: { uninstalled: false } }),
    ]);

    const page = await run(s);

    expect(page.items.map(item => item.action)).toEqual(['restore', 'uninstall']);
  });

  it('calls the viewer "you" and names a member of this project', async () => {
    const own = event({ action: PluginAuditAction.UNINSTALL });
    const published = event({
      action: PluginAuditAction.PUBLISH,
      authorityScope: PluginPublicationScope.PROJECT,
      userId: 'max',
    });
    const s = setup([own, published], { names: { max: { fullName: 'Max Voloshyn' } } });

    const page = await run(s);

    expect(page.items[0]).toMatchObject({
      action: 'uninstall',
      actor: { kind: 'you' },
      scope: null,
    });
    expect(page.items[1]).toMatchObject({
      action: 'publish',
      scope: 'project',
      actor: { kind: 'member', name: 'Max Voloshyn' },
    });
    expect(s.idp.getUserProjectionList).toHaveBeenCalledWith(['max']);
  });

  it('falls back to the email when the projection has no full name', async () => {
    const s = setup(
      [
        event({
          action: PluginAuditAction.PUBLISH,
          authorityScope: PluginPublicationScope.PROJECT,
          userId: 'max',
        }),
      ],
      { names: { max: { fullName: null, email: 'max@example.com' } } }
    );

    const page = await run(s);

    expect(page.items[0].actor).toEqual({ kind: 'member', name: 'max@example.com' });
  });

  it('leaves the actor out when the IDP has no projection', async () => {
    const s = setup([
      event({
        action: PluginAuditAction.PUBLISH,
        authorityScope: PluginPublicationScope.PROJECT,
        userId: 'left',
      }),
    ]);

    const page = await run(s);

    expect(page.items[0].actor).toBeNull();
  });

  it('does not name an actor from another project', async () => {
    const s = setup(
      [
        event({
          action: PluginAuditAction.UPDATE,
          projectId: 'project-2',
          userId: 'outsider',
          afterState: { currentVersionId: 'v2' },
        }),
      ],
      { names: { outsider: { fullName: 'Outsider' } } }
    );

    const page = await run(s);

    expect(page.items[0]).toMatchObject({ action: 'update', actor: null, version: '1.1.0' });
    expect(s.idp.getUserProjectionList).toHaveBeenCalledWith([]);
  });

  it('marks deployment publications and suspensions as the deployment', async () => {
    const s = setup([
      event({
        action: PluginAuditAction.PUBLISH,
        authorityScope: PluginPublicationScope.DEPLOYMENT,
        userId: 'admin',
        projectId: 'project-9',
      }),
      event({
        action: PluginAuditAction.SUSPEND,
        authorityScope: PluginPublicationScope.DEPLOYMENT,
        userId: 'viewer',
      }),
    ]);

    const page = await run(s);

    expect(page.items.map(item => item.actor)).toEqual([
      { kind: 'deployment' },
      { kind: 'deployment' },
    ]);
    expect(page.items[0].scope).toBe('deployment');
  });

  it('leaves an automatic update without an actor', async () => {
    const s = setup([
      event({
        action: PluginAuditAction.UPDATE,
        authorityScope: PluginPublicationScope.DEPLOYMENT,
        userId: null,
        projectId: null,
        afterState: { currentVersionId: 'v1' },
      }),
    ]);

    const page = await run(s);

    expect(page.items[0]).toMatchObject({ actor: null, version: '1.0.0' });
  });

  it('names a private repository by its owner', async () => {
    const s = setup([event({})], {
      plugins: [plugin({ isPrivateRepo: true, currentVersionId: null })],
    });

    const page = await run(s);

    expect(page.items[0].plugin).toEqual({
      pluginId: 'p1',
      displayName: 'acme',
      ownerName: 'acme',
    });
  });

  it('uses the current version display name', async () => {
    const s = setup([event({})]);

    const page = await run(s);

    expect(page.items[0].plugin.displayName).toBe('Dashboards');
  });
});
