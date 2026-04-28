import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import type { UserManagementService } from '../services/user-management-service.js';
import type { DatabaseUser } from '../types/index.js';

jest.unstable_mockModule('better-auth', () => ({
  betterAuth: jest.fn().mockReturnValue({
    options: {},
    api: {},
    handler: jest.fn(),
  }),
}));

jest.unstable_mockModule('better-auth/plugins', () => ({
  magicLink: jest.fn().mockReturnValue({}),
  organization: jest.fn().mockReturnValue({}),
}));

jest.unstable_mockModule('better-auth/plugins/access', () => ({
  createAccessControl: jest.fn().mockReturnValue({
    newRole: jest.fn().mockReturnValue({}),
  }),
}));

jest.unstable_mockModule('better-auth/db/migration', () => ({
  getMigrations: jest.fn().mockResolvedValue({
    runMigrations: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.unstable_mockModule('express', () => {
  const fn = jest.fn();
  fn.mockReturnValue({
    use: jest.fn(),
    post: jest.fn(),
    get: jest.fn(),
  });
  return {
    __esModule: true,
    default: fn,
    json: jest.fn(),
    urlencoded: jest.fn(),
  };
});

jest.unstable_mockModule('../store/DatabaseStoreFactory.js', () => ({
  createDatabaseStore: jest.fn(),
}));

jest.unstable_mockModule('../auth/auth-config.js', () => ({
  createBetterAuthConfig: jest.fn().mockResolvedValue({
    options: { baseURL: 'http://localhost:3000', secret: 'test-secret' },
    api: {
      getSession: jest.fn(),
      signOut: jest.fn(),
    },
    handler: jest.fn(),
  }),
}));

jest.unstable_mockModule('../services/magic-link-service.js', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({
    generateMagicLink: jest.fn(),
  })),
}));

jest.unstable_mockModule('../services/crypto-service.js', () => ({
  CryptoService: jest.fn().mockImplementation(() => ({
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  })),
}));

jest.unstable_mockModule('../services/authentication-service.js', () => ({
  AuthenticationService: jest.fn().mockImplementation(() => ({
    setUserManagementService: jest.fn(),
    signInMiddleware: jest.fn(),
  })),
}));

jest.unstable_mockModule('../services/token-service.js', () => ({
  TokenService: jest.fn().mockImplementation(() => ({
    introspectToken: jest.fn(),
    parseToken: jest.fn(),
    refreshToken: jest.fn(),
    revokeToken: jest.fn(),
  })),
}));

jest.unstable_mockModule('../services/user-management-service.js', () => ({
  UserManagementService: jest.fn().mockImplementation(() => ({
    addUserViaMagicLink: jest.fn(),
    ensureUserInDefaultOrganization: jest.fn(),
    listUsers: jest.fn(),
    removeUser: jest.fn(),
    getUserRole: jest.fn(),
    inviteAndCreateStub: jest.fn(),
  })),
}));

jest.unstable_mockModule('../services/request-handler-service.js', () => ({
  RequestHandlerService: jest.fn().mockImplementation(() => ({
    setupBetterAuthHandler: jest.fn(),
  })),
}));

jest.unstable_mockModule('../services/middleware-service.js', () => ({
  MiddlewareService: jest.fn().mockImplementation(() => ({
    signInMiddleware: jest.fn(),
    signOutMiddleware: jest.fn(),
    accessTokenMiddleware: jest.fn(),
    userApiMiddleware: jest.fn(),
  })),
}));

jest.unstable_mockModule('../services/page-service.js', () => ({
  PageService: jest.fn().mockImplementation(() => ({
    registerRoutes: jest.fn(),
  })),
}));

const { createDatabaseStore } = await import('../store/DatabaseStoreFactory.js');
const { BetterAuthProvider } = await import('./better-auth-provider.js');

function createStoreMock(): jest.Mocked<DatabaseStore> {
  return {
    isHealthy: jest.fn<DatabaseStore['isHealthy']>().mockResolvedValue(true),
    cleanupExpiredSessions: jest
      .fn<DatabaseStore['cleanupExpiredSessions']>()
      .mockResolvedValue({ changes: 0 }),
    getUserCount: jest.fn<DatabaseStore['getUserCount']>().mockResolvedValue(0),
    shutdown: jest.fn<DatabaseStore['shutdown']>().mockResolvedValue(undefined),
    getAdapter: jest.fn<DatabaseStore['getAdapter']>().mockResolvedValue({}),
    getUsers: jest.fn<DatabaseStore['getUsers']>().mockResolvedValue([]),
    getUserById: jest.fn<DatabaseStore['getUserById']>().mockResolvedValue(null),
    getUserByEmail: jest.fn<DatabaseStore['getUserByEmail']>().mockResolvedValue(null),
    updateUserName: jest.fn<DatabaseStore['updateUserName']>().mockResolvedValue(undefined),
    deleteUserCascade: jest
      .fn<DatabaseStore['deleteUserCascade']>()
      .mockResolvedValue({ changes: 1 }),
    userHasPassword: jest.fn<DatabaseStore['userHasPassword']>().mockResolvedValue(false),
    clearUserPassword: jest.fn<DatabaseStore['clearUserPassword']>().mockResolvedValue(undefined),
    revokeUserSessions: jest.fn<DatabaseStore['revokeUserSessions']>().mockResolvedValue(undefined),
    defaultOrganizationExists: jest
      .fn<DatabaseStore['defaultOrganizationExists']>()
      .mockResolvedValue(false),
    createDefaultOrganizationForUser: jest
      .fn<DatabaseStore['createDefaultOrganizationForUser']>()
      .mockResolvedValue(undefined),
    addUserToOrganization: jest
      .fn<DatabaseStore['addUserToOrganization']>()
      .mockResolvedValue(undefined),
    getUserRole: jest.fn<DatabaseStore['getUserRole']>().mockResolvedValue(null),
    getUsersForAdmin: jest.fn<DatabaseStore['getUsersForAdmin']>().mockResolvedValue([]),
    getUserDetails: jest.fn<DatabaseStore['getUserDetails']>().mockResolvedValue(null),
  } as unknown as jest.Mocked<DatabaseStore>;
}

describe('BetterAuthProvider', () => {
  let store: jest.Mocked<DatabaseStore>;

  beforeEach(() => {
    store = createStoreMock();
    (createDatabaseStore as jest.Mock).mockReturnValue(store);
    jest.clearAllMocks();
  });

  async function createProvider(
    primaryAdminEmail?: string
  ): Promise<InstanceType<typeof BetterAuthProvider>> {
    (createDatabaseStore as jest.Mock).mockReturnValue(store);

    const provider = await BetterAuthProvider.create({
      database: { type: 'sqlite', filename: ':memory:' },
      secret: 'test-secret',
      magicLinkTtl: 3600,
      primaryAdminEmail,
    });

    return provider;
  }

  function getUserManagementServiceFromProvider(
    provider: InstanceType<typeof BetterAuthProvider>
  ): jest.Mocked<UserManagementService> {
    return (provider as unknown as { userManagementService: jest.Mocked<UserManagementService> })
      .userManagementService;
  }

  describe('initializePrimaryAdmin', () => {
    it('should create new user and add to org when user does not exist', async () => {
      const createdUser: DatabaseUser = {
        id: 'new-user-id',
        email: 'admin@example.com',
        name: 'Admin',
      };
      store.getUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(createdUser);

      const provider = await createProvider('admin@example.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.addUserViaMagicLink.mockResolvedValue({
        username: 'admin@example.com',
        magicLink: 'http://localhost/magic-link?token=abc',
      });
      userMgmt.ensureUserInDefaultOrganization.mockResolvedValue(undefined);

      await provider.initialize();

      expect(userMgmt.addUserViaMagicLink).toHaveBeenCalledWith('admin@example.com');
      expect(userMgmt.ensureUserInDefaultOrganization).toHaveBeenCalledWith('new-user-id', 'admin');
    });

    it('should ensure org membership for existing user with password', async () => {
      const existingUser: DatabaseUser = {
        id: 'existing-user-id',
        email: 'admin@example.com',
        name: 'Admin',
      };
      store.getUserByEmail.mockResolvedValue(existingUser);
      store.userHasPassword.mockResolvedValue(true);

      const provider = await createProvider('admin@example.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.ensureUserInDefaultOrganization.mockResolvedValue(undefined);

      await provider.initialize();

      expect(userMgmt.ensureUserInDefaultOrganization).toHaveBeenCalledWith(
        'existing-user-id',
        'admin'
      );
      expect(userMgmt.addUserViaMagicLink).not.toHaveBeenCalled();
    });

    it('should ensure org membership and generate magic link for existing user without password', async () => {
      const existingUser: DatabaseUser = {
        id: 'existing-user-id',
        email: 'admin@example.com',
        name: 'Admin',
      };
      store.getUserByEmail.mockResolvedValue(existingUser);
      store.userHasPassword.mockResolvedValue(false);

      const provider = await createProvider('admin@example.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.ensureUserInDefaultOrganization.mockResolvedValue(undefined);
      userMgmt.addUserViaMagicLink.mockResolvedValue({
        username: 'admin@example.com',
        magicLink: 'http://localhost/magic-link?token=xyz',
      });

      await provider.initialize();

      expect(userMgmt.ensureUserInDefaultOrganization).toHaveBeenCalledWith(
        'existing-user-id',
        'admin'
      );
      expect(userMgmt.addUserViaMagicLink).toHaveBeenCalledWith('admin@example.com');
    });

    it('should not call initializePrimaryAdmin when primaryAdminEmail is not set', async () => {
      const provider = await createProvider(undefined);
      const userMgmt = getUserManagementServiceFromProvider(provider);

      await provider.initialize();

      expect(store.getUserByEmail).not.toHaveBeenCalled();
      expect(userMgmt.ensureUserInDefaultOrganization).not.toHaveBeenCalled();
      expect(userMgmt.addUserViaMagicLink).not.toHaveBeenCalled();
    });

    it('should rethrow error when store.getUserByEmail fails', async () => {
      store.getUserByEmail.mockRejectedValue(new Error('DB connection lost'));

      const provider = await createProvider('admin@example.com');

      await expect(provider.initialize()).rejects.toThrow('DB connection lost');
    });

    it('should rethrow error when ensureUserInDefaultOrganization fails for existing user', async () => {
      const existingUser: DatabaseUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'A',
      };
      store.getUserByEmail.mockResolvedValue(existingUser);
      store.userHasPassword.mockResolvedValue(true);

      const provider = await createProvider('admin@example.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.ensureUserInDefaultOrganization.mockRejectedValue(new Error('Org creation failed'));

      await expect(provider.initialize()).rejects.toThrow('Org creation failed');
    });

    it('should still add to org when new user created but name lookup returns user', async () => {
      store.getUserByEmail
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'brand-new', email: 'new@test.com' });

      const provider = await createProvider('new@test.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.addUserViaMagicLink.mockResolvedValue({
        username: 'new@test.com',
        magicLink: 'http://localhost/magic?t=1',
      });
      userMgmt.ensureUserInDefaultOrganization.mockResolvedValue(undefined);

      await provider.initialize();

      expect(userMgmt.addUserViaMagicLink).toHaveBeenCalledWith('new@test.com');
      expect(userMgmt.ensureUserInDefaultOrganization).toHaveBeenCalledWith('brand-new', 'admin');
    });

    it('should skip org setup for new user when second lookup returns null', async () => {
      store.getUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const provider = await createProvider('ghost@test.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.addUserViaMagicLink.mockResolvedValue({
        username: 'ghost@test.com',
        magicLink: 'http://localhost/magic?t=1',
      });

      await provider.initialize();

      expect(userMgmt.addUserViaMagicLink).toHaveBeenCalledWith('ghost@test.com');
      expect(userMgmt.ensureUserInDefaultOrganization).not.toHaveBeenCalled();
    });

    it('should call ensureUserInDefaultOrganization BEFORE checking password for existing user', async () => {
      const existingUser = { id: 'user-1', email: 'admin@example.com', name: 'Admin' };
      store.getUserByEmail.mockResolvedValue(existingUser);
      store.userHasPassword.mockResolvedValue(true);

      const callOrder: string[] = [];

      const provider = await createProvider('admin@example.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.ensureUserInDefaultOrganization.mockImplementation(async () => {
        callOrder.push('ensureOrg');
      });
      store.userHasPassword.mockImplementation(async () => {
        callOrder.push('checkPassword');
        return true;
      });

      await provider.initialize();

      expect(callOrder).toEqual(['ensureOrg', 'checkPassword']);
    });

    it('should not create magic link for existing user with password', async () => {
      const existingUser = { id: 'user-1', email: 'admin@example.com', name: 'Admin' };
      store.getUserByEmail.mockResolvedValue(existingUser);
      store.userHasPassword.mockResolvedValue(true);

      const provider = await createProvider('admin@example.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.ensureUserInDefaultOrganization.mockResolvedValue(undefined);

      await provider.initialize();

      expect(userMgmt.addUserViaMagicLink).not.toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    it('should call runMigrations', async () => {
      const { getMigrations } = await import('better-auth/db/migration');
      const runMigrations = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      (getMigrations as jest.Mock).mockResolvedValue({ runMigrations });

      const provider = await createProvider(undefined);
      await provider.initialize();

      expect(runMigrations).toHaveBeenCalled();
    });

    it('should call runMigrations before initializePrimaryAdmin', async () => {
      const callOrder: string[] = [];

      const { getMigrations } = await import('better-auth/db/migration');
      (getMigrations as jest.Mock).mockResolvedValue({
        runMigrations: jest.fn().mockImplementation(async () => {
          callOrder.push('migrations');
        }),
      });

      store.getUserByEmail.mockImplementation(async () => {
        callOrder.push('getUserByEmail');
        return null;
      });

      const provider = await createProvider('admin@test.com');
      const userMgmt = getUserManagementServiceFromProvider(provider);
      userMgmt.addUserViaMagicLink.mockResolvedValue({
        username: 'admin@test.com',
        magicLink: 'http://localhost/ml',
      });

      await provider.initialize();

      expect(callOrder[0]).toBe('migrations');
      expect(callOrder[1]).toBe('getUserByEmail');
    });
  });

  describe('shutdown', () => {
    it('should call store.shutdown', async () => {
      const provider = await createProvider(undefined);

      await provider.shutdown();

      expect(store.shutdown).toHaveBeenCalled();
    });

    it('should not throw when store.shutdown fails', async () => {
      store.shutdown.mockRejectedValue(new Error('Shutdown error'));

      const provider = await createProvider(undefined);

      await expect(provider.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('isHealthy', () => {
    it('should delegate to store.isHealthy', async () => {
      store.isHealthy.mockResolvedValue(true);

      const provider = await createProvider(undefined);
      const result = await provider.isHealthy();

      expect(result).toBe(true);
      expect(store.isHealthy).toHaveBeenCalled();
    });

    it('should return false when store is unhealthy', async () => {
      store.isHealthy.mockResolvedValue(false);

      const provider = await createProvider(undefined);
      const result = await provider.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('projectsApiMiddleware', () => {
    it('should always return empty array', async () => {
      const provider = await createProvider(undefined);

      const res = {
        json: jest.fn().mockReturnThis(),
      } as unknown as import('express').Response;

      await provider.projectsApiMiddleware(
        {} as import('express').Request,
        res,
        jest.fn() as unknown as import('express').NextFunction
      );

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('inviteMember', () => {
    it('returns magic-link invitation with userId from inviteAndCreateStub', async () => {
      const provider = await createProvider();
      const userMgmt = getUserManagementServiceFromProvider(provider);
      (
        userMgmt.inviteAndCreateStub as jest.Mock<typeof userMgmt.inviteAndCreateStub>
      ).mockResolvedValue({
        userId: 'stub-1',
        magicLink: 'https://app/magic/tok',
      });

      const result = await provider.inviteMember('proj-1', 'new@x.io', 'editor', 'admin-1');

      expect(userMgmt.inviteAndCreateStub).toHaveBeenCalledWith('new@x.io', 'editor');
      expect(result).toEqual({
        projectId: 'proj-1',
        email: 'new@x.io',
        role: 'editor',
        kind: 'magic-link',
        magicLink: 'https://app/magic/tok',
        userId: 'stub-1',
      });
    });

    it('propagates errors from the service layer', async () => {
      const provider = await createProvider();
      const userMgmt = getUserManagementServiceFromProvider(provider);
      (
        userMgmt.inviteAndCreateStub as jest.Mock<typeof userMgmt.inviteAndCreateStub>
      ).mockRejectedValue(new Error('db down'));

      await expect(
        provider.inviteMember('proj-1', 'bad@x.io', 'viewer', 'admin-1')
      ).rejects.toThrow('db down');
    });
  });
});
