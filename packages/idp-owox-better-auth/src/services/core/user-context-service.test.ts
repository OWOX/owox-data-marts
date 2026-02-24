import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Payload } from '@owox/idp-protocol';
import { AuthenticationException } from '../../core/exceptions.js';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseAccount, DatabaseUser } from '../../types/database-models.js';
import { UserAccountResolver } from './user-account-resolver.js';
import { UserContextService } from './user-context-service.js';

describe('UserContextService', () => {
  let userAccountResolver: jest.Mocked<UserAccountResolver>;
  let tokenFacade: jest.Mocked<OwoxTokenFacade>;
  let service: UserContextService;

  beforeEach(() => {
    userAccountResolver = {
      resolveByEmail: jest.fn(),
      resolveByUserId: jest.fn(),
    } as unknown as jest.Mocked<UserAccountResolver>;

    tokenFacade = {
      parseToken: jest.fn(),
    } as unknown as jest.Mocked<OwoxTokenFacade>;

    service = new UserContextService(userAccountResolver, tokenFacade);
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
    userAccountResolver.resolveByEmail.mockResolvedValue({ user, account });

    const result = await service.resolveFromToken('access-token');

    expect(userAccountResolver.resolveByEmail).toHaveBeenCalledWith('user@example.com', undefined);
    expect(result.user).toEqual(user);
    expect(result.account).toEqual(account);
  });

  it('rejects when user email is not verified', async () => {
    const user: DatabaseUser = {
      id: 'ba-user-1',
      email: 'user@example.com',
      emailVerified: false,
    };
    const account: DatabaseAccount = {
      id: 'acc-db-id',
      userId: 'ba-user-1',
      providerId: 'google',
      accountId: 'google-123',
    };

    tokenFacade.parseToken.mockResolvedValue({
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    });
    userAccountResolver.resolveByEmail.mockResolvedValue({ user, account });

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(
      'User email is not verified in Better Auth DB'
    );
  });

  it('rejects when email verification flag is missing', async () => {
    const user: DatabaseUser = {
      id: 'ba-user-1',
      email: 'user@example.com',
    };
    const account: DatabaseAccount = {
      id: 'acc-db-id',
      userId: 'ba-user-1',
      providerId: 'google',
      accountId: 'google-123',
    };

    tokenFacade.parseToken.mockResolvedValue({
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    });
    userAccountResolver.resolveByEmail.mockResolvedValue({ user, account });

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(AuthenticationException);
  });

  it('rejects when user not found', async () => {
    tokenFacade.parseToken.mockResolvedValue({
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    });
    userAccountResolver.resolveByEmail.mockResolvedValue(null);

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(
      'User not found in Better Auth DB'
    );
  });

  it('prioritizes signinProvider from token payload as preferredLoginMethod', async () => {
    const payload: Payload = {
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
      signinProvider: 'google',
    };
    const user: DatabaseUser = {
      id: 'ba-user-1',
      email: 'user@example.com',
      emailVerified: true,
      firstLoginMethod: 'github',
    };
    const account: DatabaseAccount = {
      id: 'acc-db-id',
      userId: 'ba-user-1',
      providerId: 'google',
      accountId: 'google-123',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    userAccountResolver.resolveByEmail.mockResolvedValue({ user, account });

    const result = await service.resolveFromToken('access-token');

    expect(userAccountResolver.resolveByEmail).toHaveBeenCalledWith('user@example.com', 'google');
    expect(result.account).toEqual(account);
  });

  it('passes undefined preferredLoginMethod when signinProvider is missing in payload', async () => {
    const payload: Payload = {
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    };
    const user: DatabaseUser = {
      id: 'ba-user-1',
      email: 'user@example.com',
      emailVerified: true,
      firstLoginMethod: 'github',
    };
    const account: DatabaseAccount = {
      id: 'acc-db-id',
      userId: 'ba-user-1',
      providerId: 'github',
      accountId: 'github-123',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    userAccountResolver.resolveByEmail.mockResolvedValue({ user, account });

    const result = await service.resolveFromToken('access-token');

    // UserAccountResolver will handle fallback to firstLoginMethod internally
    expect(userAccountResolver.resolveByEmail).toHaveBeenCalledWith('user@example.com', undefined);
    expect(result.account).toEqual(account);
  });

  it('rejects when account is not found (userAccountResolver returns null)', async () => {
    tokenFacade.parseToken.mockResolvedValue({
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    });
    userAccountResolver.resolveByEmail.mockResolvedValue(null);

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(
      'User not found in Better Auth DB'
    );
  });

  it('rejects when token payload email is missing', async () => {
    tokenFacade.parseToken.mockResolvedValue({
      userId: 'ext-user-1',
      projectId: 'project-1',
    });

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(
      'Invalid token payload: email is missing'
    );
  });

  it('rejects when token payload is null', async () => {
    tokenFacade.parseToken.mockResolvedValue(null);

    await expect(service.resolveFromToken('access-token')).rejects.toThrow(
      'Invalid token payload: email is missing'
    );
  });
});
