import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { Logger } from '@owox/internal-helpers';
import type { Payload } from '@owox/idp-protocol';
import { AuthenticationException } from '../exception.js';
import type { OwoxTokenFacade } from '../facades/owox-token-facade.js';
import type { DatabaseStore } from '../store/database-store.js';
import type { DatabaseAccount, DatabaseUser } from '../types/database-models.js';
import { UserContextService } from './user-context-service.js';

describe('UserContextService', () => {
  let store: jest.Mocked<DatabaseStore>;
  let tokenFacade: jest.Mocked<OwoxTokenFacade>;
  let logger: jest.Mocked<Logger>;
  let service: UserContextService;

  beforeEach(() => {
    store = {
      getUserByEmail: jest.fn(),
      getAccountByUserId: jest.fn(),
    } as unknown as jest.Mocked<DatabaseStore>;

    tokenFacade = {
      parseToken: jest.fn(),
    } as unknown as jest.Mocked<OwoxTokenFacade>;

    logger = {
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    service = new UserContextService(store, tokenFacade, logger);
  });

  it('normalizes email before lookup and resolves verified user context', async () => {
    const payload: Payload = {
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: '  USER@Example.com  ',
    };
    const user: DatabaseUser = {
      id: 'ba-user-1',
      email: 'user@example.com',
      emailVerified: true,
    };
    const account: DatabaseAccount = {
      id: 'acc-db-id',
      userId: 'ba-user-1',
      providerId: 'google',
      accountId: 'google-123',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);
    store.getAccountByUserId.mockResolvedValue(account);

    const result = await service.resolveFromToken('access-token');

    expect(store.getUserByEmail).toHaveBeenCalledWith('user@example.com');
    expect(store.getAccountByUserId).toHaveBeenCalledWith('ba-user-1');
    expect(result.user).toEqual(user);
    expect(result.account).toEqual(account);
  });

  it('rejects when user email is not verified', async () => {
    tokenFacade.parseToken.mockResolvedValue({
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    });
    store.getUserByEmail.mockResolvedValue({
      id: 'ba-user-1',
      email: 'user@example.com',
      emailVerified: false,
    });

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(
      'User email is not verified in Better Auth DB'
    );
    expect(store.getAccountByUserId).not.toHaveBeenCalled();
  });

  it('rejects when email verification flag is missing', async () => {
    tokenFacade.parseToken.mockResolvedValue({
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    });
    store.getUserByEmail.mockResolvedValue({
      id: 'ba-user-1',
      email: 'user@example.com',
    });

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(AuthenticationException);
    expect(store.getAccountByUserId).not.toHaveBeenCalled();
  });
});
