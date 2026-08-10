jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { AuthorizationContext } from '../../idp/types/auth.types';
import { UnpublishPluginCommand } from '../dto/domain/publish-plugin.command';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';
import { AudienceFormConflictError } from '../errors/plugin-host.errors';
import { PluginAuditService } from '../services/plugin-audit.service';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { PluginVersionService } from '../services/plugin-version.service';
import { PluginService } from '../services/plugin.service';
import { PublicationAuthorizationService } from '../services/publication-authorization.service';
import { UnpublishPluginService } from './unpublish-plugin.service';

const PUBLISHER = {
  projectId: 'j1',
  userId: 'u1',
  apiKeyId: 'key-1',
  roles: ['admin'],
} as AuthorizationContext;
const deployment = PluginPublicationScope.DEPLOYMENT;

function setup() {
  const authorization = {
    assertMayManage: jest.fn(),
  } as unknown as jest.Mocked<PublicationAuthorizationService>;

  const pluginService = {
    findByRepoName: jest.fn().mockResolvedValue({
      id: 'p1',
      repoOwner: 'OWOX',
      repoName: 'example-plugin',
      currentVersionId: 'v1',
      lastSyncReport: null,
    }),
  } as unknown as jest.Mocked<PluginService>;

  const versionService = {
    findById: jest.fn().mockResolvedValue({
      id: 'v1',
      semver: '1.0.0',
      deliveryUrl: 'https://plugin.example.com',
      commitSha: 'abc',
    }),
  } as unknown as jest.Mocked<PluginVersionService>;

  const publications = {
    findByUniquenessKey: jest.fn().mockResolvedValue({
      id: 'pub1',
      isActive: true,
      allProjects: false,
    }),
    deactivate: jest.fn().mockResolvedValue(undefined),
    removeFromAudience: jest.fn().mockResolvedValue(undefined),
    listActiveAudience: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<PluginPublicationService>;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PluginAuditService>;

  return {
    service: new UnpublishPluginService(
      authorization,
      pluginService,
      versionService,
      publications,
      audit
    ),
    authorization,
    pluginService,
    publications,
    audit,
  };
}

const unpublish = (s: ReturnType<typeof setup>, scope: PluginPublicationScope, audience = {}) =>
  s.service.run(new UnpublishPluginCommand('OWOX/example-plugin', scope, PUBLISHER, audience));

describe('UnpublishPluginService', () => {
  // Unpublish is a local catalog op: it must not call GitHub, or a kill-switch style
  // withdrawal would fail exactly when upstream is the problem.
  it('resolves the plugin from cache, never from github', async () => {
    const s = setup();

    await unpublish(s, PluginPublicationScope.MEMBER);

    expect(s.pluginService.findByRepoName).toHaveBeenCalledWith('OWOX', 'example-plugin');
    expect(s.publications.deactivate).toHaveBeenCalledWith('pub1');
  });

  it('records an audit entry', async () => {
    const s = setup();

    await unpublish(s, PluginPublicationScope.MEMBER);

    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: PluginAuditAction.UNPUBLISH, pluginId: 'p1' })
    );
  });

  it('is idempotent on a publication that is already inactive', async () => {
    const s = setup();
    s.publications.findByUniquenessKey.mockResolvedValue({
      id: 'pub1',
      isActive: false,
      allProjects: false,
    } as never);

    await expect(unpublish(s, PluginPublicationScope.MEMBER)).resolves.toMatchObject({
      isActive: false,
    });
  });

  describe('selected-project audience', () => {
    it('removes only the named projects and leaves the rest published', async () => {
      const s = setup();
      s.publications.listActiveAudience.mockResolvedValue([{ projectId: 'j2' }] as never);

      const result = await unpublish(s, deployment, { projectIds: ['j1'] });

      expect(s.publications.removeFromAudience).toHaveBeenCalledWith('pub1', ['j1']);
      expect(s.publications.deactivate).not.toHaveBeenCalled();
      expect(result.isActive).toBe(true);
      expect(result.audienceProjectIds).toEqual(['j2']);
    });

    it('deactivates the publication once the last project leaves', async () => {
      const s = setup();
      s.publications.listActiveAudience.mockResolvedValue([]);

      const result = await unpublish(s, deployment, { projectIds: ['j1'] });

      expect(s.publications.deactivate).toHaveBeenCalledWith('pub1');
      expect(result.isActive).toBe(false);
    });

    it('takes the whole publication down when no projects are named', async () => {
      const s = setup();

      await unpublish(s, deployment, { allProjects: true });

      expect(s.publications.deactivate).toHaveBeenCalledWith('pub1');
    });
  });

  describe('wildcard indivisibility', () => {
    it('refuses to remove a single project from an all-projects publication', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: true,
        allProjects: true,
      } as never);

      await expect(unpublish(s, deployment, { projectIds: ['j1'] })).rejects.toBeInstanceOf(
        AudienceFormConflictError
      );
      expect(s.publications.removeFromAudience).not.toHaveBeenCalled();
      expect(s.publications.deactivate).not.toHaveBeenCalled();
    });

    it('accepts taking the wildcard publication down as a whole', async () => {
      const s = setup();
      s.publications.findByUniquenessKey.mockResolvedValue({
        id: 'pub1',
        isActive: true,
        allProjects: true,
      } as never);

      await expect(unpublish(s, deployment, { allProjects: true })).resolves.toMatchObject({
        isActive: false,
      });
    });
  });

  it('reports a plugin that was never published rather than failing obscurely', async () => {
    const s = setup();
    s.pluginService.findByRepoName.mockResolvedValue(null);

    await expect(unpublish(s, PluginPublicationScope.MEMBER)).rejects.toMatchObject({
      code: 'PLUGIN_NOT_PUBLISHED',
    });
  });
});
