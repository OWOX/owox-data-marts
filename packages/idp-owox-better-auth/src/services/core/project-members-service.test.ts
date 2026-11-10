import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ProjectMember } from '@owox/idp-protocol';
import type { IdentityOwoxClient } from '../../client/index.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { ProjectMembersServiceOptions } from '../../types/project-members.js';
import type { ProjectInvitationEmailService } from '../email/project-invitation-email-service.js';
import { ProjectMembersService } from './project-members-service.js';

// Mock types
interface MockOwoxProjectMembersResponse {
  project: {
    projectId: string;
    projectTitle: string;
  };
  projectMembers: Array<{
    userId: number;
    userStatus: 'active' | 'locked' | 'erased';
    fullName: string;
    email: string;
    avatar?: string | null;
    projectRole: string;
    subscriptions?: {
      serviceNotifications?: boolean;
    };
  }>;
}

function createStoreMock(): jest.Mocked<DatabaseStore> {
  return {
    initialize: jest.fn(),
    ensureVerificationIdLength: jest.fn(),
    isHealthy: jest.fn(),
    cleanupExpiredSessions: jest.fn(),
    shutdown: jest.fn(),
    getAdapter: jest.fn(),
    getUserById: jest.fn(),
    getUserByBiUserId: jest.fn(),
    getUserByEmail: jest.fn(),
    getAccountByUserId: jest.fn(),
    getAccountsByUserId: jest.fn(),
    getAccountByUserIdAndProvider: jest.fn(),
    updateUserLastLoginMethod: jest.fn(),
    updateUserFirstLoginMethod: jest.fn(),
    updateUserBiUserId: jest.fn(),
    findActiveMagicLink: jest.fn(),
    saveAuthState: jest.fn(),
    getAuthState: jest.fn(),
    deleteAuthState: jest.fn(),
    purgeExpiredAuthStates: jest.fn(),
    // Project members storage methods - using UPSERT, data is never deleted
    saveProjectMembers: jest.fn(), // Uses UPSERT, preserves historical data
    getProjectMembers: jest.fn(), // Returns all members including outbound
    getProjectSyncInfo: jest.fn(), // Returns expires_at and updated_at from project table
    // Onboarding questionnaire
    saveOnboardingAnswers: jest.fn(),
    hasOnboardingAnswers: jest.fn(),
    getOnboardingAnswers: jest.fn(),
  } as unknown as jest.Mocked<DatabaseStore>;
}

function createIdentityClientMock(): jest.Mocked<IdentityOwoxClient> {
  return {
    getToken: jest.fn(),
    revokeToken: jest.fn(),
    introspectToken: jest.fn(),
    getProjects: jest.fn(),
    getProjectForUser: jest.fn(),
    getJwks: jest.fn(),
    completeAuthFlow: jest.fn(),
    getProjectMembers: jest.fn(),
    inviteProjectMember: jest.fn(),
    removeProjectMember: jest.fn(),
    changeProjectMemberRole: jest.fn(),
  } as unknown as jest.Mocked<IdentityOwoxClient>;
}

function createInvitationEmailServiceMock(): jest.Mocked<ProjectInvitationEmailService> {
  return {
    send: jest.fn<ProjectInvitationEmailService['send']>(async () => undefined),
  } as unknown as jest.Mocked<ProjectInvitationEmailService>;
}

function createMockMember(overrides: Partial<ProjectMember> = {}): ProjectMember {
  return {
    userId: '1',
    email: 'user@example.com',
    fullName: 'Test User',
    avatar: 'https://example.com/avatar.png',
    projectRole: 'viewer',
    userStatus: 'active',
    hasNotificationsEnabled: true,
    isOutbound: false,
    ...overrides,
  };
}

function createMockOwoxResponse(
  overrides: Partial<MockOwoxProjectMembersResponse> = {}
): MockOwoxProjectMembersResponse {
  return {
    project: {
      projectId: 'project-1',
      projectTitle: 'Test Project',
    },
    projectMembers: [
      {
        userId: 1,
        userStatus: 'active',
        fullName: 'Test User',
        email: 'user@example.com',
        avatar: 'https://example.com/avatar.png',
        projectRole: 'viewer',
        subscriptions: {
          serviceNotifications: true,
        },
      },
    ],
    ...overrides,
  };
}

// Helper to create future date
function createFutureDate(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

// Helper to create past date
function createPastDate(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

describe('ProjectMembersService', () => {
  let store: jest.Mocked<DatabaseStore>;
  let identityClient: jest.Mocked<IdentityOwoxClient>;
  let service: ProjectMembersService;

  beforeEach(() => {
    store = createStoreMock();
    identityClient = createIdentityClientMock();

    const options: ProjectMembersServiceOptions = {
      ttlSeconds: 900, // 15 minutes
      owoxClientTimeoutMs: 5000,
    };

    service = new ProjectMembersService(
      store,
      identityClient,
      createInvitationEmailServiceMock(),
      options
    );
  });

  describe('getMembers', () => {
    it('should return stored data when data is fresh (expires_at in future)', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [
        createMockMember({ userId: '1', isOutbound: false }),
        createMockMember({ userId: '2', isOutbound: true, userStatus: 'active' }),
      ];

      store.getProjectMembers.mockResolvedValue(storedMembers);
      // Data is fresh - expires in the future
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createFutureDate(10), // expires in 10 minutes
        updatedAt: new Date(),
      });

      // Act - forceFresh: false to check TTL-based logic
      const result = await service.getMembers(projectId, { forceFresh: false });

      // Assert
      expect(store.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.getProjectSyncInfo).toHaveBeenCalledWith(projectId);
      expect(identityClient.getProjectMembers).not.toHaveBeenCalled();
      // Should return ALL members including outbound
      expect(result).toHaveLength(2);
      expect(result[0]?.userId).toBe('1');
      expect(result[1]?.userId).toBe('2');
    });

    it('should fetch from OWOX Client when data is expired (expires_at in past)', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [createMockMember({ userId: 'old-user' })];
      const owoxResponse = createMockOwoxResponse({
        projectMembers: [
          {
            userId: 999,
            userStatus: 'active',
            fullName: 'New User',
            email: 'new@example.com',
            projectRole: 'admin',
          },
        ],
      });

      store.getProjectMembers.mockResolvedValue(storedMembers);
      // Data is expired - expired 10 minutes ago
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createPastDate(10),
        updatedAt: createPastDate(20),
      });
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act - forceFresh: false to check TTL-based logic
      const result = await service.getMembers(projectId, { forceFresh: false });

      // Assert
      expect(store.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.getProjectSyncInfo).toHaveBeenCalledWith(projectId);
      expect(identityClient.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.saveProjectMembers).toHaveBeenCalled();
      // Should return ALL members including the new active member and the old outbound member
      expect(result).toHaveLength(2);
      const activeMember = result.find(m => m.userId === '999');
      const outboundMember = result.find(m => m.userId === 'old-user');
      expect(activeMember).toBeDefined();
      expect(activeMember?.isOutbound).toBe(false);
      expect(outboundMember).toBeDefined();
      expect(outboundMember?.isOutbound).toBe(true);
    });

    it('should fetch from OWOX Client when no stored data exists', async () => {
      // Arrange
      const projectId = 'project-1';
      const owoxResponse = createMockOwoxResponse();

      store.getProjectMembers.mockResolvedValue(null);
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act
      const result = await service.getMembers(projectId);

      // Assert
      expect(store.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(identityClient.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.saveProjectMembers).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]?.userId).toBe('1');
    });

    it('should always fetch from OWOX Client when forceFresh is true', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [createMockMember()];
      const owoxResponse = createMockOwoxResponse();

      store.getProjectMembers.mockResolvedValue(storedMembers);
      // Even though data is fresh, forceFresh should override and trigger refresh with fallback
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createFutureDate(10),
        updatedAt: new Date(),
      });
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act
      const result = await service.getMembers(projectId, { forceFresh: true });

      // Assert
      // getProjectMembers is called to get existing data for soft-delete logic
      expect(store.getProjectMembers).toHaveBeenCalledWith(projectId);
      // getProjectSyncInfo is NOT called when forceFresh is true with existing data
      expect(store.getProjectSyncInfo).not.toHaveBeenCalled();
      expect(identityClient.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.saveProjectMembers).toHaveBeenCalled();
      // Returns fresh data
      expect(result).toHaveLength(1);
      expect(result[0]?.userId).toBe('1');
    });

    it('should return all members including outbound when data is fresh', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [
        createMockMember({ userId: 'active-user', isOutbound: false }),
        createMockMember({ userId: 'outbound-user', isOutbound: true, userStatus: 'active' }),
      ];

      store.getProjectMembers.mockResolvedValue(storedMembers);
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createFutureDate(10),
        updatedAt: new Date(),
      });

      // Act
      const result = await service.getMembers(projectId);

      // Assert - should return ALL members including outbound
      expect(result).toHaveLength(2);
      expect(result[0]?.userId).toBe('active-user');
      expect(result[0]?.isOutbound).toBe(false);
      expect(result[1]?.userId).toBe('outbound-user');
      expect(result[1]?.isOutbound).toBe(true);
    });

    it('should handle empty OWOX Client response and save empty result', async () => {
      // Arrange
      const projectId = 'project-1';
      const owoxResponse = createMockOwoxResponse({ projectMembers: [] });

      store.getProjectMembers.mockResolvedValue(null);
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act
      const result = await service.getMembers(projectId);

      // Assert
      expect(result).toHaveLength(0);
      expect(store.saveProjectMembers).toHaveBeenCalledWith(projectId, [], 900);
    });

    it('should return stale data when OWOX Client is unavailable', async () => {
      // Arrange
      const projectId = 'project-1';
      const staleMembers = [
        createMockMember({ userId: 'stale-user', isOutbound: false }),
        createMockMember({ userId: 'outbound-stale', isOutbound: true, userStatus: 'active' }),
      ];

      store.getProjectMembers.mockResolvedValue(staleMembers);
      // Data is expired
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createPastDate(5),
        updatedAt: createPastDate(15),
      });
      // OWOX Client throws error
      identityClient.getProjectMembers.mockRejectedValue(new Error('Connection timeout'));

      // Act
      const result = await service.getMembers(projectId);

      // Assert - should return ALL stale members (including outbound) for graceful degradation
      expect(result).toHaveLength(2);
      expect(result[0]?.userId).toBe('stale-user');
      expect(result[1]?.userId).toBe('outbound-stale');
    });
  });

  describe('soft-delete logic', () => {
    it('should mark removed members as outbound when refreshing from OWOX Client', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [
        createMockMember({ userId: '1', isOutbound: false }),
        createMockMember({ userId: '2', isOutbound: false, email: 'user2@example.com' }),
      ];
      // OWOX Client response only has user-1 (userId: 1)
      const owoxResponse = createMockOwoxResponse({
        projectMembers: [
          {
            userId: 1,
            userStatus: 'active',
            fullName: 'User One',
            email: 'user1@example.com',
            projectRole: 'viewer',
          },
        ],
      });

      store.getProjectMembers.mockResolvedValue(storedMembers);
      // Data is expired to trigger refresh
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createPastDate(5),
        updatedAt: createPastDate(15),
      });
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act
      const result = await service.getMembers(projectId);

      // Assert
      // Verify saveProjectMembers was called with both members
      // (active user-1 and outbound user-2)
      const saveCall = store.saveProjectMembers.mock.calls[0];
      expect(saveCall).toBeDefined();
      const savedMembers = saveCall![1] as ProjectMember[];

      expect(savedMembers).toHaveLength(2);

      const activeMember = savedMembers.find(m => m.userId === '1');
      const outboundMember = savedMembers.find(m => m.userId === '2');

      expect(activeMember).toBeDefined();
      expect(activeMember?.isOutbound).toBe(false);
      expect(activeMember?.userStatus).toBe('active');

      expect(outboundMember).toBeDefined();
      expect(outboundMember?.isOutbound).toBe(true);
      expect(outboundMember?.userStatus).toBe('active');

      // Result should return ALL members (including outbound)
      expect(result).toHaveLength(2);
    });
  });

  describe('historical data preservation', () => {
    it('should preserve all historical members including outbound ones', async () => {
      // Arrange
      const projectId = 'project-1';
      // Current user with userId '1' (matching OWOX Client response)
      // Former-user is initially active but will be marked outbound since not in OWOX response
      const storedMembers = [
        createMockMember({ userId: '1', email: 'current@example.com', isOutbound: false }),
        createMockMember({ userId: 'former-user', email: 'former@example.com', isOutbound: false }),
      ];
      // OWOX Client response has userId 1 (becomes '1' after String())
      // Note: former-user is NOT in the OWOX response, so should become outbound
      const owoxResponse = createMockOwoxResponse({
        projectMembers: [
          {
            userId: 1,
            userStatus: 'active',
            fullName: 'Current User',
            email: 'current@example.com',
            projectRole: 'admin',
          },
        ],
      });

      store.getProjectMembers.mockResolvedValue(storedMembers);
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createPastDate(5),
        updatedAt: createPastDate(15),
      });
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act
      const result = await service.getMembers(projectId);

      // Assert
      // Verify that saveProjectMembers marks the former-user as outbound
      // while updating the current-user (userId '1' matches OWOX response)
      const saveCall = store.saveProjectMembers.mock.calls[0];
      expect(saveCall).toBeDefined();
      const savedMembers = saveCall![1] as ProjectMember[];

      // Should have both members: current (updated) + former (now outbound)
      expect(savedMembers).toHaveLength(2);

      const currentMember = savedMembers.find(m => m.userId === '1');
      const formerMember = savedMembers.find(m => m.userId === 'former-user');

      expect(currentMember).toBeDefined();
      expect(currentMember?.isOutbound).toBe(false);
      expect(currentMember?.projectRole).toBe('admin');
      expect(formerMember).toBeDefined();
      expect(formerMember?.isOutbound).toBe(true);
      expect(formerMember?.userStatus).toBe('active');

      // Result should return ALL members
      expect(result).toHaveLength(2);
    });

    it('should update existing member data while preserving historical records', async () => {
      // Arrange
      const projectId = 'project-1';
      const existingMember = createMockMember({
        userId: '1',
        email: 'user@example.com',
        projectRole: 'viewer',
        isOutbound: false,
      });
      const storedMembers = [existingMember];

      // OWOX Client returns same user but with updated role
      const owoxResponse = createMockOwoxResponse({
        projectMembers: [
          {
            userId: 1,
            userStatus: 'active',
            fullName: 'Updated User',
            email: 'user@example.com',
            projectRole: 'admin', // Role changed from viewer to admin
          },
        ],
      });

      store.getProjectMembers.mockResolvedValue(storedMembers);
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createPastDate(5),
        updatedAt: createPastDate(15),
      });
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act
      const result = await service.getMembers(projectId);

      // Assert
      const saveCall = store.saveProjectMembers.mock.calls[0];
      expect(saveCall).toBeDefined();
      const savedMembers = saveCall![1] as ProjectMember[];

      expect(savedMembers).toHaveLength(1);
      expect(savedMembers[0]?.userId).toBe('1');
      expect(savedMembers[0]?.projectRole).toBe('admin'); // Role updated
      expect(savedMembers[0]?.isOutbound).toBe(false);

      // Result should return the updated member
      expect(result).toHaveLength(1);
      expect(result[0]?.projectRole).toBe('admin');
    });
  });

  // Java upstream only returns {userUid}. We synthesise the rest locally and
  // forward userUid through `userId` so the controller can attach scope+contexts
  // immediately. These tests pin that mapping down so future refactors can't
  // silently drop the userId.
  describe('inviteMember', () => {
    function setup(options: ProjectMembersServiceOptions = {}) {
      const store = createStoreMock();
      const identityClient = createIdentityClientMock();
      const invitationEmailService = createInvitationEmailServiceMock();
      identityClient.inviteProjectMember.mockResolvedValue({ userUid: 'new-user-uid' });
      identityClient.getProjectForUser.mockResolvedValue({ id: 'project-1', title: 'Acme' });
      store.getUserByBiUserId.mockResolvedValue({ id: 'u-1', email: 'admin@example.com' });
      const service = new ProjectMembersService(
        store,
        identityClient,
        invitationEmailService,
        options
      );
      return { store, identityClient, invitationEmailService, service };
    }

    it('invites through Identity and emails the invited person', async () => {
      const { identityClient, invitationEmailService, service } = setup();

      const result = await service.inviteMember(
        'project-1',
        'new@example.com',
        'editor',
        'admin-1'
      );

      expect(identityClient.inviteProjectMember).toHaveBeenCalledWith(
        'project-1',
        'new@example.com',
        'editor',
        'admin-1'
      );
      expect(identityClient.getProjectForUser).toHaveBeenCalledWith('admin-1', 'project-1');
      expect(invitationEmailService.send).toHaveBeenCalledWith({
        email: 'new@example.com',
        role: 'editor',
        projectId: 'project-1',
        projectTitle: 'Acme',
        inviterEmail: 'admin@example.com',
      });
      expect(result).toEqual({
        projectId: 'project-1',
        email: 'new@example.com',
        role: 'editor',
        kind: 'email-sent',
        userId: 'new-user-uid',
        emailDelivered: true,
        message: 'Invitation email sent to new@example.com',
      });
    });

    it('takes the inviter email from the stored project members when there is no local user', async () => {
      const { store, invitationEmailService, service } = setup();
      store.getUserByBiUserId.mockResolvedValue(null);
      store.getProjectMembers.mockResolvedValue([
        createMockMember({ userId: 'admin-1', email: 'member-admin@example.com' }),
      ]);

      await service.inviteMember('project-1', 'new@example.com', 'viewer', 'admin-1');

      expect(invitationEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ inviterEmail: 'member-admin@example.com' })
      );
    });

    it('still sends the email when the project title and inviter cannot be loaded', async () => {
      const { store, identityClient, invitationEmailService, service } = setup();
      identityClient.getProjectForUser.mockRejectedValue(new Error('identity down'));
      store.getUserByBiUserId.mockRejectedValue(new Error('db down'));

      await service.inviteMember('project-1', 'new@example.com', 'admin', 'admin-1');

      expect(invitationEmailService.send).toHaveBeenCalledWith({
        email: 'new@example.com',
        role: 'admin',
        projectId: 'project-1',
        projectTitle: undefined,
        inviterEmail: undefined,
      });
    });

    it('does not wait long for a slow project title lookup', async () => {
      const { identityClient, invitationEmailService, service } = setup({
        invitationLookupTimeoutMs: 10,
      });
      identityClient.getProjectForUser.mockReturnValue(new Promise(() => undefined));

      await service.inviteMember('project-1', 'new@example.com', 'editor', 'admin-1');

      expect(invitationEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ projectTitle: undefined, inviterEmail: 'admin@example.com' })
      );
    });

    it('keeps the invitation when the email cannot be sent and tells the admin', async () => {
      const { invitationEmailService, service } = setup();
      invitationEmailService.send.mockRejectedValue(new Error('SendGrid responded 500'));

      const result = await service.inviteMember(
        'project-1',
        'new@example.com',
        'editor',
        'admin-1'
      );

      expect(result).toEqual(
        expect.objectContaining({
          kind: 'email-sent',
          userId: 'new-user-uid',
          emailDelivered: false,
          message:
            'new@example.com was invited, but the invitation email could not be sent. Please let them know yourself.',
        })
      );
    });

    it('propagates upstream failure and sends no email', async () => {
      const { identityClient, invitationEmailService, service } = setup();
      identityClient.inviteProjectMember.mockRejectedValue(new Error('upstream 500'));

      await expect(
        service.inviteMember('project-1', 'x@y.io', 'viewer', 'admin-1')
      ).rejects.toThrow('upstream 500');
      expect(invitationEmailService.send).not.toHaveBeenCalled();
    });
  });

  describe('removeMember / changeMemberRole', () => {
    it('delegates removeMember to the client forwarding the actor user id', async () => {
      const store = createStoreMock();
      const identityClient = createIdentityClientMock();
      identityClient.removeProjectMember.mockResolvedValue(undefined);

      const service = new ProjectMembersService(
        store,
        identityClient,
        createInvitationEmailServiceMock()
      );
      await service.removeMember('project-1', 'user-42', 'admin-1');

      expect(identityClient.removeProjectMember).toHaveBeenCalledWith(
        'project-1',
        'user-42',
        'admin-1'
      );
    });

    it('delegates changeMemberRole to the client forwarding the actor user id', async () => {
      const store = createStoreMock();
      const identityClient = createIdentityClientMock();
      identityClient.changeProjectMemberRole.mockResolvedValue(undefined);

      const service = new ProjectMembersService(
        store,
        identityClient,
        createInvitationEmailServiceMock()
      );
      await service.changeMemberRole('project-1', 'user-42', 'admin', 'admin-1');

      expect(identityClient.changeProjectMemberRole).toHaveBeenCalledWith(
        'project-1',
        'user-42',
        'admin',
        'admin-1'
      );
    });
  });
});
