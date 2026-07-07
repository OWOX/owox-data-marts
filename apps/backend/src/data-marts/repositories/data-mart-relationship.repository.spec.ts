import { Repository } from 'typeorm';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartRelationshipRepository } from './data-mart-relationship.repository';

describe('DataMartRelationshipRepository', () => {
  const createQueryBuilder = (rawRows: unknown[] = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawRows),
  });

  it('loads compact graph edge rows without eager relationship entities', async () => {
    const qb = createQueryBuilder([
      {
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'dm-2',
        joinConditions: JSON.stringify([{ sourceFieldName: 'id', targetFieldName: 'id' }]),
      },
    ]);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as jest.Mocked<Repository<DataMartRelationship>>;
    const graphRepository = new DataMartRelationshipRepository(repository);

    const result = await graphRepository.listGraphEdgeRowsByProjectIdAndSourceDataMartIds(
      'project-1',
      ['dm-1', 'dm-3']
    );

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('relationship');
    expect(qb.select).toHaveBeenCalledWith('relationship.id', 'id');
    expect(qb.addSelect).toHaveBeenCalledWith('source.id', 'sourceDataMartId');
    expect(qb.addSelect).toHaveBeenCalledWith('target.id', 'targetDataMartId');
    expect(qb.addSelect).toHaveBeenCalledWith('relationship.joinConditions', 'joinConditions');
    expect(qb.innerJoin).toHaveBeenCalledWith('relationship.sourceDataMart', 'source');
    expect(qb.innerJoin).toHaveBeenCalledWith('relationship.targetDataMart', 'target');
    expect(qb.where).toHaveBeenCalledWith('relationship.projectId = :projectId', {
      projectId: 'project-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('source.id IN (:...sourceDataMartIds)', {
      sourceDataMartIds: ['dm-1', 'dm-3'],
    });
    expect(qb.orderBy).toHaveBeenCalledWith('relationship.createdAt', 'ASC');
    expect(result).toEqual([
      {
        id: 'rel-1',
        sourceDataMartId: 'dm-1',
        targetDataMartId: 'dm-2',
        joinConditions: JSON.stringify([{ sourceFieldName: 'id', targetFieldName: 'id' }]),
      },
    ]);
  });

  it('does not query when source list is empty', async () => {
    const repository = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<DataMartRelationship>>;
    const graphRepository = new DataMartRelationshipRepository(repository);

    await expect(
      graphRepository.listGraphEdgeRowsByProjectIdAndSourceDataMartIds('project-1', [])
    ).resolves.toEqual([]);

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
