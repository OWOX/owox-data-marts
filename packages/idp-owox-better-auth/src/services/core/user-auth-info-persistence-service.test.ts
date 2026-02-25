import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Payload } from '@owox/idp-protocol';
import type { OwoxTokenFacade } from '../../facades/owox-token-facade.js';
import type { DatabaseStore } from '../../store/database-store.js';
import type { DatabaseUser } from '../../types/database-models.js';
import { UserAuthInfoPersistenceService } from './user-auth-info-persistence-service.js';

describe('UserAuthInfoPersistenceService', () => {
  let store: jest.Mocked<DatabaseStore>;
  let tokenFacade: jest.Mocked<OwoxTokenFacade>;
  let service: UserAuthInfoPersistenceService;

  beforeEach(() => {
    store = {
      getUserByEmail: jest.fn(),
      updateUserFirstLoginMethod: jest.fn(() => Promise.resolve()),
      updateUserBiUserId: jest.fn(() => Promise.resolve()),
      updateUserLastLoginMethod: jest.fn(() => Promise.resolve()),
    } as unknown as jest.Mocked<DatabaseStore>;

    tokenFacade = {
      parseToken: jest.fn(),
    } as unknown as jest.Mocked<OwoxTokenFacade>;

    service = new UserAuthInfoPersistenceService(store, tokenFacade);
  });

  it('persists both firstLoginMethod and biUserId for new user', async () => {
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
      firstLoginMethod: undefined,
      biUserId: undefined,
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);

    await service.persistAuthInfo('access-token');

    expect(store.updateUserFirstLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
    expect(store.updateUserBiUserId).toHaveBeenCalledWith('ba-user-1', 'ext-user-1');
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
    expect(store.updateUserFirstLoginMethod).toHaveBeenCalledTimes(1);
    expect(store.updateUserBiUserId).toHaveBeenCalledTimes(1);
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledTimes(1);
  });

  it('does not update firstLoginMethod if already set', async () => {
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

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);

    await service.persistAuthInfo('access-token');

    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).toHaveBeenCalledWith('ba-user-1', 'ext-user-1');
    // lastLoginMethod should still be updated even if firstLoginMethod is already set
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
  });

  it('does not update biUserId if already set', async () => {
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
      biUserId: 'existing-bi-id',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);

    await service.persistAuthInfo('access-token');

    expect(store.updateUserFirstLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
  });

  it('does not update anything if both fields already set', async () => {
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
      biUserId: 'existing-bi-id',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);

    await service.persistAuthInfo('access-token');

    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    // lastLoginMethod should still be updated even if both fields are already set
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
  });

  it('handles missing signinProvider gracefully', async () => {
    const payload: Payload & { userId: string } = {
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
    };
    const user: DatabaseUser = {
      id: 'ba-user-1',
      email: 'user@example.com',
      emailVerified: true,
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);

    await service.persistAuthInfo('access-token');

    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).toHaveBeenCalledWith('ba-user-1', 'ext-user-1');
    // lastLoginMethod should not be updated when signinProvider is missing
    expect(store.updateUserLastLoginMethod).not.toHaveBeenCalled();
  });

  it('handles missing userId gracefully', async () => {
    const payload = {
      projectId: 'project-1',
      email: 'user@example.com',
      signinProvider: 'google',
    } as unknown as Payload;
    const user: DatabaseUser = {
      id: 'ba-user-1',
      email: 'user@example.com',
      emailVerified: true,
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);

    await service.persistAuthInfo('access-token');

    expect(store.updateUserFirstLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
  });

  it('gracefully handles missing email in payload', async () => {
    const payload: Payload = {
      userId: 'ext-user-1',
      projectId: 'project-1',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);

    await service.persistAuthInfo('access-token');

    expect(store.getUserByEmail).not.toHaveBeenCalled();
    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    expect(store.updateUserLastLoginMethod).not.toHaveBeenCalled();
  });

  it('gracefully handles user not found in database', async () => {
    const payload: Payload = {
      userId: 'ext-user-1',
      projectId: 'project-1',
      email: 'user@example.com',
      signinProvider: 'google',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(null);

    await service.persistAuthInfo('access-token');

    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    expect(store.updateUserLastLoginMethod).not.toHaveBeenCalled();
  });

  it('gracefully handles token parsing errors', async () => {
    tokenFacade.parseToken.mockResolvedValue(null);

    await service.persistAuthInfo('invalid-token');

    expect(store.getUserByEmail).not.toHaveBeenCalled();
    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    expect(store.updateUserLastLoginMethod).not.toHaveBeenCalled();
  });

  it('gracefully handles exceptions during persistence', async () => {
    tokenFacade.parseToken.mockRejectedValue(new Error('Token parsing failed'));

    await expect(service.persistAuthInfo('access-token')).resolves.not.toThrow();

    expect(store.getUserByEmail).not.toHaveBeenCalled();
    expect(store.updateUserLastLoginMethod).not.toHaveBeenCalled();
  });

  it('skips persistence when both signinProvider and userId are missing', async () => {
    const payload = {
      projectId: 'project-1',
      email: 'user@example.com',
    } as unknown as Payload;

    tokenFacade.parseToken.mockResolvedValue(payload);

    await service.persistAuthInfo('access-token');

    expect(store.getUserByEmail).not.toHaveBeenCalled();
    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    expect(store.updateUserLastLoginMethod).not.toHaveBeenCalled();
  });

  it('updates lastLoginMethod even when it is already set (unlike firstLoginMethod)', async () => {
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
      lastLoginMethod: 'microsoft',
      biUserId: 'existing-bi-id',
    };

    tokenFacade.parseToken.mockResolvedValue(payload);
    store.getUserByEmail.mockResolvedValue(user);

    await service.persistAuthInfo('access-token');

    // firstLoginMethod and biUserId should NOT be updated since they are already set
    expect(store.updateUserFirstLoginMethod).not.toHaveBeenCalled();
    expect(store.updateUserBiUserId).not.toHaveBeenCalled();
    // lastLoginMethod SHOULD be updated (tracks most recent login method)
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledWith('ba-user-1', 'google');
    expect(store.updateUserLastLoginMethod).toHaveBeenCalledTimes(1);
  });
});
