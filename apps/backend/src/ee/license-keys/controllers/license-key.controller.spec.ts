import { REJECT_API_KEY_AUTH_METADATA } from '../../../idp/decorators/reject-api-key-auth.decorator';
import { REJECT_PLUGIN_AUTH_METADATA } from '../../../idp/decorators/reject-plugin-auth.decorator';
import { AuthorizationContext, Strategy } from '../../../idp/types';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeyController } from './license-key.controller';

describe('LicenseKeyController', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');
  const record = {
    licenseKeyId: 'key-1',
    projectId: 'project-1',
    name: 'Production',
    origin: 'https://customer.test',
    expiresAt: now,
    lastUsedAt: null,
    createdAt: now,
    createdById: 'user-1',
  } as LicenseKey;
  const user = { id: 'user-1', email: 'user@example.com' };
  const context = {
    projectId: 'project-1',
    userId: 'user-1',
  } as AuthorizationContext;

  const createController = () => {
    const service = {
      list: jest.fn().mockResolvedValue([record]),
      create: jest.fn().mockResolvedValue({ record, licenseKey: 'signed.jwt' }),
      rename: jest.fn().mockResolvedValue(record),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    const users = {
      fetchRelevantUserProjections: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(user),
      }),
      fetchCreatedByUser: jest.fn().mockResolvedValue(user),
    };
    return {
      controller: new LicenseKeyController(service as never, users as never),
      service,
    };
  };

  it('keeps list viewer-readable and mutations admin-only', () => {
    const prototype = LicenseKeyController.prototype;

    expect(Reflect.getMetadata('roleConfig', prototype.list)).toEqual({
      role: 'viewer',
      strategy: Strategy.PARSE,
    });
    for (const method of [prototype.create, prototype.update, prototype.revoke]) {
      expect(Reflect.getMetadata('roleConfig', method)).toEqual({
        role: 'admin',
        strategy: Strategy.INTROSPECT,
      });
    }
    expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, LicenseKeyController)).toBe(true);
    expect(Reflect.getMetadata(REJECT_PLUGIN_AUTH_METADATA, LicenseKeyController)).toBe(true);
  });

  it('scopes reads and mutations to the authenticated project', async () => {
    const { controller, service } = createController();

    await expect(controller.list(context)).resolves.toEqual([
      expect.objectContaining({ licenseKeyId: 'key-1', createdByUser: user }),
    ]);
    await expect(
      controller.create(context, { name: 'Production', origin: 'https://customer.test' })
    ).resolves.toMatchObject({ licenseKey: 'signed.jwt' });
    await controller.update(context, 'key-1', { name: 'Renamed' });
    await controller.revoke(context, 'key-1');

    expect(service.list).toHaveBeenCalledWith('project-1');
    expect(service.create).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      name: 'Production',
      origin: 'https://customer.test',
    });
    expect(service.rename).toHaveBeenCalledWith('project-1', 'key-1', 'Renamed');
    expect(service.revoke).toHaveBeenCalledWith('project-1', 'key-1');
  });
});
