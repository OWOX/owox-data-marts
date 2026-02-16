import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DatabaseStore } from '../../store/database-store.js';
import type { MagicLinkEmailService } from '../email/magic-link-email-service.js';
import { MagicLinkService } from './magic-link-service.js';

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
    findActiveMagicLink: jest.fn(),
    saveAuthState: jest.fn(),
    getAuthState: jest.fn(),
    deleteAuthState: jest.fn(),
    purgeExpiredAuthStates: jest.fn(),
  } as unknown as jest.Mocked<DatabaseStore>;
}

describe('MagicLinkService', () => {
  let store: jest.Mocked<DatabaseStore>;
  let emailService: jest.Mocked<MagicLinkEmailService>;
  let service: MagicLinkService;
  let handlerMock: jest.Mock;
  let requestPasswordResetMock: jest.Mock;

  beforeEach(() => {
    store = createStoreMock();
    emailService = {
      send: jest.fn(),
    } as unknown as jest.Mocked<MagicLinkEmailService>;
    service = new MagicLinkService(store, emailService, 'https://auth.example.com');
    handlerMock = jest.fn();
    requestPasswordResetMock = jest.fn(async () => ({ status: true }));
    service.setAuth({
      handler: handlerMock,
      api: {
        requestPasswordReset: requestPasswordResetMock,
      },
    } as unknown as Parameters<MagicLinkService['setAuth']>[0]);
  });

  it('returns not_initialized when auth is missing', async () => {
    const fresh = new MagicLinkService(store, emailService, 'https://auth.example.com');
    const result = await fresh.generate('user@example.com', 'signup');
    expect(result).toEqual({ sent: false, reason: 'not_initialized' });
  });

  it('returns invalid_email for malformed email', async () => {
    const result = await service.generate('invalid-email', 'signup');
    expect(result).toEqual({ sent: false, reason: 'invalid_email' });
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it('returns user_not_found on reset when user does not exist', async () => {
    store.getUserByEmail.mockResolvedValue(null);

    const result = await service.generate('user@example.com', 'reset');

    expect(result).toEqual({ sent: false, reason: 'user_not_found' });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('returns user_not_found on reset for non-credentials account', async () => {
    store.getUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    store.getAccountsByUserId.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        providerId: 'google',
        accountId: 'google-user',
      },
    ]);

    const result = await service.generate('user@example.com', 'reset');

    expect(result).toEqual({ sent: false, reason: 'user_not_found' });
    expect(handlerMock).not.toHaveBeenCalled();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('requests reset password for credential account', async () => {
    store.getUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    store.getAccountsByUserId.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        providerId: 'google',
        accountId: 'google-user',
      },
      {
        id: 'account-2',
        userId: 'user-1',
        providerId: 'credential',
        accountId: 'credentials-user',
      },
    ]);

    const result = await service.generate('  User@Example.com  ', 'reset');

    expect(result).toEqual({ sent: true });
    expect(requestPasswordResetMock).toHaveBeenCalledTimes(1);
    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      body: expect.objectContaining({
        email: 'user@example.com',
        redirectTo: expect.stringContaining('/auth/password/setup'),
      }),
    });
    const requestPayload = requestPasswordResetMock.mock.calls[0]?.[0] as {
      body: { redirectTo: string };
    };
    expect(requestPayload.body.redirectTo).toContain('intent=reset');
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it('builds reset-password email link with reset token', async () => {
    const sender = service.buildResetPasswordSender();

    await sender({
      email: '  User@Example.com ',
      token: 'reset-token-123',
      url: 'https://auth.example.com/ignored',
    });

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send).toHaveBeenCalledWith({
      email: 'user@example.com',
      magicLink: expect.stringContaining('/auth/password/setup'),
      intent: 'reset',
    });
    const payload = (emailService.send as jest.Mock).mock.calls[0]?.[0] as { magicLink: string };
    expect(payload.magicLink).toContain('token=reset-token-123');
  });

  it('returns rate_limited when active verification exists', async () => {
    store.findActiveMagicLink.mockResolvedValue({
      id: 'v1',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    });

    const result = await service.generate('user@example.com', 'signup');

    expect(result).toMatchObject({
      sent: false,
      reason: 'rate_limited',
      waitSeconds: expect.any(Number),
    });
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
