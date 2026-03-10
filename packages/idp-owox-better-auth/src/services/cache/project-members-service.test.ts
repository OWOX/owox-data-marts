import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ProjectMember } from '@owox/idp-protocol';
import type { IdentityOwoxClient } from '../../client/index.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { ProjectMembersService, ProjectMembersServiceOptions } from './project-members-service.js';

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
    isHealthy: jest.fn(),
    cleanupExpiredSessions: jest.fn(),
    shutdown: jest.fn(),
    getAdapter: jest.fn(),
    getUserById: jest.fn(),
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
  } as unknown as jest.Mocked<DatabaseStore>;
}

function createIdentityClientMock(): jest.Mocked<IdentityOwoxClient> {
  return {
    getToken: jest.fn(),
    revokeToken: jest.fn(),
    introspectToken: jest.fn(),
    getProjects: jest.fn(),
    getJwks: jest.fn(),
    completeAuthFlow: jest.fn(),
    getProjectMembers: jest.fn(),
  } as unknown as jest.Mocked<IdentityOwoxClient>;
}

function createMockMember(overrides: Partial<ProjectMember> = {}): ProjectMember {
  return {
    userId: 'user-1',
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

    service = new ProjectMembersService(store, identityClient, options);
  });

  describe('getMembers', () => {
    it('should return stored data when data is fresh (expires_at in future)', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [
        createMockMember({ userId: 'user-1', isOutbound: false }),
        createMockMember({ userId: 'user-2', isOutbound: true, userStatus: 'outbound' }),
      ];

      store.getProjectMembers.mockResolvedValue(storedMembers);
      // Data is fresh - expires in the future
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createFutureDate(10), // expires in 10 minutes
        updatedAt: new Date(),
      });

      // Act
      const result = await service.getMembers(projectId);

      // Assert
      expect(store.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.getProjectSyncInfo).toHaveBeenCalledWith(projectId);
      expect(identityClient.getProjectMembers).not.toHaveBeenCalled();
      // Should return ALL members including outbound
      expect(result).toHaveLength(2);
      expect(result[0]?.userId).toBe('user-1');
      expect(result[1]?.userId).toBe('user-2');
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

      // Act
      const result = await service.getMembers(projectId);

      // Assert
      expect(store.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.getProjectSyncInfo).toHaveBeenCalledWith(projectId);
      expect(identityClient.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.saveProjectMembers).toHaveBeenCalled();
      // Should return new data from OWOX Client
      expect(result).toHaveLength(1);
      expect(result[0]?.userId).toBe('999');
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
      // Even though data is fresh, forceFresh should override
      store.getProjectSyncInfo.mockResolvedValue({
        expiresAt: createFutureDate(10),
        updatedAt: new Date(),
      });
      identityClient.getProjectMembers.mockResolvedValue(owoxResponse as never);

      // Act
      await service.getMembers(projectId, { forceFresh: true });

      // Assert
      expect(store.getProjectMembers).not.toHaveBeenCalled();
      expect(store.getProjectSyncInfo).not.toHaveBeenCalled();
      expect(identityClient.getProjectMembers).toHaveBeenCalledWith(projectId);
      expect(store.saveProjectMembers).toHaveBeenCalled();
    });

    it('should return all members including outbound when data is fresh', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [
        createMockMember({ userId: 'active-user', isOutbound: false }),
        createMockMember({ userId: 'outbound-user', isOutbound: true, userStatus: 'outbound' }),
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
        createMockMember({ userId: 'outbound-stale', isOutbound: true, userStatus: 'outbound' }),
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
        createMockMember({ userId: 'user-1', isOutbound: false }),
        createMockMember({ userId: 'user-2', isOutbound: false, email: 'user2@example.com' }),
      ];
      // OWOX Client response only has user-1
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
      const outboundMember = savedMembers.find(m => m.userId === 'user-2');

      expect(activeMember).toBeDefined();
      expect(activeMember?.isOutbound).toBe(false);
      expect(activeMember?.userStatus).toBe('active');

      expect(outboundMember).toBeDefined();
      expect(outboundMember?.isOutbound).toBe(true);
      expect(outboundMember?.userStatus).toBe('outbound');

      // Result should return ALL members (including outbound)
      expect(result).toHaveLength(2);
    });
  });

  describe('historical data preservation', () => {
    it('should preserve all historical members including outbound ones', async () => {
      // Arrange
      const projectId = 'project-1';
      const storedMembers = [
        createMockMember({ userId: 'current-user', isOutbound: false }),
        createMockMember({ userId: 'former-user', isOutbound: true, userStatus: 'outbound' }),
      ];
      // OWOX Client response only has current-user
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
      // Verify that saveProjectMembers preserves the former-user as outbound
      // while updating/adding the current-user
      const saveCall = store.saveProjectMembers.mock.calls[0];
      expect(saveCall).toBeDefined();
      const savedMembers = saveCall![1] as ProjectMember[];

      // Should have both members: current (updated) + former (outbound)
      expect(savedMembers).toHaveLength(2);

      const currentMember = savedMembers.find(m => m.email === 'current@example.com');
      const formerMember = savedMembers.find(m => m.userId === 'former-user');

      expect(currentMember).toBeDefined();
      expect(currentMember?.isOutbound).toBe(false);
      expect(currentMember?.projectRole).toBe('admin');
      expect(formerMember).toBeDefined();
      expect(formerMember?.isOutbound).toBe(true);
      expect(formerMember?.userStatus).toBe('outbound');

      // Result should return ALL members
      expect(result).toHaveLength(2);
    });

    it('should update existing member data while preserving historical records', async () => {
      // Arrange
      const projectId = 'project-1';
      const existingMember = createMockMember({
        userId: 'user-1',
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
});
