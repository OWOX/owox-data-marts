jest.mock('@owox/idp-protocol', () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  IdpOperationNotSupportedError: class IdpOperationNotSupportedError extends Error {},
}));

import type { ProjectMemberInvitation } from '@owox/idp-protocol';
import { IdpProjectionsFacade } from './idp-projections.facade';
import { IdpProjectionsService } from '../services/idp-projections.service';
import { ProjectionsMapper } from '../mappers/projections.mapper';
import { ProjectMemberDto } from '../dto/domain/project-member.dto';

describe('IdpProjectionsFacade — member mutation proxies', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';
  const ACTOR_USER_ID = 'admin-42';

  let idpProjectionsService: jest.Mocked<
    Pick<
      IdpProjectionsService,
      | 'inviteMember'
      | 'removeMember'
      | 'changeMemberRole'
      | 'getProjectMembers'
      | 'listMembershipRequests'
      | 'approveMembershipRequest'
      | 'declineMembershipRequest'
      | 'getProjectForUser'
    >
  >;
  let facade: IdpProjectionsFacade;

  beforeEach(() => {
    idpProjectionsService = {
      inviteMember: jest.fn(),
      removeMember: jest.fn(),
      changeMemberRole: jest.fn(),
      getProjectMembers: jest.fn(),
      listMembershipRequests: jest.fn(),
      approveMembershipRequest: jest.fn(),
      declineMembershipRequest: jest.fn(),
      getProjectForUser: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        IdpProjectionsService,
        | 'inviteMember'
        | 'removeMember'
        | 'changeMemberRole'
        | 'getProjectMembers'
        | 'listMembershipRequests'
        | 'approveMembershipRequest'
        | 'declineMembershipRequest'
        | 'getProjectForUser'
      >
    >;

    facade = new IdpProjectionsFacade(
      idpProjectionsService as unknown as IdpProjectionsService,
      {} as ProjectionsMapper
    );
  });

  it('inviteMember — delegates to the service and returns its invitation result', async () => {
    const result: ProjectMemberInvitation = {
      projectId: PROJECT_ID,
      email: 'new@owox.io',
      role: 'editor',
      kind: 'email-sent',
      message: 'Invitation email sent',
    };
    idpProjectionsService.inviteMember.mockResolvedValue(result);

    const returned = await facade.inviteMember(PROJECT_ID, 'new@owox.io', 'editor', ACTOR_USER_ID);

    expect(idpProjectionsService.inviteMember).toHaveBeenCalledWith(
      PROJECT_ID,
      'new@owox.io',
      'editor',
      ACTOR_USER_ID
    );
    expect(returned).toBe(result);
  });

  it('inviteMember — propagates provider errors (no swallow)', async () => {
    idpProjectionsService.inviteMember.mockRejectedValue(new Error('IDP unavailable'));

    await expect(
      facade.inviteMember(PROJECT_ID, 'x@y.io', 'viewer', ACTOR_USER_ID)
    ).rejects.toThrow('IDP unavailable');
  });

  it('removeMember — delegates and returns void on success', async () => {
    idpProjectionsService.removeMember.mockResolvedValue(undefined);

    await expect(facade.removeMember(PROJECT_ID, USER_ID, ACTOR_USER_ID)).resolves.toBeUndefined();

    expect(idpProjectionsService.removeMember).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      ACTOR_USER_ID
    );
  });

  it('getProjectForUser — delegates to the service', async () => {
    const project = {
      id: 'project-1',
      title: 'Main Project',
      status: 'active' as const,
      roles: ['admin' as const],
      createdAt: '2026-06-01 12:30:45',
    };
    idpProjectionsService.getProjectForUser.mockResolvedValue(project);

    const returned = await facade.getProjectForUser(USER_ID, PROJECT_ID);

    expect(idpProjectionsService.getProjectForUser).toHaveBeenCalledWith(USER_ID, PROJECT_ID);
    expect(returned).toBe(project);
  });

  it('changeMemberRole — delegates with the new role', async () => {
    idpProjectionsService.changeMemberRole.mockResolvedValue(undefined);

    await facade.changeMemberRole(PROJECT_ID, USER_ID, 'admin', ACTOR_USER_ID);

    expect(idpProjectionsService.changeMemberRole).toHaveBeenCalledWith(
      PROJECT_ID,
      USER_ID,
      'admin',
      ACTOR_USER_ID
    );
  });

  describe('getProjectMember', () => {
    const member = (userId: string): ProjectMemberDto =>
      new ProjectMemberDto(userId, `${userId}@x.io`, userId, undefined, 'editor', false, false);

    it('returns the matching member from getProjectMembers', async () => {
      const list = [member('alice'), member('bob'), member('carol')];
      idpProjectionsService.getProjectMembers.mockResolvedValue(list);

      const found = await facade.getProjectMember(PROJECT_ID, 'bob');

      expect(found?.userId).toBe('bob');
      expect(idpProjectionsService.getProjectMembers).toHaveBeenCalledWith(PROJECT_ID);
    });

    it('returns undefined when no member matches the requested userId', async () => {
      idpProjectionsService.getProjectMembers.mockResolvedValue([member('alice')]);

      const found = await facade.getProjectMember(PROJECT_ID, 'ghost');

      expect(found).toBeUndefined();
    });

    it('returns undefined for an empty member list', async () => {
      idpProjectionsService.getProjectMembers.mockResolvedValue([]);

      expect(await facade.getProjectMember(PROJECT_ID, 'anyone')).toBeUndefined();
    });

    it('propagates upstream errors', async () => {
      idpProjectionsService.getProjectMembers.mockRejectedValue(new Error('IDP timeout'));

      await expect(facade.getProjectMember(PROJECT_ID, USER_ID)).rejects.toThrow('IDP timeout');
    });
  });

  describe('listMembershipRequests', () => {
    it('delegates to the projections service with actorUserId', async () => {
      const stub = [
        {
          requestId: 'r1',
          email: 'a@b.io',
          requestedRole: 'viewer' as const,
          createdAt: '2026-05-01',
        },
      ];
      idpProjectionsService.listMembershipRequests = jest.fn().mockResolvedValue(stub);

      const result = await facade.listMembershipRequests(PROJECT_ID, 'actor-1');

      expect(idpProjectionsService.listMembershipRequests).toHaveBeenCalledWith(
        PROJECT_ID,
        'actor-1'
      );
      expect(result).toEqual(stub);
    });
  });

  describe('approveMembershipRequest', () => {
    it('delegates with the correct argument order', async () => {
      const stubResult = { userId: 'u-1', email: 'a@b.io', role: 'editor' as const };
      idpProjectionsService.approveMembershipRequest = jest.fn().mockResolvedValue(stubResult);

      const result = await facade.approveMembershipRequest(
        PROJECT_ID,
        'req-1',
        'editor',
        ACTOR_USER_ID
      );

      expect(idpProjectionsService.approveMembershipRequest).toHaveBeenCalledWith(
        PROJECT_ID,
        'req-1',
        'editor',
        ACTOR_USER_ID
      );
      expect(result).toEqual(stubResult);
    });
  });

  describe('declineMembershipRequest', () => {
    it('delegates with the correct argument order', async () => {
      idpProjectionsService.declineMembershipRequest = jest.fn().mockResolvedValue(undefined);

      await facade.declineMembershipRequest(PROJECT_ID, 'req-1', ACTOR_USER_ID);

      expect(idpProjectionsService.declineMembershipRequest).toHaveBeenCalledWith(
        PROJECT_ID,
        'req-1',
        ACTOR_USER_ID
      );
    });
  });
});
