import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { JoinCondition } from '../dto/schemas/relationship-schemas';
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

  describe('validateJoinFieldTypes', () => {
    const STATUS = DataMartSchemaFieldStatus.CONNECTED;

    function makeSchema(fields: { name: string; type: string }[]): DataMartSchema {
      return {
        type: 'bigquery-data-mart-schema',
        fields: fields.map(f => ({
          name: f.name,
          type: f.type as never,
          status: STATUS,
          isPrimaryKey: false,
          mode: 'NULLABLE' as never,
        })),
      } as unknown as DataMartSchema;
    }

    function makeCondition(sourceFieldName: string, targetFieldName: string): JoinCondition {
      return { sourceFieldName, targetFieldName };
    }

    it('returns empty warnings when schemas are undefined', () => {
      const result = service.validateJoinFieldTypes(undefined, undefined, [
        makeCondition('id', 'user_id'),
      ]);
      expect(result.warnings).toHaveLength(0);
    });

    it('throws when source field has complex type RECORD', () => {
      const sourceSchema = makeSchema([{ name: 'nested', type: 'RECORD' }]);
      const targetSchema = makeSchema([{ name: 'user_id', type: 'STRING' }]);

      expect(() =>
        service.validateJoinFieldTypes(sourceSchema, targetSchema, [
          makeCondition('nested', 'user_id'),
        ])
      ).toThrow(BusinessViolationException);
    });

    it('throws when target field has complex type ARRAY', () => {
      const sourceSchema = makeSchema([{ name: 'id', type: 'STRING' }]);
      const targetSchema = makeSchema([{ name: 'tags', type: 'ARRAY' }]);

      expect(() =>
        service.validateJoinFieldTypes(sourceSchema, targetSchema, [makeCondition('id', 'tags')])
      ).toThrow(BusinessViolationException);
    });

    it('throws when types are incompatible (STRING vs INTEGER)', () => {
      const sourceSchema = makeSchema([{ name: 'name', type: 'STRING' }]);
      const targetSchema = makeSchema([{ name: 'count', type: 'INTEGER' }]);

      expect(() =>
        service.validateJoinFieldTypes(sourceSchema, targetSchema, [makeCondition('name', 'count')])
      ).toThrow(BusinessViolationException);
    });

    it('does not throw for compatible numeric types (INTEGER vs FLOAT)', () => {
      const sourceSchema = makeSchema([{ name: 'id', type: 'INTEGER' }]);
      const targetSchema = makeSchema([{ name: 'amount', type: 'FLOAT' }]);

      expect(() =>
        service.validateJoinFieldTypes(sourceSchema, targetSchema, [makeCondition('id', 'amount')])
      ).not.toThrow();
    });

    it('does not throw for identical types (STRING vs STRING)', () => {
      const sourceSchema = makeSchema([{ name: 'user_id', type: 'STRING' }]);
      const targetSchema = makeSchema([{ name: 'ref_id', type: 'STRING' }]);

      expect(() =>
        service.validateJoinFieldTypes(sourceSchema, targetSchema, [
          makeCondition('user_id', 'ref_id'),
        ])
      ).not.toThrow();
    });

    it('returns warning when source field is not found in schema', () => {
      const sourceSchema = makeSchema([{ name: 'id', type: 'STRING' }]);
      const targetSchema = makeSchema([{ name: 'ref_id', type: 'STRING' }]);

      const { warnings } = service.validateJoinFieldTypes(sourceSchema, targetSchema, [
        makeCondition('missing_field', 'ref_id'),
      ]);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('missing_field');
    });

    it('returns warning when target field is not found in schema', () => {
      const sourceSchema = makeSchema([{ name: 'id', type: 'STRING' }]);
      const targetSchema = makeSchema([{ name: 'ref_id', type: 'STRING' }]);

      const { warnings } = service.validateJoinFieldTypes(sourceSchema, targetSchema, [
        makeCondition('id', 'nonexistent_target'),
      ]);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('nonexistent_target');
    });

    it('accumulates multiple warnings for multiple missing fields', () => {
      const sourceSchema = makeSchema([{ name: 'id', type: 'STRING' }]);
      const targetSchema = makeSchema([{ name: 'ref_id', type: 'STRING' }]);

      const { warnings } = service.validateJoinFieldTypes(sourceSchema, targetSchema, [
        makeCondition('missing1', 'ref_id'),
        makeCondition('missing2', 'ref_id'),
      ]);

      expect(warnings).toHaveLength(2);
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
