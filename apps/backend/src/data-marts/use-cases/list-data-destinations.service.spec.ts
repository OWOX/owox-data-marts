jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

import { ListDataDestinationsService } from './list-data-destinations.service';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { RoleScope } from '../enums/role-scope.enum';

describe('ListDataDestinationsService', () => {
  const makeQbChain = (results: unknown[]) => {
    const qb: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn(),
    };
    qb.leftJoinAndSelect.mockReturnValue(qb);
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.getMany.mockResolvedValue(results);
    return qb;
  };

  const createService = (destinations: unknown[]) => {
    const qb = makeQbChain(destinations);

    const dataDestinationRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const mapper = {
      toDomainDtoList: jest.fn().mockReturnValue([]),
    };
    const userProjectionsFetcherService = {
      fetchUserProjectionsList: jest.fn().mockResolvedValue({
        getByUserId: jest.fn().mockReturnValue(null),
      }),
    };
    const contextAccessService = {
      getRoleScope: jest.fn().mockResolvedValue(RoleScope.ENTIRE_PROJECT),
    };

    const service = new ListDataDestinationsService(
      dataDestinationRepo as never,
      mapper as never,
      userProjectionsFetcherService as never,
      contextAccessService as never
    );

    return { service, qb };
  };

  it('should add access filter for non-admin user', async () => {
    const { service, qb } = createService([]);
    const command = new ListDataDestinationsCommand('proj-1', 'user-1', ['editor']);

    await service.run(command);

    const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
    const hasAccessFilter = andWhereCalls.some(
      (sql: string) =>
        typeof sql === 'string' &&
        sql.includes('destination_owners') &&
        sql.includes('availableForUse')
    );
    expect(hasAccessFilter).toBe(true);
  });

  it('should NOT add access filter for admin user', async () => {
    const { service, qb } = createService([]);
    const command = new ListDataDestinationsCommand('proj-1', 'user-1', ['admin']);

    await service.run(command);

    const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
    const hasAccessFilter = andWhereCalls.some(
      (sql: string) =>
        typeof sql === 'string' &&
        sql.includes('destination_owners') &&
        sql.includes('availableForUse')
    );
    expect(hasAccessFilter).toBe(false);
  });

  it('viewer and editor both get the same owner-or-shared filter (no role branch)', async () => {
    const { service: viewerSvc, qb: viewerQb } = createService([]);
    const { service: editorSvc, qb: editorQb } = createService([]);

    await viewerSvc.run(new ListDataDestinationsCommand('proj-1', 'user-1', ['viewer']));
    await editorSvc.run(new ListDataDestinationsCommand('proj-1', 'user-1', ['editor']));

    const viewerFilter = viewerQb.andWhere.mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((sql: string) => sql.includes('destination_owners'));

    const editorFilter = editorQb.andWhere.mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((sql: string) => sql.includes('destination_owners'));

    expect(viewerFilter).toBeDefined();
    expect(editorFilter).toBeDefined();
    expect(viewerFilter).toBe(editorFilter);
  });
});
