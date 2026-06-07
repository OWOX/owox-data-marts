import { RoleScope } from '../enums/role-scope.enum';
import { InsightTemplateService } from './insight-template.service';

describe('InsightTemplateService', () => {
  function createQueryBuilder(result: unknown[] = []) {
    return {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
  }

  it('lists project-visible insight templates with Data Mart visibility filtering and pagination', async () => {
    const qb = createQueryBuilder([{ id: 'insight-template-1' }]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
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
    expect(qb.innerJoinAndSelect).toHaveBeenCalledWith('insightTemplate.dataMart', 'dataMart');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
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
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(qb.skip).toHaveBeenCalledWith(40);
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

    expect(qb.take).toHaveBeenCalledWith(100);
    expect(qb.skip).toHaveBeenCalledWith(0);
  });
});
