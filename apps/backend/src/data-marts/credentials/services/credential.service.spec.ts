jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthorizationContext } from '../../../idp';
import {
  CREDENTIAL_VALIDATION_ENTITIES,
  credentialValidationWriteCases,
} from '../../../../test/fixtures/credential-validation-writes';
import { CredentialService } from './credential.service';

/** A service whose only real repositories are the ones a test passes. */
function credentialService(credentials: unknown, bindings: unknown): CredentialService {
  return new CredentialService(
    credentials as never,
    bindings as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
}

describe('CredentialService.createWithAccess', () => {
  const member = {
    projectId: 'project-1',
    userId: 'member-1',
    roles: ['editor'],
  } as AuthorizationContext;

  function setup() {
    const credentials = {
      create: jest.fn((value: object) => ({ ...value })),
      save: jest.fn((value: object) => Promise.resolve({ id: 'credential-1', ...value })),
    };
    const owners = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) => Promise.resolve(value)),
      delete: jest.fn(),
    };
    const credentialContexts = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
    const idpProjections = {
      getProjectMembers: jest.fn().mockResolvedValue([
        { userId: 'member-1', isOutbound: false },
        { userId: 'member-2', isOutbound: false },
      ]),
    };
    const contexts = { validateContextIds: jest.fn() };
    const service = new CredentialService(
      credentials as never,
      {} as never,
      owners as never,
      credentialContexts as never,
      idpProjections as never,
      contexts as never
    );
    return { service, credentials, owners, credentialContexts, idpProjections, contexts };
  }

  it('makes the member the first owner and checks owners and Contexts against the project', async () => {
    const state = setup();

    await state.service.createWithAccess(
      { projectId: 'project-1', title: 'Warehouse key' },
      { createdBy: member, ownerIds: ['member-2', 'member-1'], contextIds: ['ctx-1', 'ctx-1'] }
    );

    expect(state.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', createdById: 'member-1' })
    );
    expect(state.idpProjections.getProjectMembers).toHaveBeenCalledWith('project-1');
    expect(state.owners.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', userId: 'member-1' },
      { credentialId: 'credential-1', userId: 'member-2' },
    ]);
    expect(state.contexts.validateContextIds).toHaveBeenCalledWith(['ctx-1'], 'project-1');
    expect(state.credentialContexts.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', contextId: 'ctx-1' },
    ]);
  });

  it('refuses an owner who is not a member of the project', async () => {
    const state = setup();

    await expect(
      state.service.createWithAccess(
        { projectId: 'project-1', title: 'Warehouse key' },
        { createdBy: member, ownerIds: ['outsider'], contextIds: [] }
      )
    ).rejects.toThrow(BadRequestException);
    expect(state.owners.save).not.toHaveBeenCalled();
  });

  it('saves the owners and Contexts of a write no member chose as they are', async () => {
    const state = setup();

    await state.service.createWithAccess(
      { projectId: 'project-1', title: 'Warehouse key', availableForUse: false },
      { createdBy: null, ownerIds: ['former-member', 'former-member'], contextIds: ['ctx-1'] }
    );

    expect(state.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({ availableForUse: false, createdById: null })
    );
    expect(state.idpProjections.getProjectMembers).not.toHaveBeenCalled();
    expect(state.contexts.validateContextIds).not.toHaveBeenCalled();
    expect(state.owners.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', userId: 'former-member' },
    ]);
    expect(state.credentialContexts.save).toHaveBeenCalledWith([
      { credentialId: 'credential-1', contextId: 'ctx-1' },
    ]);
  });
});

describe('CredentialService usage metadata', () => {
  it('derives aggregate last use from the newest consumer binding', async () => {
    const usedAt = new Date('2026-08-27T10:00:00.000Z');
    const bindings = { findOne: jest.fn().mockResolvedValue({ lastUsedAt: usedAt }) };
    const service = credentialService({}, bindings);

    await expect(service.getLastUsedAt('credential-1')).resolves.toEqual(usedAt);
    expect(bindings.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ credentialId: 'credential-1' }),
        order: { lastUsedAt: 'DESC' },
        select: { lastUsedAt: true },
      })
    );
  });

  it('acquires a cross-database write lock without changing Credential data', async () => {
    const credential = { id: 'credential-1', projectId: 'project-1' };
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnValue({ andWhere });
    andWhere.mockReturnValueOnce({ andWhere }).mockReturnValueOnce({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const createQueryBuilder = jest.fn().mockReturnValue({ update });
    const findOne = jest.fn().mockResolvedValue(credential);
    const service = credentialService({ createQueryBuilder, findOne }, {});

    await expect(service.lockActiveByIdAndProjectId('credential-1', 'project-1')).resolves.toBe(
      credential
    );

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ modifiedAt: expect.any(Function) });
    expect(execute).toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'credential-1', projectId: 'project-1' } })
    );
  });

  it('does not reuse a stale transaction snapshot when the locking update misses', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 0 });
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnValue({ andWhere });
    andWhere.mockReturnValueOnce({ andWhere }).mockReturnValueOnce({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const findOne = jest.fn();
    const service = credentialService(
      { createQueryBuilder: jest.fn().mockReturnValue({ update }), findOne },
      {}
    );

    await expect(
      service.lockActiveByIdAndProjectId('credential-1', 'project-1')
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('CredentialService validation writes (SQLite)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
  });

  afterAll(() => dataSource.destroy());

  credentialValidationWriteCases(() => dataSource);
});
