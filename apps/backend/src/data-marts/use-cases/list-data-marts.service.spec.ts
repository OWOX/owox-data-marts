import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { RoleScope } from '../enums/role-scope.enum';
import { ListDataMartsService } from './list-data-marts.service';

const countQueryBuilder = () => ({
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue([]),
});

const listedDataMart = (id: string) => ({ id, businessOwnerIds: [], technicalOwnerIds: [] });

describe('ListDataMartsService relationships count', () => {
  const setup = (relationships: { sourceDataMartId: string; targetDataMartId: string }[]) => {
    const dataMartService = {
      findByProjectIdForList: jest.fn().mockResolvedValue({
        items: ['orders', 'customers', 'sessions'].map(listedDataMart),
        total: 3,
      }),
      findVisibleIdsByProjectIdAndIds: jest.fn().mockResolvedValue(['products']),
    };
    const mapper = {
      toListItemDto: jest.fn((dataMart: { id: string }, counters: Record<string, number>) => ({
        id: dataMart.id,
        ...counters,
      })),
    };
    const relationshipService = {
      findEndpointsByDataMartIds: jest.fn().mockResolvedValue(relationships),
    };
    const service = new ListDataMartsService(
      dataMartService as never,
      mapper as never,
      { createQueryBuilder: jest.fn(countQueryBuilder) } as never,
      { createQueryBuilder: jest.fn(countQueryBuilder) } as never,
      {
        fetchAllRelevantUserProjections: jest
          .fn()
          .mockResolvedValue({ getByUserId: () => undefined }),
      } as never,
      { getRoleScope: jest.fn().mockResolvedValue(RoleScope.SELECTED_CONTEXTS) } as never,
      relationshipService as never
    );
    return { service, dataMartService, relationshipService };
  };

  const counts = (items: unknown[]) =>
    Object.fromEntries(
      (items as { id: string; relationshipsCount: number }[]).map(item => [
        item.id,
        item.relationshipsCount,
      ])
    );

  it('counts relationships in both directions, skipping ends the caller cannot see', async () => {
    const { service, dataMartService, relationshipService } = setup([
      { sourceDataMartId: 'orders', targetDataMartId: 'customers' },
      { sourceDataMartId: 'orders', targetDataMartId: 'orders' },
      { sourceDataMartId: 'products', targetDataMartId: 'orders' },
      { sourceDataMartId: 'sessions', targetDataMartId: 'hidden' },
    ]);

    const result = await service.run(new ListDataMartsCommand('project-1', 'user-1', ['viewer']));

    expect(relationshipService.findEndpointsByDataMartIds).toHaveBeenCalledWith('project-1', [
      'orders',
      'customers',
      'sessions',
    ]);
    expect(dataMartService.findVisibleIdsByProjectIdAndIds).toHaveBeenCalledWith(
      'project-1',
      ['products', 'hidden'],
      { userId: 'user-1', roles: ['viewer'], roleScope: RoleScope.SELECTED_CONTEXTS }
    );
    expect(counts(result.items)).toEqual({ orders: 3, customers: 1, sessions: 0 });
  });

  it('skips counting relationships when the caller does not return them', async () => {
    const { service, dataMartService, relationshipService } = setup([
      { sourceDataMartId: 'orders', targetDataMartId: 'customers' },
    ]);

    const result = await service.run(
      new ListDataMartsCommand(
        'project-1',
        'user-1',
        ['viewer'],
        undefined,
        undefined,
        undefined,
        undefined,
        false
      )
    );

    expect(relationshipService.findEndpointsByDataMartIds).not.toHaveBeenCalled();
    expect(dataMartService.findVisibleIdsByProjectIdAndIds).not.toHaveBeenCalled();
    expect(counts(result.items)).toEqual({ orders: 0, customers: 0, sessions: 0 });
  });

  it('skips the visibility query when the listed Data Marts have no relationships', async () => {
    const { service, dataMartService } = setup([]);

    const result = await service.run(new ListDataMartsCommand('project-1', 'user-1', ['viewer']));

    expect(dataMartService.findVisibleIdsByProjectIdAndIds).not.toHaveBeenCalled();
    expect(counts(result.items)).toEqual({ orders: 0, customers: 0, sessions: 0 });
  });
});
