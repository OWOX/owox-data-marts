import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/index.js';
import { ExtensionIdentityResolver } from './extension-identity-resolver.js';
import type { VerifiedMicrosoftIdentity } from './microsoft-entra-access-token-verifier.js';

const identity: VerifiedMicrosoftIdentity = {
  oid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  verifiedEmail: 'user@example.com',
  replayKey: 'sha256:abc',
  expiresAt: new Date(Date.now() + 60_000),
};

const user: DatabaseUser = {
  id: 'local-user-1',
  email: 'user@example.com',
  biUserId: 'bi-user-1',
};

const account: DatabaseAccount = {
  id: 'account-1',
  userId: user.id,
  providerId: 'microsoft',
  accountId: identity.accountId,
};

describe('ExtensionIdentityResolver', () => {
  let store: jest.Mocked<DatabaseStore>;
  let resolver: ExtensionIdentityResolver;

  beforeEach(() => {
    store = {
      getAccountByProviderAndAccountId: jest.fn(),
      getUserByEmail: jest.fn(),
      getUserById: jest.fn(),
      linkAccount: jest.fn(),
    } as unknown as jest.Mocked<DatabaseStore>;
    resolver = new ExtensionIdentityResolver(store);
  });

  it('resolves the durable Microsoft account link before considering email', async () => {
    store.getAccountByProviderAndAccountId.mockResolvedValue(account);
    store.getUserById.mockResolvedValue(user);

    await expect(resolver.resolveMicrosoft(identity)).resolves.toEqual({
      status: 'resolved',
      userId: 'bi-user-1',
    });
    expect(store.getUserByEmail).not.toHaveBeenCalled();
    expect(store.linkAccount).not.toHaveBeenCalled();
  });

  it('links a verified email match and returns the durable link owner', async () => {
    const concurrentOwner = { ...user, id: 'local-user-2', biUserId: 'bi-user-2' };
    store.getAccountByProviderAndAccountId.mockResolvedValue(null);
    store.getUserByEmail.mockResolvedValue(user);
    store.linkAccount.mockResolvedValue({ ...account, userId: concurrentOwner.id });
    store.getUserById.mockResolvedValue(concurrentOwner);

    await expect(resolver.resolveMicrosoft(identity)).resolves.toEqual({
      status: 'resolved',
      userId: 'bi-user-2',
    });
    expect(store.linkAccount).toHaveBeenCalledWith('microsoft', identity.accountId, user.id);
  });

  it('returns unknown_identity without a verified email and never creates a user', async () => {
    store.getAccountByProviderAndAccountId.mockResolvedValue(null);

    await expect(
      resolver.resolveMicrosoft({ ...identity, verifiedEmail: undefined })
    ).resolves.toEqual({ status: 'unknown_identity' });
    expect(store.getUserByEmail).not.toHaveBeenCalled();
    expect(store.linkAccount).not.toHaveBeenCalled();
  });

  it('returns unknown_identity when the Better Auth user has no Analytics identity', async () => {
    store.getAccountByProviderAndAccountId.mockResolvedValue(account);
    store.getUserById.mockResolvedValue({ ...user, biUserId: undefined });

    await expect(resolver.resolveMicrosoft(identity)).resolves.toEqual({
      status: 'unknown_identity',
    });
  });
});
