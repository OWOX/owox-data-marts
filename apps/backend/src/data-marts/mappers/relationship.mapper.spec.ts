import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Test, TestingModule } from '@nestjs/testing';
import { RelationshipMapper } from './relationship.mapper';
import { AuthorizationContext } from '../../idp';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { CreateRelationshipRequestApiDto } from '../dto/presentation/create-relationship-request-api.dto';
import { UpdateRelationshipRequestApiDto } from '../dto/presentation/update-relationship-request-api.dto';

const mockContext: AuthorizationContext = {
  userId: 'user-123',
  projectId: 'project-456',
};

const mockSourceDataMart = { id: 'source-dm-1', title: 'Source Mart' } as DataMart;
const mockTargetDataMart = { id: 'target-dm-2', title: 'Target Mart' } as DataMart;
const mockDataStorage = { id: 'storage-1' } as DataStorage;

const mockEntity: DataMartRelationship = {
  id: 'rel-1',
  dataStorage: mockDataStorage,
  sourceDataMart: mockSourceDataMart,
  targetDataMart: mockTargetDataMart,
  targetAlias: 'orders',
  joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
  projectId: 'project-456',
  createdById: 'user-123',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  modifiedAt: new Date('2024-01-02T00:00:00.000Z'),
};

describe('RelationshipMapper', () => {
  let mapper: RelationshipMapper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RelationshipMapper],
    }).compile();

    mapper = module.get<RelationshipMapper>(RelationshipMapper);
  });

  describe('toCreateCommand', () => {
    it('should map API DTO to CreateRelationshipCommand', () => {
      const dto: CreateRelationshipRequestApiDto = {
        targetDataMartId: 'target-dm-2',
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
      };

      const command = mapper.toCreateCommand('source-dm-1', mockContext, dto);

      expect(command.sourceDataMartId).toBe('source-dm-1');
      expect(command.targetDataMartId).toBe('target-dm-2');
      expect(command.targetAlias).toBe('orders');
      expect(command.userId).toBe('user-123');
      expect(command.projectId).toBe('project-456');
      expect(command.joinConditions).toEqual([
        { sourceFieldName: 'user_id', targetFieldName: 'user_id' },
      ]);
    });
  });

  describe('toUpdateCommand', () => {
    it('should map API DTO to UpdateRelationshipCommand with all optional fields', () => {
      const dto: UpdateRelationshipRequestApiDto = {
        targetAlias: 'new_alias',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      };

      const command = mapper.toUpdateCommand('rel-1', 'source-dm-1', mockContext, dto);

      expect(command.relationshipId).toBe('rel-1');
      expect(command.sourceDataMartId).toBe('source-dm-1');
      expect(command.userId).toBe('user-123');
      expect(command.projectId).toBe('project-456');
      expect(command.targetAlias).toBe('new_alias');
      expect(command.joinConditions).toEqual([{ sourceFieldName: 'id', targetFieldName: 'id' }]);
    });

    it('should produce undefined for optional fields when not provided', () => {
      const dto: UpdateRelationshipRequestApiDto = {};

      const command = mapper.toUpdateCommand('rel-1', 'source-dm-1', mockContext, dto);

      expect(command.targetAlias).toBeUndefined();
      expect(command.joinConditions).toBeUndefined();
    });
  });

  describe('toGetCommand', () => {
    it('should map to GetRelationshipCommand', () => {
      const command = mapper.toGetCommand('rel-1', 'source-dm-1', mockContext);

      expect(command.relationshipId).toBe('rel-1');
      expect(command.sourceDataMartId).toBe('source-dm-1');
      expect(command.userId).toBe('user-123');
      expect(command.projectId).toBe('project-456');
    });
  });

  describe('toResponse', () => {
    it('should map entity to RelationshipResponseApiDto', () => {
      const response = mapper.toResponse(mockEntity);

      expect(response.id).toBe('rel-1');
      expect(response.dataStorageId).toBe('storage-1');
      expect(response.sourceDataMart).toEqual({
        id: 'source-dm-1',
        title: 'Source Mart',
        description: undefined,
      });
      expect(response.targetDataMart).toEqual({
        id: 'target-dm-2',
        title: 'Target Mart',
        description: undefined,
      });
      expect(response.targetAlias).toBe('orders');
      expect(response.joinConditions).toEqual([
        { sourceFieldName: 'user_id', targetFieldName: 'user_id' },
      ]);
      expect(response.createdById).toBe('user-123');
      expect(response.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(response.modifiedAt).toEqual(new Date('2024-01-02T00:00:00.000Z'));
    });
  });

  describe('toResponseList', () => {
    it('should map array of entities to array of RelationshipResponseApiDto', () => {
      const secondEntity: DataMartRelationship = {
        ...mockEntity,
        id: 'rel-2',
        targetAlias: 'sessions',
      };

      const responses = mapper.toResponseList([mockEntity, secondEntity]);

      expect(responses).toHaveLength(2);
      expect(responses[0].id).toBe('rel-1');
      expect(responses[1].id).toBe('rel-2');
      expect(responses[1].targetAlias).toBe('sessions');
    });

    it('should return empty array for empty input', () => {
      const responses = mapper.toResponseList([]);
      expect(responses).toHaveLength(0);
    });
  });
});

describe('CreateRelationshipRequestApiDto validation', () => {
  it('should pass validation when joinConditions is an empty array (draft state)', async () => {
    const dto = plainToInstance(CreateRelationshipRequestApiDto, {
      targetDataMartId: 'target-dm-1',
      targetAlias: 'orders',
      joinConditions: [],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation when joinConditions has items', async () => {
    const dto = plainToInstance(CreateRelationshipRequestApiDto, {
      targetDataMartId: 'target-dm-1',
      targetAlias: 'orders',
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('UpdateRelationshipRequestApiDto validation', () => {
  it('should fail validation when joinConditions is an empty array', async () => {
    const dto = plainToInstance(UpdateRelationshipRequestApiDto, {
      joinConditions: [],
    });

    const errors = await validate(dto);
    const joinConditionsError = errors.find(e => e.property === 'joinConditions');
    expect(joinConditionsError).toBeDefined();
    expect(joinConditionsError?.constraints).toHaveProperty('arrayMinSize');
  });

  it('should pass validation when joinConditions has at least one item', async () => {
    const dto = plainToInstance(UpdateRelationshipRequestApiDto, {
      joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
    });

    const errors = await validate(dto);
    const joinConditionsError = errors.find(e => e.property === 'joinConditions');
    expect(joinConditionsError).toBeUndefined();
  });

  it('should pass validation when joinConditions is omitted (optional field)', async () => {
    const dto = plainToInstance(UpdateRelationshipRequestApiDto, {
      targetAlias: 'new_alias',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
