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
  blendedFields: [
    {
      targetFieldName: 'revenue',
      outputAlias: 'total_revenue',
      isHidden: false,
      aggregateFunction: 'SUM',
    },
  ],
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
        blendedFields: [{ targetFieldName: 'revenue', outputAlias: 'total_revenue' }],
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
      expect(command.blendedFields).toEqual([
        {
          targetFieldName: 'revenue',
          outputAlias: 'total_revenue',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ]);
    });

    it('should use provided isHidden and aggregateFunction when given', () => {
      const dto: CreateRelationshipRequestApiDto = {
        targetDataMartId: 'target-dm-2',
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'total',
            isHidden: true,
            aggregateFunction: 'SUM',
          },
        ],
      };

      const command = mapper.toCreateCommand('source-dm-1', mockContext, dto);

      expect(command.blendedFields[0].isHidden).toBe(true);
      expect(command.blendedFields[0].aggregateFunction).toBe('SUM');
    });
  });

  describe('toUpdateCommand', () => {
    it('should map API DTO to UpdateRelationshipCommand with all optional fields', () => {
      const dto: UpdateRelationshipRequestApiDto = {
        targetAlias: 'new_alias',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
        blendedFields: [{ targetFieldName: 'name', outputAlias: 'full_name', isHidden: false }],
      };

      const command = mapper.toUpdateCommand('rel-1', 'source-dm-1', mockContext, dto);

      expect(command.relationshipId).toBe('rel-1');
      expect(command.sourceDataMartId).toBe('source-dm-1');
      expect(command.userId).toBe('user-123');
      expect(command.projectId).toBe('project-456');
      expect(command.targetAlias).toBe('new_alias');
      expect(command.joinConditions).toEqual([{ sourceFieldName: 'id', targetFieldName: 'id' }]);
      expect(command.blendedFields?.[0].outputAlias).toBe('full_name');
    });

    it('should produce undefined for optional fields when not provided', () => {
      const dto: UpdateRelationshipRequestApiDto = {};

      const command = mapper.toUpdateCommand('rel-1', 'source-dm-1', mockContext, dto);

      expect(command.targetAlias).toBeUndefined();
      expect(command.joinConditions).toBeUndefined();
      expect(command.blendedFields).toBeUndefined();
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
      expect(response.blendedFields).toEqual([
        {
          targetFieldName: 'revenue',
          outputAlias: 'total_revenue',
          isHidden: false,
          aggregateFunction: 'SUM',
        },
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
