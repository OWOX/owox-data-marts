import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/database-models.js';
import { UserAccountResolver } from './user-account-resolver.js';

describe('UserAccountResolver', () => {
  let store: jest.Mocked<DatabaseStore>;
  let resolver: UserAccountResolver;

  const mockUser: DatabaseUser = {
    id: 'user-1',
    email: 'test@example.com',
    emailVerified: true,
    name: 'Test User',
    image: null,
    lastLoginMethod: 'google',
    firstLoginMethod: 'email',
  };

  const googleAccount: DatabaseAccount = {
    id: 'acc-1',
    userId: 'user-1',
    providerId: 'google',
    accountId: 'google-123',
  };

  const credentialAccount: DatabaseAccount = {
    id: 'acc-2',
    userId: 'user-1',
    providerId: 'credential',
    accountId: 'credential-123',
  };

  beforeEach(() => {
    store = {
      getUserById: jest.fn(),
      getUserByEmail: jest.fn(),
      getAccountByUserId: jest.fn(),
      getAccountByUserIdAndProvider: jest.fn(),
    } as unknown as jest.Mocked<DatabaseStore>;

    resolver = new UserAccountResolver(store);
  });

  describe('resolveByUserId', () => {
    it('returns null when user not found', async () => {
      store.getUserById.mockResolvedValue(null);

      const result = await resolver.resolveByUserId('non-existent');

      expect(result).toBeNull();
      expect(store.getUserById).toHaveBeenCalledWith('non-existent');
    });

    it('returns null when user found but no account exists', async () => {
      store.getUserById.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockResolvedValue(null);
      store.getAccountByUserId.mockResolvedValue(null);

      const result = await resolver.resolveByUserId('user-1');

      expect(result).toBeNull();
    });

    it('resolves by preferredLoginMethod (priority 1)', async () => {
      store.getUserById.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'github') {
          return { id: 'acc-3', userId, providerId: 'github', accountId: 'github-123' };
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1', 'github');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('github');
      expect(result?.user).toEqual(mockUser);
      expect(store.getAccountByUserIdAndProvider).toHaveBeenCalledWith('user-1', 'github');
    });

    it('resolves by lastLoginMethod when preferredLoginMethod not found (priority 2)', async () => {
      store.getUserById.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1', 'nonexistent-provider');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('google');
      expect(result?.account).toEqual(googleAccount);
    });

    it('resolves by firstLoginMethod when preferred and last not found (priority 3)', async () => {
      const userWithNoLastLogin = { ...mockUser, lastLoginMethod: undefined };
      store.getUserById.mockResolvedValue(userWithNoLastLogin);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'credential') {
          return credentialAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1', 'nonexistent-provider');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('credential');
    });

    it('falls back to getAccountByUserId when no login methods match (priority 4)', async () => {
      const userWithNoMethods = {
        ...mockUser,
        lastLoginMethod: undefined,
        firstLoginMethod: undefined,
      };
      store.getUserById.mockResolvedValue(userWithNoMethods);
      store.getAccountByUserIdAndProvider.mockResolvedValue(null);
      store.getAccountByUserId.mockResolvedValue(googleAccount);

      const result = await resolver.resolveByUserId('user-1', 'nonexistent-provider');

      expect(result).not.toBeNull();
      expect(result?.account).toEqual(googleAccount);
      expect(store.getAccountByUserId).toHaveBeenCalledWith('user-1');
    });

    it('resolves credential provider from email login method', async () => {
      const userWithEmailLogin = { ...mockUser, lastLoginMethod: 'email' };
      store.getUserById.mockResolvedValue(userWithEmailLogin);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'credential') {
          return credentialAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('credential');
      expect(store.getAccountByUserIdAndProvider).toHaveBeenCalledWith('user-1', 'credential');
    });

    it('resolves credential provider from email-password login method', async () => {
      const userWithEmailPasswordLogin = { ...mockUser, lastLoginMethod: 'email-password' };
      store.getUserById.mockResolvedValue(userWithEmailPasswordLogin);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'credential') {
          return credentialAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('credential');
    });
  });

  describe('resolveByEmail', () => {
    it('returns null when user not found by email', async () => {
      store.getUserByEmail.mockResolvedValue(null);

      const result = await resolver.resolveByEmail('notfound@example.com');

      expect(result).toBeNull();
      expect(store.getUserByEmail).toHaveBeenCalledWith('notfound@example.com');
    });

    it('resolves user and account by email with preferredLoginMethod', async () => {
      store.getUserByEmail.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });

      const result = await resolver.resolveByEmail('test@example.com', 'google');

      expect(result).not.toBeNull();
      expect(result?.user).toEqual(mockUser);
      expect(result?.account).toEqual(googleAccount);
    });

    it('follows priority chain when resolving by email', async () => {
      store.getUserByEmail.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        // Preferred not found, lastLoginMethod (google) found
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });

      const result = await resolver.resolveByEmail('test@example.com', 'facebook');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('google');
    });
  });

  describe('edge cases', () => {
    it('handles empty preferredLoginMethod', async () => {
      store.getUserById.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1', '');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('google'); // Falls back to lastLoginMethod
    });

    it('handles null preferredLoginMethod', async () => {
      store.getUserById.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1', null as unknown as string);

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('google'); // Falls back to lastLoginMethod
    });

    it('handles whitespace-only preferredLoginMethod', async () => {
      store.getUserById.mockResolvedValue(mockUser);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1', '   ');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('google'); // Falls back to lastLoginMethod
    });

    it('handles case-insensitive login method normalization', async () => {
      const userWithUpperCase = { ...mockUser, lastLoginMethod: 'GOOGLE' };
      store.getUserById.mockResolvedValue(userWithUpperCase);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });

      const result = await resolver.resolveByUserId('user-1');

      expect(result).not.toBeNull();
      expect(result?.account.providerId).toBe('google');
    });

    it('attempts all priorities before giving up', async () => {
      const userWithAllMethods = {
        ...mockUser,
        lastLoginMethod: 'facebook',
        firstLoginMethod: 'twitter',
      };
      store.getUserById.mockResolvedValue(userWithAllMethods);
      store.getAccountByUserIdAndProvider.mockImplementation(async (userId, providerId) => {
        // Only google account exists, none of the methods match
        if (providerId === 'google') {
          return googleAccount;
        }
        return null;
      });
      store.getAccountByUserId.mockResolvedValue(googleAccount);

      const result = await resolver.resolveByUserId('user-1', 'github');

      expect(result).not.toBeNull();
      expect(result?.account).toEqual(googleAccount);
      // Should have tried: github (preferred), facebook (last), twitter (first), then fallback
      expect(store.getAccountByUserIdAndProvider).toHaveBeenCalledWith('user-1', 'github');
      expect(store.getAccountByUserIdAndProvider).toHaveBeenCalledWith('user-1', 'facebook');
      expect(store.getAccountByUserIdAndProvider).toHaveBeenCalledWith('user-1', 'twitter');
      expect(store.getAccountByUserId).toHaveBeenCalledWith('user-1');
    });
  });
});
