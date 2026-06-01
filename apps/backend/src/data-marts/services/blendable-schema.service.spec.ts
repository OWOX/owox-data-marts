import { Test, TestingModule } from '@nestjs/testing';
import {
  BlendableSchemaAccessor,
  BlendableSchemaService,
  resolveBlendableSchemaAccessor,
} from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { AccessDecisionService } from './access-decision';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { BlendedFieldsConfig } from '../dto/schemas/blended-fields-config.schema';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

const defaultAccessor: BlendableSchemaAccessor = { userId: 'user-1', roles: ['admin'] };

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
        {
          provide: AccessDecisionService,
          useValue: {
            canAccessMany: jest.fn(async (_uid, _roles, _type, ids: string[]) => {
              return new Map(ids.map(id => [id, true]));
            }),
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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

      expect(result.nativeFields).toEqual(nativeSchemaFields);
      expect(result.blendedFields).toEqual([]);
    });

    it('should return empty arrays when schema is undefined and no relationships exist', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ schema: undefined }));
      relationshipService.findByStorageId.mockResolvedValue([]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-root', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
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

        const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      await expect(
        service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor)
      ).rejects.toThrow(/relationship.+rel-broken.+deleted/i);
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

      const result = await service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-0', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-root', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

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

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

      // Both aliases should produce fields independently
      expect(result.blendedFields).toHaveLength(4);
      expect(result.blendedFields[0].name).toBe('orders__revenue');
      expect(result.blendedFields[1].name).toBe('orders__country');
      expect(result.blendedFields[2].name).toBe('orders_v2__revenue');
      expect(result.blendedFields[3].name).toBe('orders_v2__country');
    });

    describe('reporting access cascade', () => {
      // Tree: A → B, A → D, B → C. USE access denied on dm-b only.
      // Expected: b=false (direct deny), b.c=false (cascade), d=true (sibling unaffected).
      let result: Awaited<ReturnType<typeof service.computeBlendableSchema>>;

      beforeEach(async () => {
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
            schema: makeSchema([{ name: 'c_field', type: 'STRING' }]),
          }),
        });
        const relAtoD = makeRelationship({
          id: 'rel-ad',
          targetAlias: 'd',
          sourceDataMart: makeDataMart({ id: 'dm-a' }),
          targetDataMart: makeDataMart({
            id: 'dm-d',
            schema: makeSchema([{ name: 'd_field', type: 'STRING' }]),
          }),
        });
        relationshipService.findByStorageId.mockResolvedValue([relAtoB, relBtoC, relAtoD]);

        const accessDecisionService = (
          service as unknown as {
            accessDecisionService: jest.Mocked<{ canAccessMany: jest.Mock }>;
          }
        ).accessDecisionService;
        accessDecisionService.canAccessMany.mockImplementationOnce(
          async (_uid, _roles, _type, ids: string[]) => {
            const denied = new Set(['dm-b']);
            return new Map(ids.map(id => [id, !denied.has(id)]));
          }
        );

        result = await service.computeBlendableSchema('dm-a', 'project-1', defaultAccessor);
      });

      function flag(aliasPath: string): boolean | undefined {
        return result.availableSources.find(s => s.aliasPath === aliasPath)
          ?.isAccessibleForReporting;
      }

      it('denies the directly-inaccessible ancestor', () => {
        expect(flag('b')).toBe(false);
      });

      it('cascades denial onto the descendant subtree', () => {
        expect(flag('b.c')).toBe(false);
      });

      it('leaves a sibling branch with its own access untouched', () => {
        expect(flag('d')).toBe(true);
      });
    });
  });
});

describe('resolveBlendableSchemaAccessor', () => {
  function makeFacade(getProjectMemberOrThrowImpl: jest.Mock): IdpProjectionsFacade {
    return {
      getProjectMemberOrThrow: getProjectMemberOrThrowImpl,
    } as unknown as IdpProjectionsFacade;
  }

  it('returns the resolved role when the user is still a project member', async () => {
    const facade = makeFacade(jest.fn().mockResolvedValue({ userId: 'user-1', role: 'editor' }));

    const accessor = await resolveBlendableSchemaAccessor(facade, 'project-1', 'user-1');

    expect(accessor).toEqual({ userId: 'user-1', roles: ['editor'] });
  });

  it('throws BusinessViolationException when the user is no longer a project member', async () => {
    const facade = makeFacade(jest.fn().mockResolvedValue(undefined));

    await expect(
      resolveBlendableSchemaAccessor(facade, 'project-1', 'removed-user')
    ).rejects.toBeInstanceOf(BusinessViolationException);
  });

  it('includes userId and projectId in the exception details', async () => {
    const facade = makeFacade(jest.fn().mockResolvedValue(undefined));

    try {
      await resolveBlendableSchemaAccessor(facade, 'project-1', 'removed-user');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessViolationException);
      expect((err as BusinessViolationException).errorDetails).toMatchObject({
        userId: 'removed-user',
        projectId: 'project-1',
      });
    }
  });
});
