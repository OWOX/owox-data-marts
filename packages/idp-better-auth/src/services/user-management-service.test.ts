import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DatabaseStore } from '../store/DatabaseStore.js';
import type { MagicLinkService } from './magic-link-service.js';
import type { CryptoService } from './crypto-service.js';
import type { AdminUserView } from '../types/index.js';

const { UserManagementService } = await import('./user-management-service.js');

describe('UserManagementService — listUsers (direct DB read)', () => {
  let store: jest.Mocked<DatabaseStore>;
  let magicLinkService: jest.Mocked<MagicLinkService>;
  let cryptoService: jest.Mocked<CryptoService>;

  beforeEach(() => {
    store = {
      getUsersForAdmin: jest.fn<DatabaseStore['getUsersForAdmin']>(),
      getUsers: jest.fn<DatabaseStore['getUsers']>(),
    } as unknown as jest.Mocked<DatabaseStore>;
    magicLinkService = {} as unknown as jest.Mocked<MagicLinkService>;
    cryptoService = {} as unknown as jest.Mocked<CryptoService>;
  });

  function build(
    handlerResponse: globalThis.Response = new globalThis.Response('err', { status: 500 })
  ) {
    const auth = {
      options: { baseURL: 'http://localhost:3000' },
      handler: jest.fn<() => Promise<globalThis.Response>>().mockResolvedValue(handlerResponse),
    } as unknown as Parameters<typeof UserManagementService>[0];
    return new UserManagementService(auth, magicLinkService, cryptoService, store);
  }

  it('maps DB member role onto the Payload.roles array', async () => {
    store.getUsersForAdmin.mockResolvedValue([
      { id: 'u1', email: 'a@x.io', name: 'Admin', role: 'admin' } as AdminUserView,
      { id: 'u2', email: 'b@x.io', name: 'Editor', role: 'editor' } as AdminUserView,
      { id: 'u3', email: 'c@x.io', name: 'Viewer', role: 'viewer' } as AdminUserView,
    ]);

    const service = build();
    const result = await service.listUsers();

    expect(store.getUsersForAdmin).toHaveBeenCalled();
    expect(result.map(r => r.roles?.[0])).toEqual(['admin', 'editor', 'viewer']);
  });

  it('falls back to viewer when DB role is unknown (not in Role enum)', async () => {
    store.getUsersForAdmin.mockResolvedValue([
      { id: 'u1', email: 'a@x.io', name: 'X', role: 'owner' } as AdminUserView,
    ]);

    const service = build();
    const result = await service.listUsers();

    expect(result[0]?.roles).toEqual(['viewer']);
  });

  it('rejects when DB lookup fails (does not silently return empty list)', async () => {
    store.getUsersForAdmin.mockRejectedValue(new Error('db down'));

    const service = build();
    await expect(service.listUsers()).rejects.toThrow('Failed to list users');
  });
});

describe('UserManagementService — inviteAndCreateStub', () => {
  let store: jest.Mocked<DatabaseStore>;
  let magicLinkService: jest.Mocked<MagicLinkService>;
  let cryptoService: jest.Mocked<CryptoService>;

  beforeEach(() => {
    store = {
      createUserStub: jest.fn<DatabaseStore['createUserStub']>(),
      defaultOrganizationExists: jest.fn<DatabaseStore['defaultOrganizationExists']>(),
      createDefaultOrganizationForUser:
        jest.fn<DatabaseStore['createDefaultOrganizationForUser']>(),
      addUserToOrganization: jest.fn<DatabaseStore['addUserToOrganization']>(),
    } as unknown as jest.Mocked<DatabaseStore>;
    magicLinkService = {
      generateMagicLink: jest.fn<MagicLinkService['generateMagicLink']>(),
    } as unknown as jest.Mocked<MagicLinkService>;
    cryptoService = {} as unknown as jest.Mocked<CryptoService>;
  });

  function build() {
    const auth = {
      options: { baseURL: 'http://localhost:3000' },
      handler: jest.fn(),
    } as unknown as Parameters<typeof UserManagementService>[0];
    return new UserManagementService(auth, magicLinkService, cryptoService, store);
  }

  it('new user: stubs, ensures organization membership, and returns link + id', async () => {
    store.createUserStub.mockResolvedValue({ userId: 'new-id', created: true });
    store.defaultOrganizationExists.mockResolvedValue(true);
    store.addUserToOrganization.mockResolvedValue(undefined);
    magicLinkService.generateMagicLink.mockResolvedValue('https://app/magic/tok');

    const service = build();
    const result = await service.inviteAndCreateStub('new@x.io', 'editor');

    expect(store.createUserStub).toHaveBeenCalledWith('new@x.io');
    expect(store.addUserToOrganization).toHaveBeenCalledWith(
      expect.any(String),
      'new-id',
      'editor'
    );
    expect(magicLinkService.generateMagicLink).toHaveBeenCalledWith('new@x.io', 'editor');
    expect(result).toEqual({ userId: 'new-id', magicLink: 'https://app/magic/tok' });
  });

  it('existing user: re-uses the same id and rotates the magic link', async () => {
    store.createUserStub.mockResolvedValue({ userId: 'existing-id', created: false });
    store.defaultOrganizationExists.mockResolvedValue(true);
    store.addUserToOrganization.mockResolvedValue(undefined);
    magicLinkService.generateMagicLink.mockResolvedValue('https://app/magic/tok-2');

    const service = build();
    const result = await service.inviteAndCreateStub('exists@x.io', 'viewer');

    expect(result.userId).toBe('existing-id');
    // Role is (re-)applied on re-invite — caller may be updating it.
    expect(store.addUserToOrganization).toHaveBeenCalledWith(
      expect.any(String),
      'existing-id',
      'viewer'
    );
  });

  it('wraps unexpected errors with a stable message', async () => {
    store.createUserStub.mockRejectedValue(new Error('unique constraint'));

    const service = build();
    await expect(service.inviteAndCreateStub('bad@x.io', 'admin')).rejects.toThrow(
      /Failed to prepare invitation/
    );
  });
});
