import { NotFoundException } from '@nestjs/common';
import { RoleScope } from '../enums/role-scope.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
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

  it('applies the trigger type filter when a type is provided', async () => {
    const pageQb = createQueryBuilder();
    pageQb.getRawMany.mockResolvedValue([]);
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(pageQb) };
    const service = new ScheduledTriggerService(repository as never);

    await service.listVisibleByProject({
      projectId: 'project-1',
      userId: 'admin-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
      type: ScheduledTriggerType.REPORT_RUN,
    });

    expect(pageQb.andWhere).toHaveBeenCalledWith('scheduledTrigger.type = :type', {
      type: ScheduledTriggerType.REPORT_RUN,
    });
  });

  it('does not filter by type when none is provided', async () => {
    const pageQb = createQueryBuilder();
    pageQb.getRawMany.mockResolvedValue([]);
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(pageQb) };
    const service = new ScheduledTriggerService(repository as never);

    await service.listVisibleByProject({
      projectId: 'project-1',
      userId: 'admin-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
    });

    expect(pageQb.andWhere).not.toHaveBeenCalledWith(
      'scheduledTrigger.type = :type',
      expect.anything()
    );
  });

  it('loads a trigger scoped by project and throws when it is missing', async () => {
    const found = { id: 'trigger-1' };
    const repository = {
      findOne: jest.fn().mockResolvedValueOnce(found).mockResolvedValueOnce(null),
    };
    const service = new ScheduledTriggerService(repository as never);

    await expect(service.getByIdAndProjectId('trigger-1', 'project-1')).resolves.toBe(found);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'trigger-1', dataMart: { projectId: 'project-1' } },
      relations: ['dataMart'],
    });

    await expect(service.getByIdAndProjectId('missing', 'project-1')).rejects.toThrow(
      NotFoundException
    );
  });
});
