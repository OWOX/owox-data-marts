import { Test, TestingModule } from '@nestjs/testing';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { BlendedFieldsConfig } from '../dto/schemas/blended-fields-config.schema';
import { DataMartStatus } from '../enums/data-mart-status.enum';

function makeDataMart(overrides: Partial<DataMart> = {}): DataMart {
  return {
    id: 'dm-1',
    title: 'Data Mart 1',
    schema: undefined,
    projectId: 'project-1',
    createdById: 'user-1',
    status: DataMartStatus.PUBLISHED,
    createdAt: new Date(),
    modifiedAt: new Date(),
    storage: { id: 'storage-1' } as unknown as DataMart['storage'],
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
            findByStorageId: jest.fn().mockResolvedValue([]),
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
      relationshipService.findByStorageId.mockResolvedValue([]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      expect(result.nativeFields).toEqual(nativeSchemaFields);
      expect(result.blendedFields).toEqual([]);
    });

    it('should return empty arrays when schema is undefined and no relationships exist', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ schema: undefined }));
      relationshipService.findByStorageId.mockResolvedValue([]);

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

      relationshipService.findByStorageId.mockResolvedValue([unconfigured]);

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      expect(result.availableSources).toEqual([]);
      expect(result.blendedFields).toEqual([]);
    });

    it('should skip relationships targeting a DRAFT data mart and their downstream children', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          status: DataMartStatus.DRAFT,
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });
      const relBtoC = makeRelationship({
        id: 'rel-bc',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          schema: makeSchema([{ name: 'c_field', type: 'INTEGER' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relBtoC]);

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      expect(result.availableSources).toEqual([]);
      expect(result.blendedFields).toEqual([]);
    });

    it('still exposes a draft root data mart, only filters draft relationship targets', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({
          id: 'dm-root',
          status: DataMartStatus.DRAFT,
          schema: makeSchema([{ name: 'native_field', type: 'STRING' }]),
        })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'target',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({
          id: 'dm-target',
          schema: makeSchema([{ name: 'target_field', type: 'STRING' }]),
        }),
      });
      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-root', 'project-1');

      expect(result.nativeFields).toHaveLength(1);
      expect(result.blendedFields).toHaveLength(1);
      expect(result.blendedFields[0].originalFieldName).toBe('target_field');
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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1');
      const field = result.blendedFields.find(f => f.originalFieldName === 'val')!;
      expect(field.aggregateFunction).toBe('SUM');
    });

    it.each([
      'DATE',
      'TIME',
      'DATETIME',
      'TIMESTAMP',
      'TIMESTAMP_LTZ',
      'TIMESTAMP_NTZ',
      'TIMESTAMP_TZ',
      'TIMESTAMPTZ',
    ])('should default aggregateFunction to MAX for date/time type %s', async dateTimeType => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: undefined })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 't',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Target',
          schema: makeSchema([{ name: 'val', type: dateTimeType }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1');
      const field = result.blendedFields.find(f => f.originalFieldName === 'val')!;
      expect(field.aggregateFunction).toBe('MAX');
    });

    it.each(['STRING', 'BOOLEAN', 'JSON', 'VARCHAR'])(
      'should default aggregateFunction to STRING_AGG for non-numeric, non-date/time type %s',
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

        relationshipService.findByStorageId.mockResolvedValue([relationship]);

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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

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
      relationshipService.findByStorageId.mockResolvedValue([orphanRel]);

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

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relBtoC]);

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

    it('stops branch traversal when a target DM is already on the current path', async () => {
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

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relBtoA]);

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      const aliasPathsFound = result.availableSources.map(s => s.aliasPath);
      expect(aliasPathsFound).toContain('b_alias');
      expect(aliasPathsFound.some(p => p.startsWith('b_alias.a_alias'))).toBe(false);
      expect(result.blendedFields).toEqual([]);
    });

    it('direct 2-node cycle: only target B fields appear, no back-path fields', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({
          id: 'dm-a',
          schema: makeSchema([{ name: 'native_a', type: 'STRING' }]),
        })
      );

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          title: 'DM B',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      const relBtoA = makeRelationship({
        id: 'rel-ba',
        targetAlias: 'a_back',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({
          id: 'dm-a',
          schema: makeSchema([{ name: 'native_a', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relBtoA]);

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      expect(result.availableSources).toHaveLength(1);
      expect(result.availableSources[0].aliasPath).toBe('b');
      expect(result.availableSources.some(s => s.aliasPath.startsWith('b.a_back'))).toBe(false);
      expect(result.blendedFields).toHaveLength(1);
      expect(result.blendedFields[0].name).toBe('b__b_field');
    });

    it('transitive 3-node cycle: B and B.C appear, back-edge B.C.a_back does not', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({ id: 'dm-b', schema: makeSchema([]) }),
      });

      const relBtoC = makeRelationship({
        id: 'rel-bc',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          schema: makeSchema([{ name: 'c_field', type: 'INTEGER' }]),
        }),
      });

      const relCtoA = makeRelationship({
        id: 'rel-ca',
        targetAlias: 'a_back',
        sourceDataMart: makeDataMart({ id: 'dm-c' }),
        targetDataMart: makeDataMart({ id: 'dm-a' }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relBtoC, relCtoA]);

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      const aliasPathsFound = result.availableSources.map(s => s.aliasPath);
      expect(aliasPathsFound).toContain('b');
      expect(aliasPathsFound).toContain('b.c');
      expect(aliasPathsFound.some(p => p.startsWith('b.c.a_back'))).toBe(false);
      expect(result.blendedFields).toHaveLength(1);
      expect(result.blendedFields[0].name).toBe('b_c__c_field');
    });

    it('deep chain of 15 nodes without cycles traverses all levels', async () => {
      const chainLength = 15;
      const dms = Array.from({ length: chainLength }, (_, i) =>
        makeDataMart({
          id: `dm-${i}`,
          title: `DM ${i}`,
          schema: makeSchema([{ name: `f_${i}`, type: 'STRING' }]),
        })
      );

      dataMartService.getByIdAndProjectId.mockResolvedValue(dms[0]);

      const rels = Array.from({ length: chainLength - 1 }, (_, i) =>
        makeRelationship({
          id: `rel-${i}`,
          targetAlias: `alias_${i + 1}`,
          sourceDataMart: dms[i],
          targetDataMart: dms[i + 1],
        })
      );

      relationshipService.findByStorageId.mockResolvedValue(rels);

      const result = await service.computeBlendableSchema('dm-0', 'project-1');

      expect(result.availableSources).toHaveLength(chainLength - 1);
      const lastSource = result.availableSources[chainLength - 2];
      expect(lastSource.depth).toBe(chainLength - 1);
      expect(result.blendedFields).toHaveLength(chainLength - 1);
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

      relationshipService.findByStorageId.mockResolvedValue([
        relRootToLeft,
        relRootToRight,
        relLeftToShared,
        relRightToShared,
      ]);

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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

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

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

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

      relationshipService.findByStorageId.mockResolvedValue([rel1, rel2]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1');

      // Both aliases should produce fields independently
      expect(result.blendedFields).toHaveLength(4);
      expect(result.blendedFields[0].name).toBe('orders__revenue');
      expect(result.blendedFields[1].name).toBe('orders__country');
      expect(result.blendedFields[2].name).toBe('orders_v2__revenue');
      expect(result.blendedFields[3].name).toBe('orders_v2__country');
    });
  });

  describe('computeBlendableSchema — access filter', () => {
    it('filters out target DM and its fields when accessFilter returns false', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB]);

      const accessFilter = jest.fn().mockResolvedValue(false);
      const result = await service.computeBlendableSchema('dm-a', 'project-1', accessFilter);

      expect(result.availableSources).toEqual([]);
      expect(result.blendedFields).toEqual([]);
      expect(accessFilter).toHaveBeenCalledWith('dm-b');
    });

    it('cuts entire branch when intermediate DM is inaccessible (A→B→C, B blocked)', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      const relBtoC = makeRelationship({
        id: 'rel-bc',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          schema: makeSchema([{ name: 'c_field', type: 'INTEGER' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relBtoC]);

      const accessFilter = jest.fn().mockImplementation(async (dmId: string) => dmId !== 'dm-b');
      const result = await service.computeBlendableSchema('dm-a', 'project-1', accessFilter);

      expect(result.availableSources).toEqual([]);
      expect(result.blendedFields).toEqual([]);
    });

    it('does not call accessFilter when not provided (backward-compatible)', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB]);

      const result = await service.computeBlendableSchema('dm-a', 'project-1');

      expect(result.availableSources).toHaveLength(1);
      expect(result.blendedFields).toHaveLength(1);
    });

    it('accessible parallel branch still visible when sibling branch is blocked', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      const relAtoC = makeRelationship({
        id: 'rel-ac',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          schema: makeSchema([{ name: 'c_field', type: 'INTEGER' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relAtoC]);

      const accessFilter = jest.fn().mockImplementation(async (dmId: string) => dmId === 'dm-c');
      const result = await service.computeBlendableSchema('dm-a', 'project-1', accessFilter);

      expect(result.availableSources).toHaveLength(1);
      expect(result.availableSources[0].aliasPath).toBe('c');
      expect(result.blendedFields).toHaveLength(1);
      expect(result.blendedFields[0].name).toBe('c__c_field');
    });
  });

  describe('findInaccessibleColumnRefs', () => {
    it('returns empty array when columnConfig is empty', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));
      relationshipService.findByStorageId.mockResolvedValue([]);

      const accessFilter = jest.fn().mockResolvedValue(true);
      const result = await service.findInaccessibleColumnRefs(
        [],
        'dm-a',
        'project-1',
        accessFilter
      );

      expect(result).toEqual([]);
      expect(accessFilter).not.toHaveBeenCalled();
    });

    it('returns empty array when all column refs are native fields', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({
          id: 'dm-a',
          schema: makeSchema([{ name: 'native_col', type: 'STRING' }]),
        })
      );
      relationshipService.findByStorageId.mockResolvedValue([]);

      const accessFilter = jest.fn().mockResolvedValue(true);
      const result = await service.findInaccessibleColumnRefs(
        ['native_col'],
        'dm-a',
        'project-1',
        accessFilter
      );

      expect(result).toEqual([]);
    });

    it('returns orphan when column references physically missing blended field', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));
      relationshipService.findByStorageId.mockResolvedValue([]);

      const accessFilter = jest.fn().mockResolvedValue(true);
      const result = await service.findInaccessibleColumnRefs(
        ['b__deleted_field'],
        'dm-a',
        'project-1',
        accessFilter
      );

      expect(result).toEqual(['b__deleted_field']);
    });

    it('returns orphan when source DM has no USE access', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB]);

      const accessFilter = jest.fn().mockResolvedValue(false);
      const result = await service.findInaccessibleColumnRefs(
        ['b__b_field'],
        'dm-a',
        'project-1',
        accessFilter
      );

      expect(result).toEqual(['b__b_field']);
    });

    it('returns empty when all blended columns have accessible source DMs', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-a' }));

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'b_field', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB]);

      const accessFilter = jest.fn().mockResolvedValue(true);
      const result = await service.findInaccessibleColumnRefs(
        ['b__b_field'],
        'dm-a',
        'project-1',
        accessFilter
      );

      expect(result).toEqual([]);
    });

    it('returns sorted orphan list with mixed native, accessible blended, and inaccessible', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({
          id: 'dm-a',
          schema: makeSchema([{ name: 'native_col', type: 'STRING' }]),
        })
      );

      const relAtoB = makeRelationship({
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'ok_field', type: 'STRING' }]),
        }),
      });

      const relAtoC = makeRelationship({
        id: 'rel-ac',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          schema: makeSchema([{ name: 'blocked_field', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relAtoB, relAtoC]);

      const accessFilter = jest.fn().mockImplementation(async (dmId: string) => dmId === 'dm-b');
      const result = await service.findInaccessibleColumnRefs(
        ['native_col', 'b__ok_field', 'c__blocked_field', 'missing__orphan'],
        'dm-a',
        'project-1',
        accessFilter
      );

      expect(result).toEqual(['c__blocked_field', 'missing__orphan']);
    });

    it('diamond graph: C reachable via accessible A is NOT orphan even if B (other path to C) is blocked', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-root' }));

      const dmC = makeDataMart({
        id: 'dm-c',
        schema: makeSchema([{ name: 'c_field', type: 'STRING' }]),
      });

      const relRootToA = makeRelationship({
        id: 'rel-root-a',
        targetAlias: 'a',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({ id: 'dm-a', schema: makeSchema([]) }),
      });

      const relRootToB = makeRelationship({
        id: 'rel-root-b',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({ id: 'dm-b', schema: makeSchema([]) }),
      });

      const relAtoC = makeRelationship({
        id: 'rel-a-c',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-a' }),
        targetDataMart: dmC,
      });

      const relBtoC = makeRelationship({
        id: 'rel-b-c',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: dmC,
      });

      relationshipService.findByStorageId.mockResolvedValue([
        relRootToA,
        relRootToB,
        relAtoC,
        relBtoC,
      ]);

      const accessFilter = jest.fn().mockImplementation(async (dmId: string) => dmId !== 'dm-b');
      const result = await service.findInaccessibleColumnRefs(
        ['a_c__c_field'],
        'dm-root',
        'project-1',
        accessFilter
      );

      expect(result).toEqual([]);
    });

    it('transitive path: b_c__field is orphan when intermediate B is inaccessible even if C is accessible', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-root' }));

      const relRootToB = makeRelationship({
        id: 'rel-root-b',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({ id: 'dm-b', schema: makeSchema([]) }),
      });

      const relBtoC = makeRelationship({
        id: 'rel-b-c',
        targetAlias: 'c',
        sourceDataMart: makeDataMart({ id: 'dm-b' }),
        targetDataMart: makeDataMart({
          id: 'dm-c',
          schema: makeSchema([{ name: 'c_field', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relRootToB, relBtoC]);

      const accessFilter = jest.fn().mockImplementation(async (dmId: string) => dmId === 'dm-c');
      const result = await service.findInaccessibleColumnRefs(
        ['b_c__c_field'],
        'dm-root',
        'project-1',
        accessFilter
      );

      expect(result).toEqual(['b_c__c_field']);
    });

    it('native nested struct field profile.city is not flagged as orphan', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({
          id: 'dm-a',
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              {
                name: 'profile',
                type: 'RECORD',
                fields: [{ name: 'city', type: 'STRING' }],
              },
            ],
          } as unknown as DataMart['schema'],
        })
      );
      relationshipService.findByStorageId.mockResolvedValue([]);

      const accessFilter = jest.fn().mockResolvedValue(true);
      const result = await service.findInaccessibleColumnRefs(
        ['profile.city'],
        'dm-a',
        'project-1',
        accessFilter
      );

      expect(result).toEqual([]);
    });
  });

  describe('findInaccessibleReportRefs', () => {
    it('groups orphans by config source (columns / filters / sorts)', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-root' }));

      const relRootToX = makeRelationship({
        id: 'rel-x',
        targetAlias: 'x',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({
          id: 'dm-x',
          schema: makeSchema([{ name: 'a', type: 'STRING' }]),
        }),
      });
      const relRootToY = makeRelationship({
        id: 'rel-y',
        targetAlias: 'y',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({
          id: 'dm-y',
          schema: makeSchema([{ name: 'b', type: 'STRING' }]),
        }),
      });
      const relRootToZ = makeRelationship({
        id: 'rel-z',
        targetAlias: 'z',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({
          id: 'dm-z',
          schema: makeSchema([{ name: 'c', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relRootToX, relRootToY, relRootToZ]);

      const accessFilter = jest.fn().mockImplementation(async (dmId: string) => dmId === 'dm-x');
      const result = await service.findInaccessibleReportRefs(
        {
          columnConfig: ['x__a'],
          filterConfig: [{ column: 'y__b', operator: 'EQUALS', values: ['1'] }],
          sortConfig: [{ column: 'z__c', direction: 'ASC' }],
        },
        'dm-root',
        'project-1',
        accessFilter
      );

      expect(result.columns).toEqual([]);
      expect(result.filters).toEqual(['y__b']);
      expect(result.sorts).toEqual(['z__c']);
    });

    it('returns all empty when all columns are accessible', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-root' }));

      const relRootToB = makeRelationship({
        id: 'rel-b',
        targetAlias: 'b',
        sourceDataMart: makeDataMart({ id: 'dm-root' }),
        targetDataMart: makeDataMart({
          id: 'dm-b',
          schema: makeSchema([{ name: 'field', type: 'STRING' }]),
        }),
      });
      relationshipService.findByStorageId.mockResolvedValue([relRootToB]);

      const accessFilter = jest.fn().mockResolvedValue(true);
      const result = await service.findInaccessibleReportRefs(
        {
          columnConfig: ['b__field'],
          filterConfig: [{ column: 'b__field', operator: 'EQUALS', values: ['v'] }],
          sortConfig: [{ column: 'b__field', direction: 'DESC' }],
        },
        'dm-root',
        'project-1',
        accessFilter
      );

      expect(result).toEqual({ columns: [], filters: [], sorts: [] });
    });

    it('returns empty object when all configs are empty', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-root' }));
      relationshipService.findByStorageId.mockResolvedValue([]);

      const accessFilter = jest.fn().mockResolvedValue(false);
      const result = await service.findInaccessibleReportRefs(
        { columnConfig: [], filterConfig: [], sortConfig: [] },
        'dm-root',
        'project-1',
        accessFilter
      );

      expect(result).toEqual({ columns: [], filters: [], sorts: [] });
      expect(accessFilter).not.toHaveBeenCalled();
    });
  });
});
