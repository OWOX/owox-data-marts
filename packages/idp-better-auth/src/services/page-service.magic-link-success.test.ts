import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AuthenticationService } from './authentication-service.js';
import type { CryptoService } from './crypto-service.js';
import { PageService } from './page-service.js';
import type { UserManagementService } from './user-management-service.js';

describe('PageService magicLinkSuccess', () => {
  let authenticationService: jest.Mocked<Pick<AuthenticationService, 'getSession'>>;
  let userManagementService: jest.Mocked<
    Pick<UserManagementService, 'addMemberToOrganization' | 'updateUserName'>
  >;
  let cryptoService: jest.Mocked<Pick<CryptoService, 'decrypt'>>;
  let redirect: jest.Mock;

  beforeEach(() => {
    authenticationService = {
      getSession: jest.fn().mockResolvedValue({
        user: { id: 'user-1', email: 'new-admin@example.com', name: null },
      }),
    };
    userManagementService = {
      addMemberToOrganization: jest.fn().mockResolvedValue(undefined),
      updateUserName: jest.fn().mockResolvedValue(undefined),
    };
    cryptoService = {
      decrypt: jest.fn().mockResolvedValue('admin'),
    };
    redirect = jest.fn();
  });

  it('accepts encrypted role from the magic-link success path segment', async () => {
    const service = new PageService(
      authenticationService as unknown as AuthenticationService,
      userManagementService as unknown as UserManagementService,
      cryptoService as unknown as CryptoService,
      { baseURL: 'http://127.0.0.1:3130', secret: 'secret', magicLinkTtl: 3600 }
    );
    const req = {
      query: {},
      params: { role: 'encrypted.role_segment-token' },
    } as never;
    const res = { redirect } as never;

    await service.magicLinkSuccess(req, res);

    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted.role_segment-token');
    expect(userManagementService.updateUserName).toHaveBeenCalledWith('user-1', 'New-admin');
    expect(userManagementService.addMemberToOrganization).toHaveBeenCalledWith(req, 'admin');
    expect(redirect).toHaveBeenCalledWith('/auth/setup-password');
  });
});
