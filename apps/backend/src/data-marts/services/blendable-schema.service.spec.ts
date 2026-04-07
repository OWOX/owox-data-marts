import { Test, TestingModule } from '@nestjs/testing';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';

function makeDataMart(overrides: Partial<DataMart> = {}): DataMart {
  return {
    id: 'dm-1',
    title: 'Data Mart 1',
    schema: undefined,
    projectId: 'project-1',
    createdById: 'user-1',
    status: 'draft' as DataMart['status'],
    createdAt: new Date(),
    modifiedAt: new Date(),
    storage: {} as unknown as DataMart['storage'],
    ...overrides,
  } as DataMart;
}

function makeRelationship(overrides: Partial<DataMartRelationship> = {}): DataMartRelationship {
  return {
    id: 'rel-1',
    targetAlias: 'customers',
    blendedFields: [],
    joinConditions: [],
    projectId: 'project-1',
    createdById: 'user-1',
    createdAt: new Date(),
    modifiedAt: new Date(),
    sourceDataMart: makeDataMart({ id: 'dm-1' }),
    targetDataMart: makeDataMart({ id: 'dm-2', title: 'Data Mart 2' }),
    dataStorage: {} as unknown as DataMartRelationship['dataStorage'],
    ...overrides,
  } as DataMartRelationship;
}

describe('BlendableSchemaService', () => {
  let service: BlendableSchemaService;
  let relationshipService: jest.Mocked<DataMartRelationshipService>;
  let dataMartService: jest.Mocked<DataMartService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlendableSchemaService,
        {
          provide: DataMartRelationshipService,
          useValue: {
            findBySourceDataMartId: jest.fn(),
          },
        },
        {
          provide: DataMartService,
          useValue: {
            getByIdAndProjectId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BlendableSchemaService>(BlendableSchemaService);
    relationshipService = module.get(DataMartRelationshipService);
    dataMartService = module.get(DataMartService);
  });

  describe('computeBlendableSchema', () => {
    it('should return native fields and empty blendedFields when no relationships exist', async () => {
      const nativeSchemaFields = [{ name: 'id', type: 'STRING' }];
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({
          id: 'dm-1',
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: nativeSchemaFields,
          } as unknown as DataMart['schema'],
        })
      );
      relationshipService.findBySourceDataMartId.mockResolvedValue([]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.nativeFields).toEqual(nativeSchemaFields);
      expect(result.blendedFields).toEqual([]);
    });

    it('should return empty arrays when schema is undefined and no relationships exist', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ schema: undefined }));
      relationshipService.findBySourceDataMartId.mockResolvedValue([]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.nativeFields).toEqual([]);
      expect(result.blendedFields).toEqual([]);
    });

    it('should return correct blended fields from a direct relationship', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));

      const targetSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          { name: 'customer_name', type: 'STRING' },
          { name: 'customer_age', type: 'INTEGER' },
        ],
      };
      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'customers',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Customers DM',
          schema: targetSchema as unknown as DataMart['schema'],
        }),
        blendedFields: [
          {
            targetFieldName: 'customer_name',
            outputAlias: 'customers_name',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
          {
            targetFieldName: 'customer_age',
            outputAlias: 'customers_age',
            isHidden: true,
            aggregateFunction: 'MAX',
          },
        ],
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.blendedFields).toHaveLength(2);

      const nameField = result.blendedFields[0];
      expect(nameField.name).toBe('customers_name');
      expect(nameField.sourceRelationshipId).toBe('rel-1');
      expect(nameField.sourceDataMartId).toBe('dm-2');
      expect(nameField.sourceDataMartTitle).toBe('Customers DM');
      expect(nameField.targetAlias).toBe('customers');
      expect(nameField.originalFieldName).toBe('customer_name');
      expect(nameField.type).toBe('STRING');
      expect(nameField.isHidden).toBe(false);
      expect(nameField.aggregateFunction).toBe('STRING_AGG');
      expect(nameField.transitiveDepth).toBe(1);

      const ageField = result.blendedFields[1];
      expect(ageField.type).toBe('INTEGER');
      expect(ageField.isHidden).toBe(true);
      expect(ageField.aggregateFunction).toBe('MAX');
      expect(ageField.transitiveDepth).toBe(1);
    });

    it('should resolve transitive relationships (A→B→C) with depth=2 for C fields', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const dmCSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [{ name: 'order_id', type: 'INTEGER' }],
      };

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b_alias',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({ id: 'dm-b', title: 'DM B', schema: undefined }),
        blendedFields: [],
      });

      const relBtoC = makeRelationship({
        id: 'rel-bc',
        targetAlias: 'c_alias',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          title: 'DM C',
          schema: dmCSchema as unknown as DataMart['schema'],
        }),
        blendedFields: [
          {
            targetFieldName: 'order_id',
            outputAlias: 'c_order_id',
            isHidden: false,
            aggregateFunction: 'MAX',
          },
        ],
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-a') return [relAtoB];
        if (id === 'dm-b') return [relBtoC];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      expect(result.blendedFields).toHaveLength(1);
      const field = result.blendedFields[0];
      expect(field.name).toBe('c_order_id');
      expect(field.sourceDataMartId).toBe('dm-c');
      expect(field.type).toBe('INTEGER');
      expect(field.transitiveDepth).toBe(2);
    });

    it('should prevent infinite loops via cycle protection (visited set)', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b_alias',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({ id: 'dm-b', title: 'DM B' }),
        blendedFields: [],
      });

      const relBtoA = makeRelationship({
        id: 'rel-ba',
        targetAlias: 'a_alias',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({ id: 'dm-a', title: 'DM A' }),
        blendedFields: [],
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-a') return [relAtoB];
        if (id === 'dm-b') return [relBtoA];
        return [];
      });

      // Should not throw and should terminate
      const result = await service.computeBlendableSchema('dm-a', 'project-1');
      expect(result.blendedFields).toEqual([]);

      // dm-a is in visited from the start, dm-b is added when first visited
      // findBySourceDataMartId should be called for dm-a (initial) and dm-b (first visit)
      // but NOT again for dm-a (cycle prevented)
      expect(relationshipService.findBySourceDataMartId).toHaveBeenCalledTimes(2);
    });

    it('should return blended fields from multiple relationships to the same target data mart', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));

      const targetSchema = {
        type: 'bigquery-data-mart-schema',
        fields: [
          { name: 'revenue', type: 'FLOAT' },
          { name: 'country', type: 'STRING' },
        ],
      };
      const targetDm = makeDataMart({
        id: 'dm-2',
        title: 'Orders DM',
        schema: targetSchema as unknown as DataMart['schema'],
      });

      const rel1 = makeRelationship({
        id: 'rel-1',
        targetAlias: 'orders',
        targetDataMart: targetDm,
        blendedFields: [
          {
            targetFieldName: 'revenue',
            outputAlias: 'orders_revenue',
            isHidden: false,
            aggregateFunction: 'SUM',
          },
        ],
      });

      const rel2 = makeRelationship({
        id: 'rel-2',
        targetAlias: 'orders_v2',
        targetDataMart: targetDm,
        blendedFields: [
          {
            targetFieldName: 'country',
            outputAlias: 'orders_v2_country',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [rel1, rel2];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.blendedFields).toHaveLength(2);
      expect(result.blendedFields[0].name).toBe('orders_revenue');
      expect(result.blendedFields[0].targetAlias).toBe('orders');
      expect(result.blendedFields[1].name).toBe('orders_v2_country');
      expect(result.blendedFields[1].targetAlias).toBe('orders_v2');
    });

    it('should use UNKNOWN type when schema field is not found in target schema', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'alias',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'DM 2',
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [{ name: 'existing_field', type: 'STRING' }],
          } as unknown as DataMart['schema'],
        }),
        blendedFields: [
          {
            targetFieldName: 'non_existent_field',
            outputAlias: 'output_alias',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.blendedFields).toHaveLength(1);
      expect(result.blendedFields[0].type).toBe('UNKNOWN');
    });
  });
});
