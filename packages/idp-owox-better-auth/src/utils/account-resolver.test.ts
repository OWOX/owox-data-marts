import { describe, expect, it, jest } from '@jest/globals';

import { resolveAccountForUser, resolveProviderFromLoginMethod } from './account-resolver.js';
import type { DatabaseStore } from '../store/database-store.js';
import type { DatabaseAccount } from '../types/database-models.js';

const createStoreMock = (overrides?: Partial<DatabaseStore>) => {
  const base: Pick<DatabaseStore, 'getAccountByUserIdAndProvider' | 'getAccountByUserId'> = {
    getAccountByUserIdAndProvider: jest.fn<DatabaseStore['getAccountByUserIdAndProvider']>(
      async () => null
    ),
    getAccountByUserId: jest.fn<DatabaseStore['getAccountByUserId']>(async () => null),
  };
  return {
    ...base,
    ...overrides,
  } as unknown as DatabaseStore;
};

describe('account-resolver', () => {
  it('normalizes credential login methods to credential provider id', () => {
    expect(resolveProviderFromLoginMethod(' Email ')).toBe('credential');
    expect(resolveProviderFromLoginMethod('EMAIL-PASSWORD')).toBe('credential');
  });

  it('returns provider-specific account when found', async () => {
    const account = { id: 'acc1' } as DatabaseAccount;
    const store = createStoreMock({
      getAccountByUserIdAndProvider: jest
        .fn<DatabaseStore['getAccountByUserIdAndProvider']>()
        .mockResolvedValue(account),
    });

    const result = await resolveAccountForUser(store, 'user1', 'Email');

    expect(result).toBe(account);
    expect(store.getAccountByUserIdAndProvider).toHaveBeenCalledWith('user1', 'credential');
    expect(store.getAccountByUserId).not.toHaveBeenCalled();
  });

  it('falls back to latest account when preferred is missing', async () => {
    const fallback = { id: 'fallback' } as DatabaseAccount;
    const store = createStoreMock({
      getAccountByUserIdAndProvider: jest
        .fn<DatabaseStore['getAccountByUserIdAndProvider']>()
        .mockResolvedValue(null),
      getAccountByUserId: jest.fn<DatabaseStore['getAccountByUserId']>().mockResolvedValue(fallback),
    });

    const result = await resolveAccountForUser(store, 'user2', 'Google');

    expect(result).toBe(fallback);
    expect(store.getAccountByUserIdAndProvider).toHaveBeenCalledWith('user2', 'google');
    expect(store.getAccountByUserId).toHaveBeenCalledWith('user2');
  });

  it('uses fallback when login method is missing or blank', async () => {
    const fallback = { id: 'fallback' } as DatabaseAccount;
    const store = createStoreMock({
      getAccountByUserId: jest.fn<DatabaseStore['getAccountByUserId']>().mockResolvedValue(fallback),
    });

    const result = await resolveAccountForUser(store, 'user3', '   ');

    expect(result).toBe(fallback);
    expect(store.getAccountByUserIdAndProvider).not.toHaveBeenCalled();
    expect(store.getAccountByUserId).toHaveBeenCalledWith('user3');
  });
});
