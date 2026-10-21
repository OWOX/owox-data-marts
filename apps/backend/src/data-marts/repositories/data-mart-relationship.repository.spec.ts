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

  it('loads both ends of relationships that start or end at the given Data Marts', async () => {
    const outgoing = [
      { id: 'rel-1', sourceDataMartId: 'dm-1', targetDataMartId: 'dm-2' },
      { id: 'rel-2', sourceDataMartId: 'dm-1', targetDataMartId: 'dm-3' },
    ];
    const incoming = [
      { id: 'rel-2', sourceDataMartId: 'dm-1', targetDataMartId: 'dm-3' },
      { id: 'rel-3', sourceDataMartId: 'dm-4', targetDataMartId: 'dm-1' },
    ];
    const qb = createQueryBuilder();
    qb.getRawMany.mockResolvedValueOnce(outgoing).mockResolvedValueOnce(incoming);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as jest.Mocked<Repository<DataMartRelationship>>;
    const graphRepository = new DataMartRelationshipRepository(repository);

    const result = await graphRepository.listEndpointRowsByProjectIdAndDataMartIds('project-1', [
      'dm-1',
      'dm-3',
    ]);

    expect(repository.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(qb.select).toHaveBeenCalledWith('relationship.id', 'id');
    expect(qb.addSelect).toHaveBeenCalledWith('source.id', 'sourceDataMartId');
    expect(qb.addSelect).toHaveBeenCalledWith('target.id', 'targetDataMartId');
    expect(qb.where).toHaveBeenCalledWith('relationship.projectId = :projectId', {
      projectId: 'project-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('source.deletedAt IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('target.deletedAt IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('relationship.sourceDataMart IN (:...dataMartIds)', {
      dataMartIds: ['dm-1', 'dm-3'],
    });
    expect(qb.andWhere).toHaveBeenCalledWith('relationship.targetDataMart IN (:...dataMartIds)', {
      dataMartIds: ['dm-1', 'dm-3'],
    });
    // rel-2 joins two of the given Data Marts, so both queries return it; it is kept once.
    expect(result).toEqual([outgoing[0], outgoing[1], incoming[1]]);
  });

  it('does not query endpoints for an empty Data Mart list', async () => {
    const repository = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<DataMartRelationship>>;
    const graphRepository = new DataMartRelationshipRepository(repository);

    await expect(
      graphRepository.listEndpointRowsByProjectIdAndDataMartIds('project-1', [])
    ).resolves.toEqual([]);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('scopes storage graph rows by project and storage', async () => {
    const qb = createQueryBuilder();
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as jest.Mocked<Repository<DataMartRelationship>>;
    const graphRepository = new DataMartRelationshipRepository(repository);

    await graphRepository.listGraphEdgeRowsByProjectIdAndStorageId('project-1', 'storage-1');

    expect(qb.where).toHaveBeenCalledWith('relationship.projectId = :projectId', {
      projectId: 'project-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('relationship.dataStorage = :storageId', {
      storageId: 'storage-1',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('relationship.createdAt', 'ASC');
    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
  });
});
