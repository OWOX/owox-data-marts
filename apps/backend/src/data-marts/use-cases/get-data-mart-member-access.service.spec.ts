jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { GetDataMartMemberAccessService } from './get-data-mart-member-access.service';
import { GetDataMartMemberAccessCommand } from '../dto/domain/get-data-mart-member-access.command';
import { AccessDecisionService, DataMartAccessReason } from '../services/access-decision';
import { RoleScope } from '../enums/role-scope.enum';
import { DataMartMemberOwnership } from '../dto/domain/data-mart-member-access.dto';

describe('GetDataMartMemberAccessService', () => {
  const projectId = 'project-1';

  function member(userId: string, role: string, isOutbound = false) {
    return {
      userId,
      email: `${userId}@example.com`,
      displayName: `User ${userId}`,
      avatarUrl: undefined,
      role,
      hasNotificationsEnabled: true,
      isOutbound,
    };
  }

  function setup(options: {
    dataMart?: Partial<{
      contextIds: string[];
      technicalOwnerIds: string[];
      businessOwnerIds: string[];
      availableForReporting: boolean;
      availableForMaintenance: boolean;
    }>;
    members: ReturnType<typeof member>[];
    scopes: Record<string, RoleScope>;
    memberContexts: Record<string, string[]>;
  }) {
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({
        id: 'dm-1',
        contextIds: ['ctx-paid-ads'],
        technicalOwnerIds: [],
        businessOwnerIds: [],
        availableForReporting: true,
        availableForMaintenance: true,
        ...options.dataMart,
      }),
    };
    const idpProjectionsFacade = {
      getProjectMembersOrThrow: jest.fn().mockResolvedValue(options.members),
    };
    // `list` already leaves out deleted contexts, so `ctx-deleted` is never listed.
    const contextService = {
      list: jest.fn().mockResolvedValue([
        { id: 'ctx-paid-ads', name: 'Paid ads' },
        { id: 'ctx-seo', name: 'SEO' },
      ]),
    };
    const contextAccessService = {
      getRoleScope: jest.fn((userId: string) => Promise.resolve(options.scopes[userId])),
      getMemberContextIds: jest.fn((userId: string) =>
        Promise.resolve(options.memberContexts[userId] ?? [])
      ),
    };
    // The real decision: its explanation is pure and reads only the access matrix.
    const unused = {} as never;
    const accessDecisionService = new AccessDecisionService(
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused
    );

    const service = new GetDataMartMemberAccessService(
      dataMartService as never,
      idpProjectionsFacade as never,
      contextService as never,
      contextAccessService as never,
      accessDecisionService
    );

    return { service, dataMartService, idpProjectionsFacade };
  }

  const run = (service: GetDataMartMemberAccessService) =>
    service.run(new GetDataMartMemberAccessCommand('dm-1', projectId));

  it('explains each member, with the names of their live contexts', async () => {
    const { service, dataMartService } = setup({
      members: [
        member('admin-1', 'admin'),
        member('in-context', 'viewer'),
        member('other-context', 'viewer'),
        member('project-wide', 'viewer'),
      ],
      scopes: {
        'admin-1': RoleScope.ENTIRE_PROJECT,
        'in-context': RoleScope.SELECTED_CONTEXTS,
        'other-context': RoleScope.SELECTED_CONTEXTS,
        'project-wide': RoleScope.ENTIRE_PROJECT,
      },
      memberContexts: {
        'in-context': ['ctx-paid-ads', 'ctx-deleted'],
        'other-context': ['ctx-seo'],
      },
    });

    const result = await run(service);

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', projectId);
    expect(result.map(m => [m.userId, m.see.granted, m.see.reason])).toEqual([
      ['admin-1', true, DataMartAccessReason.PROJECT_ADMIN],
      ['in-context', true, DataMartAccessReason.SHARED_CONTEXT],
      ['other-context', false, DataMartAccessReason.NO_SHARED_CONTEXT],
      ['project-wide', true, DataMartAccessReason.PROJECT_WIDE_ACCESS],
    ]);
    expect(result[1]).toMatchObject({
      email: 'in-context@example.com',
      displayName: 'User in-context',
      role: 'viewer',
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contexts: [{ id: 'ctx-paid-ads', name: 'Paid ads' }],
    });
  });

  it('treats a Data Mart whose only context was deleted as having no context', async () => {
    const { service } = setup({
      dataMart: { contextIds: ['ctx-deleted'] },
      members: [member('limited', 'viewer')],
      scopes: { limited: RoleScope.SELECTED_CONTEXTS },
      memberContexts: { limited: ['ctx-deleted', 'ctx-seo'] },
    });

    const [result] = await run(service);

    expect(result).toMatchObject({
      see: { granted: false, reason: DataMartAccessReason.DATA_MART_HAS_NO_CONTEXT },
      ownership: null,
      contexts: [{ id: 'ctx-seo', name: 'SEO' }],
    });
  });

  it('applies ownership, sharing and role to each action group', async () => {
    const { service } = setup({
      dataMart: {
        availableForReporting: false,
        availableForMaintenance: true,
        technicalOwnerIds: ['owner'],
        businessOwnerIds: ['data-owner'],
      },
      members: [
        member('owner', 'viewer'),
        member('business-user', 'viewer'),
        member('data-owner', 'editor'),
      ],
      scopes: {
        owner: RoleScope.SELECTED_CONTEXTS,
        'business-user': RoleScope.ENTIRE_PROJECT,
        'data-owner': RoleScope.ENTIRE_PROJECT,
      },
      memberContexts: {},
    });

    const result = await run(service);

    const levels = result.map(m => [
      m.userId,
      m.ownership,
      [m.see.granted, m.see.reason],
      [m.edit.granted, m.edit.reason],
      [m.configureSharing.granted, m.configureSharing.reason],
    ]);
    expect(levels).toEqual([
      [
        'owner',
        DataMartMemberOwnership.DATA_OWNER,
        [true, DataMartAccessReason.OWNER],
        [false, DataMartAccessReason.ROLE_REQUIRED],
        [false, DataMartAccessReason.ROLE_REQUIRED],
      ],
      [
        'business-user',
        null,
        [false, DataMartAccessReason.NOT_SHARED],
        [false, DataMartAccessReason.ROLE_REQUIRED],
        [false, DataMartAccessReason.ROLE_REQUIRED],
      ],
      [
        'data-owner',
        DataMartMemberOwnership.BUSINESS_OWNER,
        [true, DataMartAccessReason.OWNER],
        [true, DataMartAccessReason.PROJECT_WIDE_ACCESS],
        [false, DataMartAccessReason.OWNER_REQUIRED],
      ],
    ]);
  });

  it('leaves out people who are no longer in the project', async () => {
    const { service } = setup({
      members: [member('current', 'viewer'), member('former', 'viewer', true)],
      scopes: { current: RoleScope.ENTIRE_PROJECT, former: RoleScope.ENTIRE_PROJECT },
      memberContexts: {},
    });

    const result = await run(service);

    expect(result.map(m => m.userId)).toEqual(['current']);
  });

  it('fails instead of reporting that nobody can see the Data Mart when members cannot be read', async () => {
    const { service, idpProjectionsFacade } = setup({
      members: [],
      scopes: {},
      memberContexts: {},
    });
    idpProjectionsFacade.getProjectMembersOrThrow.mockRejectedValue(new Error('IDP unavailable'));

    await expect(run(service)).rejects.toThrow('IDP unavailable');
  });
});
