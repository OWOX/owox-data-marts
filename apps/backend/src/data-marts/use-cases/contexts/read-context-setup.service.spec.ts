jest.mock('../../services/data-mart.service', () => ({ DataMartService: jest.fn() }));
jest.mock('../../services/context/context-reference-guard', () => ({
  contextRevision: jest.fn().mockResolvedValue(1),
  contextImpactDigest: jest.fn().mockReturnValue('digest'),
}));
jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReadContextSetupService } from './read-context-setup.service';
import { ContextSetupMapper } from '../../mappers/context-setup.mapper';
import { ContextSetupActor } from '../../dto/domain/mcp-context-setup.dto';
import { RoleScope } from '../../enums/role-scope.enum';
import { EntityType, OwnerStatus } from '../../services/access-decision/access-decision.types';

const actor: ContextSetupActor = { projectId: 'project', userId: 'editor', roles: ['editor'] };
const admin: ContextSetupActor = { ...actor, roles: ['admin'] };
const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  createQueryBuilder: jest.fn(),
});

function build() {
  const contexts = repo();
  contexts.findOne.mockResolvedValue({
    id: 'context',
    projectId: 'project',
    name: 'Marketing',
    description: 'Full description',
  });
  const resources = [repo(), repo(), repo(), repo()];
  for (const resource of resources) {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    resource.createQueryBuilder.mockReturnValue(qb);
  }
  const bindings = [repo(), repo(), repo(), repo()];
  const members = repo();
  const defaults = repo();
  const idp = {
    getProjectMembersOrThrow: jest
      .fn()
      .mockResolvedValue([
        { userId: 'member', email: 'member@example.com', role: 'editor', displayName: undefined },
      ]),
  };
  const contextAccess = {
    getReadOnlyMemberScope: jest
      .fn()
      .mockResolvedValue({ roleScope: RoleScope.ENTIRE_PROJECT, contextIds: [] }),
  };
  const settings = {
    getDefaultSettings: jest
      .fn()
      .mockResolvedValue({ roleScope: RoleScope.SELECTED_CONTEXTS, contextIds: ['context'] }),
  };
  const access = {
    canAccessStored: jest.fn().mockResolvedValue(true),
    getOwnerStatus: jest.fn().mockResolvedValue(OwnerStatus.NON_OWNER),
  };
  const service = new ReadContextSetupService(
    contexts as never,
    ...(resources as [never, never, never, never]),
    ...(bindings as [never, never, never, never]),
    members as never,
    defaults as never,
    idp as never,
    contextAccess as never,
    settings as never,
    access as never,
    new ContextSetupMapper()
  );
  return {
    service,
    contexts,
    resources,
    bindings,
    members,
    defaults,
    idp,
    contextAccess,
    settings,
    access,
  };
}

describe('ReadContextSetupService', () => {
  it('returns complete Context metadata and visible attachments without editor administration data', async () => {
    const s = build();
    s.resources[0].createQueryBuilder().getMany.mockResolvedValue([
      {
        id: 'attached',
        title: 'Attached',
        contexts: [{ contextId: 'context', context: { id: 'context' } }],
      },
      { id: 'other', title: 'Other', contexts: [] },
    ]);
    const result = await s.service.getContext(actor, 'context');
    expect(result.description).toBe('Full description');
    expect(result.revision).toBe(1);
    expect(result.resources.map(resource => resource.id)).toEqual(['attached']);
    expect(result.memberAssignments).toBeNull();
    expect(result.actions).toEqual({
      canEdit: false,
      canManageMembers: false,
      canInspectImpact: false,
    });
    expect(s.idp.getProjectMembersOrThrow).not.toHaveBeenCalled();
  });

  it('returns admin member assignments while keeping scope separate from membership', async () => {
    const s = build();
    s.members.find.mockResolvedValue([{ userId: 'member', contextId: 'context' }]);
    const result = await s.service.getContext(admin, 'context');
    expect(result.actions.canManageMembers).toBe(true);
    expect(result.memberAssignments?.[0].administration).toMatchObject({
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });
  });

  it('reads stored provisioning defaults with an project configuration revision', async () => {
    const s = build();
    await expect(s.service.getDefaults(admin)).resolves.toEqual({
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['context'],
      revision: 1,
      revisionAggregate: 'project_context_configuration',
      effect: 'new_members_only',
    });
  });

  it('rejects missing actor and viewer before repository/IdP access', async () => {
    const s = build();
    for (const invalid of [
      { ...actor, userId: ' ' },
      { ...actor, roles: ['viewer'] as ContextSetupActor['roles'] },
    ]) {
      await expect(s.service.listMembers(invalid, { limit: 10, offset: 0 })).rejects.toThrow(
        ForbiddenException
      );
    }
    expect(s.idp.getProjectMembersOrThrow).not.toHaveBeenCalled();
  });

  it('allows editor member discovery without exposing assignments or materializing defaults', async () => {
    const s = build();
    const result = await s.service.listMembers(actor, { limit: 10, offset: 0 });
    expect(result).toEqual([
      {
        userId: 'member',
        email: 'member@example.com',
        displayName: null,
        role: 'editor',
        administration: null,
      },
    ]);
    expect(s.contextAccess.getReadOnlyMemberScope).not.toHaveBeenCalled();
  });

  it('propagates identity discovery failures', async () => {
    const s = build();
    s.idp.getProjectMembersOrThrow.mockRejectedValue(new Error('identity unavailable'));
    await expect(s.service.listMembers(actor, { limit: 10, offset: 0 })).rejects.toThrow(
      'identity unavailable'
    );
  });

  it('keeps admin scope project-wide and shows no admin Context restriction', async () => {
    const s = build();
    s.idp.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'member', email: 'member@example.com', role: 'admin', displayName: undefined },
    ]);
    const result = await s.service.listMembers(admin, { limit: 10, offset: 0 });
    expect(result[0].administration).toMatchObject({
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });
    expect(s.contextAccess.getReadOnlyMemberScope).not.toHaveBeenCalled();
  });

  it.each(['getDefaults', 'getImpact'] as const)(
    'requires admin for %s before reading administration details',
    async method => {
      const s = build();
      await expect(s.service[method](actor, 'context')).rejects.toThrow(ForbiddenException);
      expect(s.contexts.findOne).not.toHaveBeenCalled();
      expect(s.settings.getDefaultSettings).not.toHaveBeenCalled();
    }
  );

  it('checks Context project isolation', async () => {
    const s = build();
    s.contexts.findOne.mockResolvedValue(null);
    await expect(s.service.getContext(actor, 'foreign')).rejects.toThrow(NotFoundException);
    expect(s.contexts.findOne).toHaveBeenCalledWith({
      where: { id: 'foreign', projectId: 'project' },
    });
  });

  it('reports every deletion blocker, including Credentials, assignments and defaults', async () => {
    const s = build();
    s.bindings.forEach((binding, i) => binding.count.mockResolvedValue(i + 1));
    s.members.find.mockResolvedValue([{ userId: 'member', contextId: 'context' }]);
    s.defaults.count.mockResolvedValue(1);
    s.contextAccess.getReadOnlyMemberScope.mockResolvedValue({
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['context'],
    });
    const impact = await s.service.getImpact(admin, 'context');
    expect(impact.blockers).toEqual({
      dataMartCount: 1,
      storageCount: 2,
      destinationCount: 3,
      credentialCount: 4,
      memberCount: 1,
      userProvisioningDefaultsCount: 1,
    });
    expect(impact.detached).toBe(false);
    expect(impact.affectedMemberIds).toEqual(['member']);
    expect(impact.requiredActions).toContain('detach_credentials');
    expect(impact.requiredActions).toContain('reassign_provisioning_defaults');
    expect(impact.revision).toBe(1);
  });

  it('does not report admins or removed members as losing Context-limited access', async () => {
    const s = build();
    s.members.find.mockResolvedValue([
      { userId: 'member', contextId: 'context' },
      { userId: 'removed', contextId: 'context' },
    ]);
    s.idp.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'member', email: 'member@example.com', role: 'admin', displayName: undefined },
    ]);
    const impact = await s.service.getImpact(admin, 'context');
    expect(impact.blockers.memberCount).toBe(2);
    expect(impact.affectedMemberIds).toEqual([]);
    expect(s.contextAccess.getReadOnlyMemberScope).not.toHaveBeenCalled();
  });

  it('includes unassigned resources but filters invisible resources before pagination and returns owner authority', async () => {
    const s = build();
    s.resources[0].createQueryBuilder().getMany.mockResolvedValue([
      { id: 'hidden', title: 'Hidden', contexts: [] },
      { id: 'visible', title: 'Unassigned', contexts: [], definition: { secret: 'never return' } },
    ]);
    s.access.canAccessStored.mockImplementation(
      async (_user, _roles, _type, id) => id !== 'hidden'
    );
    s.access.getOwnerStatus.mockResolvedValue(OwnerStatus.TECH_OWNER);
    const result = await s.service.listResources(actor, { type: 'DATA_MART', limit: 1, offset: 0 });
    expect(result).toEqual([
      {
        id: 'visible',
        title: 'Unassigned',
        type: 'DATA_MART',
        contextIds: [],
        canSetContexts: true,
        revision: 1,
        revisionAggregate: 'project_context_configuration',
      },
    ]);
    expect(s.access.canAccessStored).toHaveBeenCalledWith(
      'editor',
      ['editor'],
      EntityType.DATA_MART,
      'visible',
      'SEE',
      'project'
    );
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('does not confuse maintenance access with Context assignment authority', async () => {
    const s = build();
    s.resources[1]
      .createQueryBuilder()
      .getMany.mockResolvedValue([{ id: 'storage', title: 'Storage', contexts: [] }]);
    const result = await s.service.listResources(actor, { type: 'STORAGE', limit: 10, offset: 0 });
    expect(result[0].canSetContexts).toBe(false);
  });
});
