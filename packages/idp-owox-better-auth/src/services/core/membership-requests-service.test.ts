import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { IdentityOwoxClient } from '../../client/index.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { AccessRequestEmailService } from '../email/access-request-email-service.js';
import { MembershipRequestsService } from './membership-requests-service.js';

function createIdentityClientMock(): jest.Mocked<IdentityOwoxClient> {
  return {
    getToken: jest.fn(),
    revokeToken: jest.fn(),
    introspectToken: jest.fn(),
    getProjects: jest.fn(),
    getJwks: jest.fn(),
    completeAuthFlow: jest.fn(),
    getProjectMembers: jest.fn(),
    inviteProjectMember: jest.fn(),
    removeProjectMember: jest.fn(),
    changeProjectMemberRole: jest.fn(),
    listProjectMembershipRequests: jest.fn(),
    approveProjectMembershipRequest: jest.fn(),
    declineProjectMembershipRequest: jest.fn(),
  } as unknown as jest.Mocked<IdentityOwoxClient>;
}

describe('MembershipRequestsService', () => {
  let identityClient: jest.Mocked<IdentityOwoxClient>;
  let store: { getUserByBiUserId: jest.Mock<DatabaseStore['getUserByBiUserId']> };
  let emailService: {
    sendApprovalToRequester: jest.Mock<AccessRequestEmailService['sendApprovalToRequester']>;
  };
  let service: MembershipRequestsService;

  beforeEach(() => {
    identityClient = createIdentityClientMock();
    store = {
      getUserByBiUserId: jest.fn<DatabaseStore['getUserByBiUserId']>(async () => ({
        id: 'local-1',
        email: 'alice@example.com',
      })),
    };
    emailService = {
      sendApprovalToRequester: jest.fn<AccessRequestEmailService['sendApprovalToRequester']>(
        async () => undefined
      ),
    };
    service = new MembershipRequestsService(
      identityClient,
      store as unknown as DatabaseStore,
      emailService as unknown as AccessRequestEmailService
    );
  });

  describe('listMembershipRequests', () => {
    it('calls client with projectId and actorUserId and maps response to ProjectMembershipRequest[]', async () => {
      identityClient.listProjectMembershipRequests.mockResolvedValue([
        {
          requestId: 'req-1',
          email: 'alice@example.com',
          requestedRole: 'viewer',
          createdAt: '2026-05-01T10:00:00.000Z',
          fullName: 'Alice Example',
          avatar: 'https://example.com/alice.png',
          userId: 'uid-alice',
        },
        {
          requestId: 'req-2',
          email: 'bob@example.com',
          requestedRole: 'editor',
          createdAt: '2026-05-03T15:30:00.000Z',
        },
      ]);

      const result = await service.listMembershipRequests('proj-1', 'admin-1');

      expect(identityClient.listProjectMembershipRequests).toHaveBeenCalledWith(
        'proj-1',
        'admin-1'
      );
      expect(result).toHaveLength(2);

      expect(result[0]).toEqual({
        requestId: 'req-1',
        email: 'alice@example.com',
        requestedRole: 'viewer',
        createdAt: '2026-05-01T10:00:00.000Z',
        fullName: 'Alice Example',
        avatar: 'https://example.com/alice.png',
        userId: 'uid-alice',
      });

      // requestedRole is cast to Role
      expect(result[1]!.requestedRole).toBe('editor');

      // optional fields absent in raw response are undefined on the mapped object
      expect(result[1]!.fullName).toBeUndefined();
      expect(result[1]!.avatar).toBeUndefined();
      expect(result[1]!.userId).toBeUndefined();
    });

    it('normalizes null avatar from upstream to undefined', async () => {
      identityClient.listProjectMembershipRequests.mockResolvedValue([
        {
          requestId: 'req-3',
          email: 'carol@example.com',
          requestedRole: 'viewer',
          createdAt: '2026-05-05T09:00:00.000Z',
          fullName: 'Carol Example',
          avatar: null as unknown as string | undefined,
          userId: 'uid-carol',
        },
      ]);

      const [mapped] = await service.listMembershipRequests('proj-1', 'admin-1');

      expect(mapped!.avatar).toBeUndefined();
    });

    it('propagates client errors', async () => {
      identityClient.listProjectMembershipRequests.mockRejectedValue(new Error('upstream error'));
      await expect(service.listMembershipRequests('proj-1', 'admin-1')).rejects.toThrow(
        'upstream error'
      );
    });
  });

  describe('approveMembershipRequest', () => {
    beforeEach(() => {
      // Keeps the background approval email out of tests that do not check it.
      jest.spyOn(service, 'notifyRequester').mockResolvedValue(undefined);
    });

    it('calls client with correct args and returns { userId: userUid }', async () => {
      identityClient.approveProjectMembershipRequest.mockResolvedValue({ userUid: 'resolved-uid' });

      const result = await service.approveMembershipRequest('proj-1', 'req-1', 'editor', 'admin-1');

      expect(identityClient.approveProjectMembershipRequest).toHaveBeenCalledWith(
        'proj-1',
        'req-1',
        'editor',
        'admin-1'
      );
      expect(result).toEqual({ userId: 'resolved-uid' });
    });

    it('propagates client errors', async () => {
      identityClient.approveProjectMembershipRequest.mockRejectedValue(new Error('IDP refused'));
      await expect(
        service.approveMembershipRequest('proj-1', 'req-1', 'viewer', 'admin-1')
      ).rejects.toThrow('IDP refused');
    });

    it('emails the approved person with the granted role, without waiting for the email', async () => {
      identityClient.approveProjectMembershipRequest.mockResolvedValue({ userUid: 'resolved-uid' });
      const notify = jest
        .spyOn(service, 'notifyRequester')
        .mockReturnValue(new Promise(() => undefined));

      await expect(
        service.approveMembershipRequest('proj-1', 'req-1', 'editor', 'admin-1')
      ).resolves.toEqual({ userId: 'resolved-uid' });
      expect(notify).toHaveBeenCalledWith('proj-1', 'resolved-uid', 'editor');
    });

    it('emails nobody when Identity refuses the approval', async () => {
      identityClient.approveProjectMembershipRequest.mockRejectedValue(new Error('IDP refused'));
      const notify = jest.spyOn(service, 'notifyRequester').mockResolvedValue(undefined);

      await expect(
        service.approveMembershipRequest('proj-1', 'req-1', 'viewer', 'admin-1')
      ).rejects.toThrow('IDP refused');
      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('notifyRequester', () => {
    it('sends the approval email to the local user email', async () => {
      await service.notifyRequester('proj-1', 'resolved-uid', 'editor');

      expect(store.getUserByBiUserId).toHaveBeenCalledWith('resolved-uid');
      expect(emailService.sendApprovalToRequester).toHaveBeenCalledWith({
        requesterEmail: 'alice@example.com',
        role: 'editor',
        projectId: 'proj-1',
      });
      expect(identityClient.getProjectMembers).not.toHaveBeenCalled();
    });

    it('falls back to the project members from Identity', async () => {
      store.getUserByBiUserId.mockResolvedValue(null);
      identityClient.getProjectMembers.mockResolvedValue({
        project: { projectId: 'proj-1', projectTitle: 'Acme' },
        projectMembers: [
          {
            userId: 42,
            userStatus: 'active',
            fullName: 'Alice',
            email: 'alice@identity.example.com',
            projectRole: 'editor',
          },
        ],
      });

      await service.notifyRequester('proj-1', '42', 'editor');

      expect(emailService.sendApprovalToRequester).toHaveBeenCalledWith(
        expect.objectContaining({ requesterEmail: 'alice@identity.example.com' })
      );
    });

    it('never throws when the email cannot be found or sent', async () => {
      store.getUserByBiUserId.mockResolvedValue(null);
      identityClient.getProjectMembers.mockRejectedValue(new Error('Identity unavailable'));
      await expect(service.notifyRequester('proj-1', '42', 'viewer')).resolves.toBeUndefined();
      expect(emailService.sendApprovalToRequester).not.toHaveBeenCalled();

      store.getUserByBiUserId.mockResolvedValue({ id: 'local-1', email: 'alice@example.com' });
      emailService.sendApprovalToRequester.mockRejectedValue(new Error('SendGrid responded 500'));
      await expect(service.notifyRequester('proj-1', '42', 'viewer')).resolves.toBeUndefined();
    });
  });

  describe('declineMembershipRequest', () => {
    it('calls client with projectId, requestId and actorUserId', async () => {
      identityClient.declineProjectMembershipRequest.mockResolvedValue(undefined);

      await service.declineMembershipRequest('proj-1', 'req-1', 'admin-1');

      expect(identityClient.declineProjectMembershipRequest).toHaveBeenCalledWith(
        'proj-1',
        'req-1',
        'admin-1'
      );
      expect(emailService.sendApprovalToRequester).not.toHaveBeenCalled();
    });

    it('resolves void on success', async () => {
      identityClient.declineProjectMembershipRequest.mockResolvedValue(undefined);
      await expect(
        service.declineMembershipRequest('proj-1', 'req-1', 'admin-1')
      ).resolves.toBeUndefined();
    });

    it('propagates client errors', async () => {
      identityClient.declineProjectMembershipRequest.mockRejectedValue(new Error('network fail'));
      await expect(service.declineMembershipRequest('proj-1', 'req-1', 'admin-1')).rejects.toThrow(
        'network fail'
      );
    });
  });
});
