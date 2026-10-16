import { DataSource } from 'typeorm';
import {
  CREDENTIAL_VALIDATION_ENTITIES,
  credentialValidationWriteCases,
} from '../../../../test/fixtures/credential-validation-writes';
import { CredentialService } from './credential.service';

describe('CredentialService usage metadata', () => {
  it('derives aggregate last use from the newest consumer binding', async () => {
    const usedAt = new Date('2026-08-27T10:00:00.000Z');
    const bindings = { findOne: jest.fn().mockResolvedValue({ lastUsedAt: usedAt }) };
    const service = new CredentialService({} as never, bindings as never);

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
    const service = new CredentialService({ createQueryBuilder, findOne } as never, {} as never);

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
    const service = new CredentialService(
      { createQueryBuilder: jest.fn().mockReturnValue({ update }), findOne } as never,
      {} as never
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
