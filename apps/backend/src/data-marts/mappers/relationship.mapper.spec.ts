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

const mockSourceDataMart = {
  id: 'source-dm-1',
  title: 'Source Mart',
} as DataMart;
const mockTargetDataMart = {
  id: 'target-dm-2',
  title: 'Target Mart',
} as DataMart;
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

  describe('toDomainDto', () => {
    it('should map entity to RelationshipDto', () => {
      const dto = mapper.toDomainDto(mockEntity);

      expect(dto.id).toBe('rel-1');
      expect(dto.dataStorageId).toBe('storage-1');
      expect(dto.sourceDataMart.id).toBe('source-dm-1');
      expect(dto.sourceDataMart.title).toBe('Source Mart');
      expect(dto.targetDataMart.id).toBe('target-dm-2');
      expect(dto.targetDataMart.title).toBe('Target Mart');
      expect(dto.targetAlias).toBe('orders');
      expect(dto.joinConditions).toEqual([
        { sourceFieldName: 'user_id', targetFieldName: 'user_id' },
      ]);
      expect(dto.createdById).toBe('user-123');
      expect(dto.createdAt).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(dto.modifiedAt).toEqual(new Date('2024-01-02T00:00:00.000Z'));
      expect(dto.createdByUser).toBeNull();
    });
  });

  describe('toDomainDtoList', () => {
    it('should map array of entities to array of RelationshipDto', () => {
      const secondEntity: DataMartRelationship = {
        ...mockEntity,
        id: 'rel-2',
        targetAlias: 'sessions',
      };

      const dtos = mapper.toDomainDtoList([mockEntity, secondEntity]);

      expect(dtos).toHaveLength(2);
      expect(dtos[0].id).toBe('rel-1');
      expect(dtos[1].id).toBe('rel-2');
      expect(dtos[1].targetAlias).toBe('sessions');
    });

    it('should return empty array for empty input', () => {
      const dtos = mapper.toDomainDtoList([]);
      expect(dtos).toHaveLength(0);
    });
  });

  describe('toResponse', () => {
    it('should map RelationshipDto to RelationshipResponseApiDto', () => {
      const dto = mapper.toDomainDto(mockEntity);
      const response = mapper.toResponse(dto);

      expect(response.id).toBe(dto.id);
      expect(response.dataStorageId).toBe(dto.dataStorageId);
      expect(response.sourceDataMart).toEqual(dto.sourceDataMart);
      expect(response.targetDataMart).toEqual(dto.targetDataMart);
      expect(response.targetAlias).toBe(dto.targetAlias);
      expect(response.joinConditions).toEqual(dto.joinConditions);
    });
  });

  describe('toResponseList', () => {
    it('maps an array of RelationshipDto to an array of API DTOs', () => {
      const dtos = mapper.toDomainDtoList([
        mockEntity,
        { ...mockEntity, id: 'rel-2', targetAlias: 'sessions' },
      ]);

      const responses = mapper.toResponseList(dtos);

      expect(responses).toHaveLength(2);
      expect(responses[0].id).toBe('rel-1');
      expect(responses[1].targetAlias).toBe('sessions');
    });

    it('returns empty array for empty input', () => {
      expect(mapper.toResponseList([])).toHaveLength(0);
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
