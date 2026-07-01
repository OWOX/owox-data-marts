import { RoleScope } from '../enums/role-scope.enum';
import { ScheduledTriggerService } from './scheduled-trigger.service';

function createQueryBuilder() {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getMany: jest.fn(),
  };
}

describe('ScheduledTriggerService', () => {
  it('sorts only IDs and restores their order after loading trigger rows', async () => {
    const pageQb = createQueryBuilder();
    pageQb.getRawMany.mockResolvedValue([{ id: 'trigger-2' }, { id: 'trigger-1' }]);
    const rowsQb = createQueryBuilder();
    rowsQb.getMany.mockResolvedValue([{ id: 'trigger-1' }, { id: 'trigger-2' }]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValueOnce(pageQb).mockReturnValueOnce(rowsQb),
    };
    const service = new ScheduledTriggerService(repository as never);

    const result = await service.listVisibleByProject({
      projectId: 'project-1',
      userId: 'admin-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
      limit: 20,
      offset: 40,
    });

    expect(pageQb.select).toHaveBeenCalledWith('scheduledTrigger.id', 'id');
    expect(pageQb.limit).toHaveBeenCalledWith(20);
    expect(pageQb.offset).toHaveBeenCalledWith(40);
    expect(rowsQb.select).toHaveBeenCalledWith([
      'scheduledTrigger',
      'dataMart.id',
      'dataMart.title',
      'dataMart.definition',
    ]);
    expect(rowsQb.orderBy).not.toHaveBeenCalled();
    expect(result.map(trigger => trigger.id)).toEqual(['trigger-2', 'trigger-1']);
  });

  it('does not load full rows for an empty page', async () => {
    const pageQb = createQueryBuilder();
    pageQb.getRawMany.mockResolvedValue([]);
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(pageQb) };
    const service = new ScheduledTriggerService(repository as never);

    await expect(
      service.listVisibleByProject({
        projectId: 'project-1',
        userId: 'admin-1',
        roles: ['admin'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      })
    ).resolves.toEqual([]);

    expect(repository.createQueryBuilder).toHaveBeenCalledTimes(1);
  });
});
