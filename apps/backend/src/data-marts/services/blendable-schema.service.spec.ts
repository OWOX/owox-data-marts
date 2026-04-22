import { Test, TestingModule } from '@nestjs/testing';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { BlendedFieldsConfig } from '../dto/schemas/blended-fields-config.schema';

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
    // Non-empty joinConditions by default so fixtures exercise the "configured"
    // relationship path. Tests that want an unconfigured relationship should
    // override this explicitly to `[]`.
    joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'id' }],
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

function makeSchema(fields: Array<{ name: string; type: string; isHiddenForReporting?: boolean }>) {
  return {
    type: 'bigquery-data-mart-schema',
    fields,
  } as unknown as DataMart['schema'];
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
          schema: makeSchema(nativeSchemaFields),
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

    it('should skip relationships with no join conditions and their downstream children', async () => {
      // Scenario: A→B (no joinConditions, "not configured") → C (fully configured).
      // The unconfigured edge produces no valid SQL, so B, its fields, and any
      // descendants reached only via B must be excluded from the blendable schema.
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const unconfigured = makeRelationship({
        id: 'rel-unconfigured',
        targetAlias: 'b',
        joinConditions: [],
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'field_b', type: 'STRING' }]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (sourceId: string) => {
        if (sourceId === 'dm-a') return [unconfigured];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      expect(result.availableSources).toEqual([]);
      expect(result.blendedFields).toEqual([]);
    });

    it('should dynamically compute blended fields from target schema (AUTO_BLEND_ALL default)', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: undefined })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'customers',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Customers DM',
          schema: makeSchema([
            { name: 'customer_name', type: 'STRING' },
            { name: 'customer_age', type: 'INTEGER' },
          ]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.blendedFields).toHaveLength(2);

      const nameField = result.blendedFields[0];
      expect(nameField.name).toBe('customers__customer_name');
      expect(nameField.aliasPath).toBe('customers');
      expect(nameField.outputPrefix).toBe('Customers DM');
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
      expect(ageField.name).toBe('customers__customer_age');
      expect(ageField.type).toBe('INTEGER');
      // Numeric default: SUM, not STRING_AGG
      expect(ageField.aggregateFunction).toBe('SUM');
    });

    it.each([
      'INTEGER',
      'INT',
      'INT64',
      'SMALLINT',
      'BIGINT',
      'TINYINT',
      'FLOAT',
      'FLOAT64',
      'DOUBLE',
      'DOUBLE PRECISION',
      'REAL',
      'NUMERIC',
      'BIGNUMERIC',
      'DECIMAL',
      'NUMBER',
    ])('should default aggregateFunction to SUM for numeric type %s', async numericType => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: undefined })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 't',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Target',
          schema: makeSchema([{ name: 'val', type: numericType }]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');
      const field = result.blendedFields.find(f => f.originalFieldName === 'val')!;
      expect(field.aggregateFunction).toBe('SUM');
    });

    it.each(['STRING', 'DATE', 'TIMESTAMP', 'BOOLEAN', 'JSON', 'VARCHAR'])(
      'should default aggregateFunction to STRING_AGG for non-numeric type %s',
      async nonNumericType => {
        dataMartService.getByIdAndProjectId.mockResolvedValue(
          makeDataMart({ id: 'dm-1', blendedFieldsConfig: undefined })
        );

        const relationship = makeRelationship({
          id: 'rel-1',
          targetAlias: 't',
          targetDataMart: makeDataMart({
            id: 'dm-2',
            title: 'Target',
            schema: makeSchema([{ name: 'val', type: nonNumericType }]),
          }),
        });

        relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
          if (id === 'dm-1') return [relationship];
          return [];
        });

        const result = await service.computeBlendableSchema('dm-1', 'project-1');
        const field = result.blendedFields.find(f => f.originalFieldName === 'val')!;
        expect(field.aggregateFunction).toBe('STRING_AGG');
      }
    );

    it('should apply overrides from blendedFieldsConfig sources', async () => {
      const config: BlendedFieldsConfig = {
        sources: [
          {
            path: 'orders',
            alias: 'ord',
            fields: {
              revenue: { aggregateFunction: 'SUM' },
              internal_id: { isHidden: true },
            },
          },
        ],
      };

      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: config })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'orders',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Orders',
          schema: makeSchema([
            { name: 'revenue', type: 'FLOAT' },
            { name: 'internal_id', type: 'STRING' },
            { name: 'status', type: 'STRING' },
          ]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.blendedFields).toHaveLength(3);

      const revenueField = result.blendedFields.find(f => f.originalFieldName === 'revenue')!;
      expect(revenueField.name).toBe('orders__revenue');
      expect(revenueField.outputPrefix).toBe('ord');
      expect(revenueField.aggregateFunction).toBe('SUM');
      expect(revenueField.isHidden).toBe(false);

      const hiddenField = result.blendedFields.find(f => f.originalFieldName === 'internal_id')!;
      expect(hiddenField.isHidden).toBe(true);

      const statusField = result.blendedFields.find(f => f.originalFieldName === 'status')!;
      expect(statusField.aggregateFunction).toBe('STRING_AGG');
      expect(statusField.isHidden).toBe(false);
    });

    it('should apply alias overrides from blendedFieldsConfig sources', async () => {
      const config: BlendedFieldsConfig = {
        sources: [
          {
            path: 'orders',
            alias: 'ord',
            fields: {
              revenue: { alias: 'Total Revenue' },
              status: { alias: 'Order Status', aggregateFunction: 'MAX' },
            },
          },
        ],
      };

      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: config })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'orders',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Orders',
          schema: makeSchema([
            { name: 'revenue', type: 'FLOAT' },
            { name: 'status', type: 'STRING' },
            { name: 'no_override', type: 'STRING' },
          ]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      const revenueField = result.blendedFields.find(f => f.originalFieldName === 'revenue')!;
      expect(revenueField.alias).toBe('Total Revenue');

      const statusField = result.blendedFields.find(f => f.originalFieldName === 'status')!;
      expect(statusField.alias).toBe('Order Status');
      expect(statusField.aggregateFunction).toBe('MAX');

      const noOverrideField = result.blendedFields.find(
        f => f.originalFieldName === 'no_override'
      )!;
      expect(noOverrideField.alias).toBe('');
    });

    it('throws a clear error when a relationship targets a soft-deleted data mart', async () => {
      // Scenario: A→B exists, but B has been soft-deleted. TypeORM eager join leaves
      // rel.targetDataMart undefined. We should fail loud with a message that names
      // the broken relationship so the user can act on it.
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const orphanRel = {
        id: 'rel-broken',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: undefined,
        joinConditions: [{ sourceFieldName: 'a_id', targetFieldName: 'b_id' }],
      } as unknown as DataMartRelationship;
      relationshipService.findBySourceDataMartId.mockResolvedValue([orphanRel]);

      await expect(service.computeBlendableSchema('dm-a', 'project-1')).rejects.toThrow(
        /relationship.+rel-broken.+deleted/i
      );
    });

    it('should resolve transitive relationships (A→B→C) with depth=2', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b_alias',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          title: 'DM B',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      const relBtoC = makeRelationship({
        id: 'rel-bc',
        targetAlias: 'c_alias',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          title: 'DM C',
          schema: makeSchema([{ name: 'order_id', type: 'INTEGER' }]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-a') return [relAtoB];
        if (id === 'dm-b') return [relBtoC];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      expect(result.blendedFields).toHaveLength(2);

      const bField = result.blendedFields[0];
      expect(bField.name).toBe('b_alias__b_field');
      expect(bField.aliasPath).toBe('b_alias');
      expect(bField.transitiveDepth).toBe(1);

      const cField = result.blendedFields[1];
      expect(cField.name).toBe('b_alias_c_alias__order_id');
      expect(cField.aliasPath).toBe('b_alias.c_alias');
      expect(cField.outputPrefix).toBe('DM C');
      expect(cField.transitiveDepth).toBe(2);
    });

    it('should prevent infinite loops via cycle protection (visited set on alias path)', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b_alias',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({ id: 'dm-b', title: 'DM B' }),
      });

      const relBtoA = makeRelationship({
        id: 'rel-ba',
        targetAlias: 'a_alias',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({ id: 'dm-a', title: 'DM A' }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-a') return [relAtoB];
        if (id === 'dm-b') return [relBtoA];
        return [];
      });

      // Should terminate without error — bounded by MAX_TRANSITIVE_DEPTH (10)
      const result = await service.computeBlendableSchema('dm-a', 'project-1');
      expect(result.blendedFields).toEqual([]);
    });

    it('should support diamond pattern — same DM via two different paths', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-root' }));

      const sharedDm = makeDataMart({
        id: 'dm-shared',
        title: 'Shared DM',
        schema: makeSchema([{ name: 'shared_field', type: 'STRING' }]),
      });

      const dmLeft = makeDataMart({ id: 'dm-left', title: 'Left DM' });
      const dmRight = makeDataMart({ id: 'dm-right', title: 'Right DM' });

      const relRootToLeft = makeRelationship({
        id: 'rel-root-left',
        targetAlias: 'left',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: dmLeft,
      });

      const relRootToRight = makeRelationship({
        id: 'rel-root-right',
        targetAlias: 'right',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: dmRight,
      });

      const relLeftToShared = makeRelationship({
        id: 'rel-left-shared',
        targetAlias: 'shared',
        sourceDataMart: dmLeft,
        targetDataMart: sharedDm,
      });

      const relRightToShared = makeRelationship({
        id: 'rel-right-shared',
        targetAlias: 'shared',
        sourceDataMart: dmRight,
        targetDataMart: sharedDm,
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-root') return [relRootToLeft, relRootToRight];
        if (id === 'dm-left') return [relLeftToShared];
        if (id === 'dm-right') return [relRightToShared];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-root', 'project-1');

      // Should have fields from both paths: left.shared and right.shared
      const leftSharedFields = result.blendedFields.filter(f => f.aliasPath === 'left.shared');
      const rightSharedFields = result.blendedFields.filter(f => f.aliasPath === 'right.shared');

      expect(leftSharedFields).toHaveLength(1);
      expect(rightSharedFields).toHaveLength(1);
      expect(leftSharedFields[0].name).toBe('left_shared__shared_field');
      expect(rightSharedFields[0].name).toBe('right_shared__shared_field');
    });

    it('should silently ignore orphaned sources that do not match any relationship path', async () => {
      const config: BlendedFieldsConfig = {
        sources: [
          { path: 'nonexistent_path', alias: 'ghost' },
          { path: 'orders', alias: 'ord' },
        ],
      };

      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: config })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'orders',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Orders',
          schema: makeSchema([{ name: 'revenue', type: 'FLOAT' }]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      // Should not throw — orphaned 'nonexistent_path' is silently ignored
      expect(result.blendedFields).toHaveLength(1);
      expect(result.blendedFields[0].name).toBe('orders__revenue');
    });

    it('should filter out isHiddenForReporting fields from target schema', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'target',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Target',
          schema: makeSchema([
            { name: 'visible', type: 'STRING' },
            { name: 'hidden', type: 'STRING', isHiddenForReporting: true },
          ]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.blendedFields).toHaveLength(1);
      expect(result.blendedFields[0].originalFieldName).toBe('visible');
    });

    it('should expose nativeDescription and availableSources[i].description for the reporting UI', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({
          id: 'dm-1',
          description: 'Root data mart description',
        })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'orders',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Orders',
          description: 'Linked orders data mart',
          schema: makeSchema([{ name: 'revenue', type: 'FLOAT' }]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.nativeDescription).toBe('Root data mart description');
      expect(result.availableSources).toHaveLength(1);
      expect(result.availableSources[0].description).toBe('Linked orders data mart');
    });

    it('should return undefined descriptions when data marts have no description set', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'orders',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Orders',
          schema: makeSchema([{ name: 'revenue', type: 'FLOAT' }]),
        }),
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [relationship];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.nativeDescription).toBeUndefined();
      expect(result.availableSources[0].description).toBeUndefined();
    });

    it('should return blended fields from multiple relationships to the same target DM with different aliases', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));

      const targetSchema = makeSchema([
        { name: 'revenue', type: 'FLOAT' },
        { name: 'country', type: 'STRING' },
      ]);
      const targetDm = makeDataMart({
        id: 'dm-2',
        title: 'Orders DM',
        schema: targetSchema,
      });

      const rel1 = makeRelationship({
        id: 'rel-1',
        targetAlias: 'orders',
        targetDataMart: targetDm,
      });

      const rel2 = makeRelationship({
        id: 'rel-2',
        targetAlias: 'orders_v2',
        targetDataMart: targetDm,
      });

      relationshipService.findBySourceDataMartId.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return [rel1, rel2];
        return [];
      });

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      // Both aliases should produce fields independently
      expect(result.blendedFields).toHaveLength(4);
      expect(result.blendedFields[0].name).toBe('orders__revenue');
      expect(result.blendedFields[1].name).toBe('orders__country');
      expect(result.blendedFields[2].name).toBe('orders_v2__revenue');
      expect(result.blendedFields[3].name).toBe('orders_v2__country');
    });
  });
});
