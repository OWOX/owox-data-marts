jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

import { ListDataStoragesService } from './list-data-storages.service';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';

describe('ListDataStoragesService', () => {
  const makeQbChain = (results: unknown[]) => {
    const qb: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn(),
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      setParameters: jest.fn(),
      groupBy: jest.fn(),
      getMany: jest.fn(),
      getRawMany: jest.fn(),
    };
    // Make chainable (non-terminal methods return qb)
    qb.leftJoinAndSelect.mockReturnValue(qb);
    qb.leftJoin.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.select.mockReturnValue(qb);
    qb.addSelect.mockReturnValue(qb);
    qb.setParameters.mockReturnValue(qb);
    qb.groupBy.mockReturnValue(qb);
    // Terminal methods return actual data
    qb.getMany.mockResolvedValue(results);
    qb.getRawMany.mockResolvedValue([]);
    return qb;
  };

  const createService = (storages: unknown[]) => {
    const qb = makeQbChain(storages);

    const dataStorageRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const dataMartRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(makeQbChain([])),
    };
    const mapper = {
      toDomainDto: jest.fn().mockImplementation(s => ({ id: s.id })),
    };
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const contextAccessService = {
      getRoleScope: jest.fn().mockResolvedValue('entire_project'),
    };

    const service = new ListDataStoragesService(
      dataStorageRepo as never,
      dataMartRepo as never,
      mapper as never,
      userProjectionsFetcherService as never,
      contextAccessService as never
    );

    return { service, qb };
  };

  it('should add access filter for non-admin user', async () => {
    const { service, qb } = createService([]);
    const command = new ListDataStoragesCommand('proj-1', 'user-1', ['editor']);

    await service.run(command);

    const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
    const hasAccessFilter = andWhereCalls.some(
      (sql: string) =>
        typeof sql === 'string' && sql.includes('storage_owners') && sql.includes('availableForUse')
    );
    expect(hasAccessFilter).toBe(true);
  });

  it('should NOT add access filter for admin user', async () => {
    const { service, qb } = createService([]);
    const command = new ListDataStoragesCommand('proj-1', 'user-1', ['admin']);

    await service.run(command);

    const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
    const hasAccessFilter = andWhereCalls.some(
      (sql: string) =>
        typeof sql === 'string' && sql.includes('storage_owners') && sql.includes('availableForUse')
    );
    expect(hasAccessFilter).toBe(false);
  });
});
