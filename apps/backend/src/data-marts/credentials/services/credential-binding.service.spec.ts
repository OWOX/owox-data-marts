jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { CREDENTIAL_VALIDATION_ENTITIES } from '../../../../test/fixtures/credential-validation-writes';
import { Action, EntityType } from '../../services/access-decision';
import { normalizeCredentialRequirement } from '../credential.types';
import { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import { CredentialContext } from '../entities/credential-context.entity';
import { CredentialOwner } from '../entities/credential-owner.entity';
import { Credential } from '../entities/credential.entity';
import { CredentialBindingService } from './credential-binding.service';
import { requirementRevision } from './credential-requirement-revision';
import { CredentialService } from './credential.service';

describe('CredentialBindingService', () => {
  let dataSource: DataSource;
  let credentials: Repository<Credential>;
  let bindings: Repository<CredentialConsumerBinding>;
  let access: { canAccess: jest.Mock };
  let service: CredentialBindingService;

  const installation = {
    consumerType: 'plugin-installation' as const,
    consumerId: 'installation-1',
  };
  const requirement = normalizeCredentialRequirement('github');

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [...CREDENTIAL_VALIDATION_ENTITIES, CredentialConsumerBinding],
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  afterEach(() => jest.restoreAllMocks());

  beforeEach(async () => {
    for (const entity of [CredentialConsumerBinding, CredentialOwner, Credential]) {
      await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    credentials = dataSource.getRepository(Credential);
    bindings = dataSource.getRepository(CredentialConsumerBinding);
    access = { canAccess: jest.fn().mockResolvedValue(true) };
    service = new CredentialBindingService(
      bindings,
      credentials,
      dataSource.getRepository(CredentialContext),
      access as never,
      new CredentialService(
        credentials,
        bindings,
        dataSource.getRepository(CredentialOwner),
        dataSource.getRepository(CredentialContext),
        {} as never,
        {} as never
      )
    );
  });

  function givenCredential(overrides: Partial<Credential> = {}): Promise<Credential> {
    return credentials.save(
      credentials.create({
        projectId: 'project-1',
        title: 'GitHub token',
        definitionSource: 'builtin',
        definitionId: 'github',
        secret: { value: 'token' },
        ...overrides,
      })
    );
  }

  function bind(credentialId: string, overrides: Record<string, unknown> = {}) {
    return service.bind({
      projectId: 'project-1',
      userId: 'member-1',
      roles: ['editor'],
      credentialId,
      acceptedDefinitionIds: ['github'],
      notAcceptedMessage: 'This Credential cannot be used by this installation.',
      ...installation,
      requirementKey: 'github',
      requirement,
      ...overrides,
    });
  }

  function rows() {
    return bindings.find({ where: installation, order: { requirementKey: 'ASC' } });
  }

  describe('bind for a plugin installation', () => {
    it('writes one row per requirement key, checked against USE', async () => {
      const credential = await givenCredential();
      const optional = normalizeCredentialRequirement({ id: 'github', optional: true });

      await bind(credential.id);
      await bind(credential.id, { requirementKey: 'backup', requirement: optional });

      expect(await rows()).toEqual([
        expect.objectContaining({ requirementKey: 'backup', requirementSnapshot: optional }),
        expect.objectContaining({
          projectId: 'project-1',
          credentialId: credential.id,
          requirementKey: 'github',
          requirementSnapshot: requirement,
          requirementRevision: requirementRevision(requirement),
          configuredById: 'member-1',
          active: true,
          lastUsedAt: null,
        }),
      ]);
      expect(access.canAccess).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        EntityType.CREDENTIAL,
        credential.id,
        Action.USE,
        'project-1'
      );
    });

    it('reuses the row, forgetting the last use only when the Credential changes', async () => {
      const first = await givenCredential();
      const second = await givenCredential({ title: 'Another token' });
      const usedAt = new Date('2026-10-01T00:00:00.000Z');
      await bind(first.id);
      await bindings.update(installation, { lastUsedAt: usedAt });

      await bind(first.id);
      expect(await rows()).toEqual([expect.objectContaining({ lastUsedAt: usedAt })]);

      await service.deactivate(installation);
      await bind(second.id);
      expect(await rows()).toEqual([
        expect.objectContaining({ credentialId: second.id, active: true, lastUsedAt: null }),
      ]);
    });

    it("refuses another definition in the consumer's words, after USE", async () => {
      const credential = await givenCredential({ definitionId: 'openai' });

      await expect(bind(credential.id)).rejects.toThrow(
        new BadRequestException('This Credential cannot be used by this installation.')
      );
      access.canAccess.mockResolvedValue(false);
      await expect(bind(credential.id)).rejects.toThrow(
        new ForbiddenException('You cannot use this Credential.')
      );
      expect(await rows()).toEqual([]);
    });

    it('forgets the last use the racer recorded when a concurrent first binding wins the insert', async () => {
      const racer = await givenCredential();
      const chosen = await givenCredential({ title: 'Chosen token' });
      await bindings.insert({
        ...installation,
        requirementKey: 'github',
        projectId: 'project-1',
        credentialId: racer.id,
        requirementSnapshot: requirement,
        requirementRevision: requirementRevision(requirement),
        configuredById: 'member-2',
        lastUsedAt: new Date('2026-10-01T00:00:00.000Z'),
      });
      jest.spyOn(bindings, 'findOneBy').mockResolvedValueOnce(null);

      await bind(chosen.id);

      expect(await rows()).toEqual([
        expect.objectContaining({
          credentialId: chosen.id,
          configuredById: 'member-1',
          active: true,
          lastUsedAt: null,
        }),
      ]);
    });
  });

  describe('deactivate', () => {
    it('deactivates every requirement of the consumer and nothing of other consumers', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      await bind(credential.id, { requirementKey: 'backup' });
      await bind(credential.id, { consumerId: 'installation-2' });

      await service.deactivate(installation);

      expect((await rows()).map(row => row.active)).toEqual([false, false]);
      await expect(
        bindings.findOneByOrFail({ consumerId: 'installation-2' })
      ).resolves.toMatchObject({ active: true });
    });
  });

  describe('resolve', () => {
    it('returns the active binding with its Credential, and null for a Credential that is gone', async () => {
      const credential = await givenCredential();
      await bind(credential.id);
      const key = { projectId: 'project-1', ...installation, requirementKey: 'github' };

      await expect(service.resolve(key)).resolves.toEqual({
        binding: expect.objectContaining({ credentialId: credential.id }),
        credential: expect.objectContaining({ id: credential.id }),
      });
      await credentials.softDelete({ id: credential.id });
      await expect(service.resolve(key)).resolves.toEqual({
        binding: expect.objectContaining({ credentialId: credential.id }),
        credential: null,
      });
      await expect(service.resolve({ ...key, projectId: 'project-2' })).resolves.toBeNull();
    });
  });
});
