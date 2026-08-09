import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeySignerService } from './license-key-signer.service';
import { LicenseKeyService } from './license-key.service';

function buildService() {
  const stored = new Map<string, LicenseKey>();
  const repository = {
    create: jest.fn((entity: LicenseKey) => entity),
    save: jest.fn(async (entity: LicenseKey) => {
      stored.set(entity.licenseKeyId, { ...entity, createdAt: entity.createdAt ?? new Date() });
      return stored.get(entity.licenseKeyId)!;
    }),
    find: jest.fn(async ({ where }: { where: { projectId: string } }) =>
      [...stored.values()].filter(
        record => record.projectId === where.projectId && !record.revokedAt
      )
    ),
    findOne: jest.fn(async ({ where }: { where: Partial<LicenseKey> }) => {
      const record = stored.get(where.licenseKeyId as string);
      if (!record) return null;
      return where.projectId && record.projectId !== where.projectId ? null : record;
    }),
  } as unknown as jest.Mocked<Repository<LicenseKey>>;

  const signer = {
    sign: jest.fn().mockReturnValue('signed.jwt.value'),
  } as unknown as jest.Mocked<LicenseKeySignerService>;
  const publicOriginService = new PublicOriginService({
    get: () => undefined,
  } as unknown as ConfigService);

  return {
    service: new LicenseKeyService(repository, signer, publicOriginService),
    repository,
    signer,
    stored,
  };
}

describe('LicenseKeyService', () => {
  it('issues a key bound to the normalized origin and the owning project', async () => {
    const { service, signer } = buildService();

    const issued = await service.create({
      projectId: 'proj-1',
      userId: 'user-1',
      name: 'Production',
      origin: 'customer.test/app/',
    });

    expect(issued.licenseKey).toBe('signed.jwt.value');
    expect(issued.record.origin).toBe('http://customer.test');
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'http://customer.test',
        billingProjectId: 'proj-1',
        licenseKeyId: issued.record.licenseKeyId,
      })
    );
  });

  it.each(['http:::', 'not a url', 'ftp://data-marts.example.com', '  '])(
    'rejects %s as a public origin with a bad request',
    async origin => {
      const { service, signer } = buildService();

      await expect(
        service.create({ projectId: 'proj-1', userId: 'user-1', name: 'Production', origin })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(signer.sign).not.toHaveBeenCalled();
    }
  );

  it('never stores the signed key itself', async () => {
    const { service, stored } = buildService();

    await service.create({
      projectId: 'proj-1',
      userId: 'user-1',
      name: 'Production',
      origin: 'https://customer.test',
    });

    expect(JSON.stringify([...stored.values()])).not.toContain('signed.jwt.value');
  });

  it('renames only a key owned by the project', async () => {
    const { service } = buildService();
    const issued = await service.create({
      projectId: 'proj-1',
      userId: 'user-1',
      name: 'Old',
      origin: 'https://customer.test',
    });

    await expect(
      service.rename('proj-1', issued.record.licenseKeyId, 'New')
    ).resolves.toMatchObject({
      name: 'New',
    });
    await expect(
      service.rename('other-project', issued.record.licenseKeyId, 'New')
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revokes a key and stops resolving it as active', async () => {
    const { service } = buildService();
    const issued = await service.create({
      projectId: 'proj-1',
      userId: 'user-1',
      name: 'Production',
      origin: 'https://customer.test',
    });

    await expect(service.findActive(issued.record.licenseKeyId, 'proj-1')).resolves.not.toBeNull();

    await service.revoke('proj-1', issued.record.licenseKeyId);

    await expect(service.findActive(issued.record.licenseKeyId, 'proj-1')).resolves.toBeNull();
  });

  it('drops a revoked key out of the project list', async () => {
    const { service } = buildService();
    const issued = await service.create({
      projectId: 'proj-1',
      userId: 'user-1',
      name: 'Production',
      origin: 'https://customer.test',
    });

    await expect(service.list('proj-1')).resolves.toHaveLength(1);

    await service.revoke('proj-1', issued.record.licenseKeyId);

    await expect(service.list('proj-1')).resolves.toHaveLength(0);
  });

  it('does not resolve a key for a billing project that does not own it', async () => {
    const { service } = buildService();
    const issued = await service.create({
      projectId: 'proj-1',
      userId: 'user-1',
      name: 'Production',
      origin: 'https://customer.test',
    });

    await expect(
      service.findActive(issued.record.licenseKeyId, 'other-project')
    ).resolves.toBeNull();
  });

  it('does not resolve an expired key', async () => {
    const { service, stored } = buildService();
    const issued = await service.create({
      projectId: 'proj-1',
      userId: 'user-1',
      name: 'Production',
      origin: 'https://customer.test',
    });
    stored.get(issued.record.licenseKeyId)!.expiresAt = new Date(Date.now() - 1000);

    await expect(service.findActive(issued.record.licenseKeyId, 'proj-1')).resolves.toBeNull();
  });
});
