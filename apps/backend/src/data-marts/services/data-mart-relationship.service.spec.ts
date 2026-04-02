import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMartRelationshipService } from './data-mart-relationship.service';

function makeRelationship(
  sourceId: string,
  targetId: string,
  overrides: Partial<DataMartRelationship> = {}
): DataMartRelationship {
  return {
    id: `rel-${sourceId}-${targetId}`,
    sourceDataMart: { id: sourceId } as DataMart,
    targetDataMart: { id: targetId } as DataMart,
    dataStorage: { id: 'storage-1' } as DataStorage,
    targetAlias: 'alias',
    joinConditions: [],
    blendedFields: [],
    projectId: 'project-1',
    createdById: 'user-1',
    createdAt: new Date(),
    modifiedAt: new Date(),
    ...overrides,
  } as DataMartRelationship;
}

describe('DataMartRelationshipService', () => {
  let service: DataMartRelationshipService;
  let repository: jest.Mocked<Repository<DataMartRelationship>>;

  beforeEach(async () => {
    const mockRepository: Partial<jest.Mocked<Repository<DataMartRelationship>>> = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataMartRelationshipService,
        {
          provide: getRepositoryToken(DataMartRelationship),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<DataMartRelationshipService>(DataMartRelationshipService);
    repository = module.get(getRepositoryToken(DataMartRelationship));
  });

  describe('validateNoSelfReference', () => {
    it('throws BusinessViolationException when source and target are the same', () => {
      expect(() => service.validateNoSelfReference('dm-1', 'dm-1')).toThrow(
        BusinessViolationException
      );
    });

    it('does not throw when source and target are different', () => {
      expect(() => service.validateNoSelfReference('dm-1', 'dm-2')).not.toThrow();
    });
  });

  describe('validateSameStorage', () => {
    it('throws BusinessViolationException when storage IDs differ', () => {
      expect(() => service.validateSameStorage('storage-1', 'storage-2')).toThrow(
        BusinessViolationException
      );
    });

    it('does not throw when storage IDs are the same', () => {
      expect(() => service.validateSameStorage('storage-1', 'storage-1')).not.toThrow();
    });
  });

  describe('detectCycles', () => {
    it('detects a direct cycle: A→B exists, adding B→A returns true', async () => {
      const existingRelationship = makeRelationship('dm-A', 'dm-B');
      repository.find.mockResolvedValue([existingRelationship]);

      const hasCycle = await service.detectCycles('dm-B', 'dm-A', 'storage-1');

      expect(hasCycle).toBe(true);
    });

    it('returns false when there is no cycle', async () => {
      // A→B, adding A→C — no cycle
      const existingRelationship = makeRelationship('dm-A', 'dm-B');
      repository.find.mockResolvedValue([existingRelationship]);

      const hasCycle = await service.detectCycles('dm-A', 'dm-C', 'storage-1');

      expect(hasCycle).toBe(false);
    });

    it('detects a transitive cycle: A→B, B→C, adding C→A returns true', async () => {
      const relAB = makeRelationship('dm-A', 'dm-B', { id: 'rel-AB' });
      const relBC = makeRelationship('dm-B', 'dm-C', { id: 'rel-BC' });
      repository.find.mockResolvedValue([relAB, relBC]);

      const hasCycle = await service.detectCycles('dm-C', 'dm-A', 'storage-1');

      expect(hasCycle).toBe(true);
    });

    it('returns false when there are no existing relationships', async () => {
      repository.find.mockResolvedValue([]);

      const hasCycle = await service.detectCycles('dm-A', 'dm-B', 'storage-1');

      expect(hasCycle).toBe(false);
    });
  });

  describe('findBySourceDataMartId', () => {
    it('calls repository with correct where clause and relations', async () => {
      const expected = [makeRelationship('dm-1', 'dm-2')];
      repository.find.mockResolvedValue(expected);

      const result = await service.findBySourceDataMartId('dm-1');

      expect(repository.find).toHaveBeenCalledWith({
        where: { sourceDataMart: { id: 'dm-1' } },
        relations: ['sourceDataMart', 'targetDataMart', 'dataStorage'],
      });
      expect(result).toBe(expected);
    });
  });

  describe('create', () => {
    it('saves entity with correct fields from command', async () => {
      const command = new CreateRelationshipCommand(
        'dm-source',
        'dm-target',
        'my_alias',
        [],
        [],
        'user-1',
        'project-1'
      );
      const sourceDataMart = {
        id: 'dm-source',
        storage: { id: 'storage-1' } as DataStorage,
      } as DataMart;

      const createdEntity = makeRelationship('dm-source', 'dm-target');
      repository.create.mockReturnValue(createdEntity);
      repository.save.mockResolvedValue(createdEntity);

      const result = await service.create(command, sourceDataMart);

      expect(repository.create).toHaveBeenCalledWith({
        sourceDataMart: { id: 'dm-source' },
        targetDataMart: { id: 'dm-target' },
        dataStorage: { id: 'storage-1' },
        targetAlias: 'my_alias',
        joinConditions: [],
        blendedFields: [],
        projectId: 'project-1',
        createdById: 'user-1',
      });
      expect(repository.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toBe(createdEntity);
    });
  });
});
