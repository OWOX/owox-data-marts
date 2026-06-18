import { RoleScope } from '../enums/role-scope.enum';
import { InsightTemplateService } from './insight-template.service';

describe('InsightTemplateService', () => {
  function createQueryBuilder(result: Array<{ id: string }> = []) {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(result.map(item => ({ id: item.id }))),
      getMany: jest.fn().mockResolvedValue(result),
    };
  }

  it('lists project-visible insight templates with Data Mart visibility filtering and pagination', async () => {
    const insightTemplate = { id: 'insight-template-1' };
    const qb = createQueryBuilder([insightTemplate]);
    const rowsQb = createQueryBuilder([insightTemplate]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValueOnce(qb).mockReturnValueOnce(rowsQb),
    };
    const service = new InsightTemplateService(repository as never);

    const result = await service.listVisibleByProject({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
      limit: 20,
      offset: 40,
    });

    expect(result).toEqual([{ id: 'insight-template-1' }]);
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('insightTemplate');
    expect(qb.innerJoin).toHaveBeenCalledWith('insightTemplate.dataMart', 'dataMart');
    expect(rowsQb.leftJoinAndSelect).toHaveBeenCalledWith(
      'insightTemplate.sourceEntities',
      'sourceEntities'
    );
    expect(qb.where).toHaveBeenCalledWith('dataMart.projectId = :projectId', {
      projectId: 'project-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('dataMart.deletedAt IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('data_mart_contexts'), {
      userId: 'user-1',
      isTrue: true,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      entireProjectScope: RoleScope.ENTIRE_PROJECT,
      projectId: 'project-1',
    });
    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(qb.offset).toHaveBeenCalledWith(40);
    expect(rowsQb.orderBy).not.toHaveBeenCalled();
  });

  it('defaults project-visible insight template pagination to 100', async () => {
    const qb = createQueryBuilder();
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const service = new InsightTemplateService(repository as never);

    await service.listVisibleByProject({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
    });

    expect(qb.limit).toHaveBeenCalledWith(100);
    expect(qb.offset).toHaveBeenCalledWith(0);
  });
});
