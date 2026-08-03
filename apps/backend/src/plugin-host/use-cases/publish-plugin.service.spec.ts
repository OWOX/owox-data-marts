jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { AuthorizationContext } from '../../idp/types/auth.types';
import { PublishPluginCommand } from '../dto/domain/publish-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import {
  AudienceFormConflictError,
  NoEligiblePluginVersionError,
  PublicationAuthorizationError,
} from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginUpdateScheduleService } from '../services/plugin-update-schedule.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { PublishPluginService } from './publish-plugin.service';
import { SyncPluginReleasesService } from './sync-plugin-releases.service';

const PUBLISHER = {
  projectId: 'j1',
  userId: 'u1',
  apiKeyId: 'key-1',
  roles: ['admin'],
} as AuthorizationContext;

function setup() {
  const authorization = {
    assertMayManage: jest.fn(),
  } as unknown as jest.Mocked<PublicationAuthorizationService>;

  const sync = {
    run: jest.fn().mockResolvedValue({
      pluginId: 'p1',
      githubRepoId: '42',
      repository: 'OWOX/example-plugin',
      currentSemver: '1.0.0',
      currentVersionId: 'v1',
      report: {
        syncedAt: '2026-07-01T00:00:00.000Z',
        accessMode: 'anonymous',
        acceptedSemvers: ['1.0.0'],
        unchangedSemvers: [],
        rejections: [],
      },
    }),
  } as unknown as jest.Mocked<SyncPluginReleasesService>;

  const publications = {
    findByUniquenessKey: jest.fn().mockResolvedValue(null),
    create: jest.fn(input => Promise.resolve({ id: 'pub1', ...input })),
    activate: jest.fn().mockResolvedValue(undefined),
    listActiveAudience: jest.fn().mockResolvedValue([]),
    addToAudience: jest.fn().mockResolvedValue(undefined),
    removeFromAudience: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginPublicationService>;

  const pluginService = {
    findById: jest.fn().mockResolvedValue({
      id: 'p1',
      lastSyncReport: null,
    }),
  } as unknown as jest.Mocked<PluginService>;

  const versionService = {
    findById: jest.fn().mockResolvedValue({
      id: 'v1',
      semver: '1.0.0',
      deliveryUrl: 'https://plugin.example.com',
      commitSha: 'abc123',
    }),
  } as unknown as jest.Mocked<PluginVersionService>;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginAuditService>;

  const schedule = {
    ensureScheduled: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<PluginUpdateScheduleService>;

  return {
    service: new PublishPluginService(
      authorization,
      sync,
      publications,
      pluginService,
      versionService,
      audit,
      schedule
    ),
    authorization,
    sync,
    publications,
    audit,
    schedule,
  };
}

const publish = (
  s: ReturnType<typeof setup>,
  scope: PluginPublicationScope,
  audience = {},
  context = PUBLISHER
) => s.service.run(new PublishPluginCommand('OWOX/example-plugin', scope, context, audience));

const deployment = PluginPublicationScope.DEPLOYMENT;

describe('PublishPluginService', () => {
  describe('order of operations', () => {
    // Authorization is free; synchronization costs GitHub calls. Refusing first means a
    // caller with no authority cannot make us hammer GitHub on their behalf.
    it('authorizes before spending any github calls', async () => {
      const s = setup();
      s.authorization.assertMayManage.mockImplementation(() => {
        throw new PublicationAuthorizationError('deployment', 'nope');
      });

      await expect(publish(s, deployment, { allProjects: true })).rejects.toBeInstanceOf(
        PublicationAuthorizationError
      );
      expect(s.sync.run).not.toHaveBeenCalled();
    });

    it('rejects an illegal audience before synchronizing', async () => {
      const s = setup();

      await expect(publish(s, deployment, {})).rejects.toBeInstanceOf(AudienceFormConflictError);
      expect(s.sync.run).not.toHaveBeenCalled();
    });

    it('records an audit entry naming the authority used', async () => {
      const s = setup();

      await publish(s, deployment, { allProjects: true });

      expect(s.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginId: 'p1',
          action: PluginAuditAction.PUBLISH,
          authorityScope: deployment,
          apiKeyId: 'key-1',
        })
      );
    });
  });

  describe('deployment audience form', () => {
    it('refuses both forms in one command', async () => {
      const s = setup();

      await expect(
        publish(s, deployment, { projectIds: ['j1'], allProjects: true })
      ).rejects.toBeInstanceOf(AudienceFormConflictError);
    });

    // There is no implicit all-projects default: reaching every project must be typed out.
    it('refuses neither form', async () => {
      const s = setup();

      await expect(publish(s, deployment, {})).rejects.toBeInstanceOf(AudienceFormConflictError);
      await expect(publish(s, deployment, { projectIds: [] })).rejects.toBeInstanceOf(
        AudienceFormConflictError
      );
    });

    it('refuses an audience at project or member scope, where it means nothing', async () => {
      const s = setup();

      await expect(
        publish(s, PluginPublicationScope.PROJECT, { allProjects: true })
      ).rejects.toBeInstanceOf(AudienceFormConflictError);
    });
  });

  describe('selected-project audience', () => {
    it('adds projects to an existing audience rather than replacing it', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: true,
        allProjects: false,
      } as never);

      await publish(s, deployment, { projectIds: ['j2'] });

      expect(s.publications.addToAudience).toHaveBeenCalledWith('pub1', ['j2']);
      expect(s.publications.removeFromAudience).not.toHaveBeenCalled();
    });

    it('reports the resulting audience', async () => {
      const s = setup();
      s.publications.listActiveAudience.mockResolvedValue([
        { projectId: 'j1' },
        { projectId: 'j2' },
      ] as never);

      const result = await publish(s, deployment, { projectIds: ['j2'] });

      expect(result.audienceProjectIds).toEqual(['j1', 'j2']);
      expect(result.allProjects).toBe(false);
      expect(result.currentSemver).toBe('1.0.0');
      expect(result.diagnostics.deliveryUrl).toBe('https://plugin.example.com');
    });
  });

  // A Gallery listing with nothing installable is worse than a refused publish: members
  // would see a card they cannot use, with no version to confirm against.
  it('refuses to list a plugin with no eligible release', async () => {
    const s = setup();
    s.sync.run.mockResolvedValue({
      pluginId: 'p1',
      githubRepoId: '42',
      repository: 'OWOX/example-plugin',
      currentSemver: null,
      currentVersionId: null,
      report: {
        syncedAt: '2026-07-01T00:00:00.000Z',
        accessMode: 'anonymous',
        acceptedSemvers: [],
        unchangedSemvers: [],
        rejections: [
          {
            tagName: 'v1.0.0',
            githubReleaseId: '1',
            code: 'INVALID_TAG' as never,
            detail: 'not semver',
          },
        ],
      },
    });

    await expect(publish(s, deployment, { allProjects: true })).rejects.toBeInstanceOf(
      NoEligiblePluginVersionError
    );
    expect(s.publications.create).not.toHaveBeenCalled();
  });

  describe('wildcard audience', () => {
    // Switching forms is two explicit commands. Silently converting would quietly widen
    // a deliberately narrow audience to every project on the deployment.
    it('refuses to convert an active selected audience in one step', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: true,
        allProjects: false,
      } as never);

      await expect(publish(s, deployment, { allProjects: true })).rejects.toBeInstanceOf(
        AudienceFormConflictError
      );
    });

    // The destructive direction: without this the one command would drop the plugin from
    // every project except the ones it happens to name.
    it('refuses to narrow an active wildcard to selected projects in one step', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: true,
        allProjects: true,
      } as never);

      await expect(publish(s, deployment, { projectIds: ['j1'] })).rejects.toBeInstanceOf(
        AudienceFormConflictError
      );
      expect(s.publications.activate).not.toHaveBeenCalled();
      expect(s.publications.addToAudience).not.toHaveBeenCalled();
    });

    it('allows selected projects once the wildcard publication was unpublished', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: false,
        allProjects: true,
      } as never);

      await expect(publish(s, deployment, { projectIds: ['j1'] })).resolves.toMatchObject({
        allProjects: false,
      });
      expect(s.publications.addToAudience).toHaveBeenCalledWith('pub1', ['j1']);
    });

    it('allows the wildcard once the previous publication was unpublished', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: false,
        allProjects: false,
      } as never);

      await expect(publish(s, deployment, { allProjects: true })).resolves.toMatchObject({
        allProjects: true,
      });
    });

    // Otherwise a later switch back to selected projects would silently revive whatever
    // the audience contained before the wildcard.
    it('clears stale audience rows when the wildcard takes over', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: false,
        allProjects: false,
      } as never);

      await publish(s, deployment, { allProjects: true });

      expect(s.publications.removeFromAudience).toHaveBeenCalledWith('pub1');
      expect(s.publications.activate).toHaveBeenCalledWith('pub1', true);
    });
  });

  describe('project and member scope', () => {
    it('takes the project from the authenticated context, never from the request', async () => {
      const s = setup();

      await publish(s, PluginPublicationScope.PROJECT, {}, {
        ...PUBLISHER,
        projectId: 'mine',
      } as AuthorizationContext);

      expect(s.publications.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'mine', userId: null })
      );
    });

    it('binds a member publication to the caller', async () => {
      const s = setup();

      await publish(s, PluginPublicationScope.MEMBER, {}, {
        ...PUBLISHER,
        projectId: 'j9',
        userId: 'u9',
      } as AuthorizationContext);

      expect(s.publications.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'j9', userId: 'u9' })
      );
    });

    it('restores an unpublished publication instead of creating a duplicate', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: false,
        allProjects: false,
      } as never);

      const result = await publish(s, PluginPublicationScope.MEMBER);

      expect(s.publications.create).not.toHaveBeenCalled();
      expect(s.publications.activate).toHaveBeenCalledWith('pub1', false);
      expect(result.publicationId).toBe('pub1');
    });
  });
});
