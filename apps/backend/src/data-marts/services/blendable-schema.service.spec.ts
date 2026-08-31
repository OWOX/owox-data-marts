import { Test, TestingModule } from '@nestjs/testing';
import {
  BlendableSchemaAccessor,
  BlendableSchemaService,
  flattenSchemaFields,
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
import { buildBlendedFieldUnifiedName } from './blended-field-name';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { AvailableSourceDto } from '../dto/domain/blendable-schema.dto';

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
    storage: {
      id: 'storage-1',
      type: DataStorageType.GOOGLE_BIGQUERY,
    } as unknown as DataMart['storage'],
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
  let accessDecisionService: jest.Mocked<AccessDecisionService>;

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
    accessDecisionService = module.get(AccessDecisionService);
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

    it('should hash nested struct field names so they do not collide with flat fields', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: undefined })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'customers',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Customers DM',
          schema: {
            type: 'bigquery-data-mart-schema',
            fields: [
              { name: 'campaign_id', type: 'STRING' },
              {
                name: 'campaign',
                type: 'RECORD',
                fields: [{ name: 'id', type: 'STRING' }],
              },
            ],
          } as unknown as DataMart['schema'],
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

      const flat = result.blendedFields.find(f => f.originalFieldName === 'campaign_id');
      const nested = result.blendedFields.find(f => f.originalFieldName === 'campaign.id');

      expect(flat).toBeDefined();
      expect(nested).toBeDefined();
      expect(flat!.name).toBe('customers__campaign_id');
      expect(nested!.name).toBe(buildBlendedFieldUnifiedName('customers', 'campaign.id'));
      expect(nested!.name).toBe('customers__campaign_id__b996a659');
      expect(nested!.name).not.toBe(flat!.name);
      expect(nested!.originalFieldName).toBe('campaign.id');
      expect(nested!.aliasPath).toBe('customers');
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

    it('resolves postJoinAggregations across all three override states', async () => {
      const config: BlendedFieldsConfig = {
        sources: [
          {
            path: 'orders',
            alias: 'ord',
            fields: {
              // explicit subset override
              revenue: { aggregateFunction: 'SUM', postJoinAggregations: ['MIN', 'MAX'] },
              // explicit empty array = analyst cleared all (none allowed), distinct from unset
              notes: { postJoinAggregations: [] },
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
            { name: 'notes', type: 'STRING' },
          ]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

      // explicit subset → kept verbatim
      const revenueField = result.blendedFields.find(f => f.originalFieldName === 'revenue')!;
      expect(revenueField.postJoinAggregations).toEqual(['MIN', 'MAX']);

      // no override → type-derived governance default (STRING)
      const statusField = result.blendedFields.find(f => f.originalFieldName === 'status')!;
      expect(statusField.postJoinAggregations).toEqual([
        'COUNT',
        'COUNT_DISTINCT',
        'STRING_AGG',
        'ANY_VALUE',
      ]);

      // explicit empty array → none allowed (NOT the default)
      const notesField = result.blendedFields.find(f => f.originalFieldName === 'notes')!;
      expect(notesField.postJoinAggregations).toEqual([]);
    });

    it('types a COUNT_DISTINCT-dedup blended field as integer and offers arithmetic aggregations by default (#6733)', async () => {
      // Kolya's funnel: a STRING hitId deduplicated with COUNT_DISTINCT yields a per-join-key
      // INTEGER count. Its post-join available aggregations must therefore follow the INTEGER
      // (dedup-output) type, not the raw STRING — so SUM/AVG/MIN/MAX are offered (SUM the default)
      // and the report can correctly sum the per-session counts.
      const config: BlendedFieldsConfig = {
        sources: [
          {
            path: 'events',
            alias: 'ev',
            fields: { hitId: { aggregateFunction: 'COUNT_DISTINCT' } },
          },
        ],
      };

      dataMartService.getByIdAndProjectId.mockResolvedValue(
        makeDataMart({ id: 'dm-1', blendedFieldsConfig: config })
      );

      const relationship = makeRelationship({
        id: 'rel-1',
        targetAlias: 'events',
        targetDataMart: makeDataMart({
          id: 'dm-2',
          title: 'Events',
          schema: makeSchema([{ name: 'hitId', type: 'STRING' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
      const hitField = result.blendedFields.find(f => f.originalFieldName === 'hitId')!;

      // effective (dedup-output) type is the storage integer type, not the raw STRING
      expect(hitField.type).toBe('INTEGER');
      // the RAW source type is carried alongside so the web can recompute effective types
      // for type-preserving dedups (#6733 C1)
      expect(hitField.sourceFieldType).toBe('STRING');
      // integer governance defaults → arithmetic funcs available, SUM first (default-active)
      expect(hitField.postJoinAggregations).toEqual(['SUM', 'AVG', 'MIN', 'MAX']);
    });

    it('types a NUMERIC field deduped with AVG as the storage float type, carrying the raw numeric sourceFieldType (#6733)', async () => {
      // AVG widens its effective type to the storage's float type even when the raw column is
      // already numeric (e.g. FLOAT deduped AVG must still resolve through getFloatType, not
      // pass the raw type through unchanged like SUM/MIN/MAX/ANY_VALUE do).
      const config: BlendedFieldsConfig = {
        sources: [
          {
            path: 'orders',
            alias: 'ord',
            fields: { amount: { aggregateFunction: 'AVG' } },
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
          schema: makeSchema([{ name: 'amount', type: 'FLOAT' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
      const amountField = result.blendedFields.find(f => f.originalFieldName === 'amount')!;

      // effective (dedup-output) type is the storage FLOAT type
      expect(amountField.type).toBe('FLOAT');
      // the RAW source type is carried alongside, unchanged
      expect(amountField.sourceFieldType).toBe('FLOAT');
    });

    it('types a NUMERIC field deduped with STRING_AGG as the storage string type, carrying the raw numeric sourceFieldType (#6733)', async () => {
      // STRING_AGG on a NUMERIC field (an analyst override) recategorizes the effective type to
      // the storage's string type — a case getStringType must resolve, and one where the RAW
      // sourceFieldType (NUMERIC) diverges sharply from the effective type (STRING).
      const config: BlendedFieldsConfig = {
        sources: [
          {
            path: 'orders',
            alias: 'ord',
            fields: { code: { aggregateFunction: 'STRING_AGG' } },
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
          schema: makeSchema([{ name: 'code', type: 'NUMERIC' }]),
        }),
      });

      relationshipService.findByStorageId.mockResolvedValue([relationship]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
      const codeField = result.blendedFields.find(f => f.originalFieldName === 'code')!;

      // effective (dedup-output) type is the storage STRING type
      expect(codeField.type).toBe('STRING');
      // the RAW source type is carried alongside, unchanged
      expect(codeField.sourceFieldType).toBe('NUMERIC');
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

    // A calculated field of the JOINED Data Mart is a formula, with no warehouse column behind
    // it. It stays in the payload — a client that only saw it vanish could not explain why — and
    // the flag is what lets the formula validator and the report column picker refuse it by name
    // instead of calling it unknown.
    it('marks a joined Data Mart’s own calculated field with isCalculated', async () => {
      dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));
      relationshipService.findByStorageId.mockResolvedValue([
        makeRelationship({
          id: 'rel-1',
          targetAlias: 'orders',
          targetDataMart: makeDataMart({
            id: 'dm-2',
            title: 'Orders',
            schema: makeSchema([
              { name: 'amount', type: 'FLOAT' },
              {
                name: 'margin',
                type: 'FLOAT',
                calculated: { formula: '{{ref field="amount"}}', level: 'metric' },
              },
            ] as never),
          }),
        }),
      ]);

      const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);

      expect(result.blendedFields.map(f => [f.originalFieldName, f.isCalculated])).toEqual([
        ['amount', false],
        ['margin', true],
      ]);
    });

    describe('uniqueCountAvailability', () => {
      // Wires a single joined source with the given RAW target schema fields and returns the
      // corresponding availableSources[0], the way the picker reads it.
      async function computeJoinedAvailableSource(
        fields: Array<Record<string, unknown>>
      ): Promise<AvailableSourceDto> {
        dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));
        const relationship = makeRelationship({
          id: 'rel-1',
          targetAlias: 'target',
          targetDataMart: makeDataMart({
            id: 'dm-2',
            title: 'Target',
            schema: { type: 'bigquery-data-mart-schema', fields } as unknown as DataMart['schema'],
          }),
        });
        relationshipService.findByStorageId.mockResolvedValue([relationship]);

        const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
        return result.availableSources[0];
      }

      it.each([
        [[{ name: 'id', type: 'INTEGER', isPrimaryKey: true }], 'available'],
        [[{ name: 'id', type: 'INTEGER' }], 'no-primary-key'],
        [
          [{ name: 'id', type: 'INTEGER', isPrimaryKey: true, isHiddenForReporting: true }],
          'available',
        ],
      ])('classifies %j as %s', async (fields, expected) => {
        const availableSource = await computeJoinedAvailableSource(fields);
        expect(availableSource.uniqueCountAvailability).toBe(expected);
      });

      // The trap: `targetSchemaFields` inside the service is already filtered by
      // isHiddenForReporting for the reporting menu. Classifying from that filtered list would
      // wrongly report no-primary-key for a target whose key merely happens to be hidden — the
      // classifier must be fed the RAW schema, not the locally-filtered one.
      it('reports available for a hidden primary key even when other fields are visible', async () => {
        const availableSource = await computeJoinedAvailableSource([
          { name: 'visible', type: 'STRING' },
          { name: 'id', type: 'INTEGER', isPrimaryKey: true, isHiddenForReporting: true },
        ]);

        expect(availableSource.uniqueCountAvailability).toBe('available');
        // The hidden PK is still excluded from the reporting-menu field/blended-field list.
        expect(availableSource.fieldCount).toBe(1);
      });

      it('reports disconnected-primary-key when the declared key is DISCONNECTED', async () => {
        const availableSource = await computeJoinedAvailableSource([
          { name: 'id', type: 'INTEGER', isPrimaryKey: true, status: 'DISCONNECTED' },
        ]);
        expect(availableSource.uniqueCountAvailability).toBe('disconnected-primary-key');
      });

      it('reports nested-primary-key when the declared key lives inside a nested container', async () => {
        const availableSource = await computeJoinedAvailableSource([
          {
            name: 'meta',
            type: 'RECORD',
            fields: [{ name: 'inner_id', type: 'INTEGER', isPrimaryKey: true }],
          },
        ]);
        expect(availableSource.uniqueCountAvailability).toBe('nested-primary-key');
      });
    });

    // What the picker's tooltip names as the columns being counted. The SAME columns the sleeve
    // counts by, so the explanation can never describe a key the query does not use.
    describe('uniqueCountKeyFields', () => {
      async function computeJoinedAvailableSource(
        fields: Array<Record<string, unknown>>
      ): Promise<AvailableSourceDto> {
        dataMartService.getByIdAndProjectId.mockResolvedValue(makeDataMart({ id: 'dm-1' }));
        relationshipService.findByStorageId.mockResolvedValue([
          makeRelationship({
            id: 'rel-1',
            targetAlias: 'target',
            targetDataMart: makeDataMart({
              id: 'dm-2',
              title: 'Target',
              schema: {
                type: 'bigquery-data-mart-schema',
                fields,
              } as unknown as DataMart['schema'],
            }),
          }),
        ]);
        const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
        return result.availableSources[0];
      }

      it('lists every component of a multi-column key, in schema order', async () => {
        const source = await computeJoinedAvailableSource([
          { name: 'date', type: 'DATE', isPrimaryKey: true },
          { name: 'revenue', type: 'FLOAT' },
          { name: 'campaign', type: 'STRING', isPrimaryKey: true },
        ]);

        expect(source.uniqueCountKeyFields).toEqual(['date', 'campaign']);
      });

      // A hidden key still keys the join, so the tooltip names it — the metric IS counted by it.
      it('includes a key hidden from reporting', async () => {
        const source = await computeJoinedAvailableSource([
          { name: 'visible', type: 'STRING' },
          { name: 'id', type: 'INTEGER', isPrimaryKey: true, isHiddenForReporting: true },
        ]);

        expect(source.uniqueCountKeyFields).toEqual(['id']);
      });

      it.each([
        ['no key at all', [{ name: 'id', type: 'INTEGER' }]],
        [
          'a disconnected key',
          [{ name: 'id', type: 'INTEGER', isPrimaryKey: true, status: 'DISCONNECTED' }],
        ],
        [
          'a nested key',
          [
            {
              name: 'meta',
              type: 'RECORD',
              fields: [{ name: 'inner_id', type: 'INTEGER', isPrimaryKey: true }],
            },
          ],
        ],
      ])('is empty for %s — there is nothing the metric would count', async (_case, fields) => {
        const source = await computeJoinedAvailableSource(fields);

        expect(source.uniqueCountKeyFields).toEqual([]);
      });
    });

    // The MAIN mart's key cannot be read off `nativeFields`, which this service strips of hidden
    // fields — so it is published separately, computed from the raw schema.
    describe('mainUniqueCountKeyFields', () => {
      async function computeMainKey(fields: Array<Record<string, unknown>>): Promise<string[]> {
        dataMartService.getByIdAndProjectId.mockResolvedValue(
          makeDataMart({
            id: 'dm-1',
            schema: {
              type: 'bigquery-data-mart-schema',
              fields,
            } as unknown as DataMart['schema'],
          })
        );
        relationshipService.findByStorageId.mockResolvedValue([]);
        const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
        return result.mainUniqueCountKeyFields;
      }

      it('counts a key hidden for reporting, which nativeFields no longer carries', async () => {
        const fields = [
          { name: 'id', type: 'INTEGER', isPrimaryKey: true, isHiddenForReporting: true },
          { name: 'name', type: 'STRING' },
        ];

        await expect(computeMainKey(fields)).resolves.toEqual(['id']);
      });

      it('keeps every component of a composite key, hidden ones included, in schema order', async () => {
        const fields = [
          { name: 'order_id', type: 'STRING', isPrimaryKey: true },
          { name: 'line_no', type: 'INTEGER', isPrimaryKey: true, isHiddenForReporting: true },
        ];

        await expect(computeMainKey(fields)).resolves.toEqual(['order_id', 'line_no']);
      });

      // Counting by the rest of a composite key merges rows the key keeps distinct.
      it('withholds the whole key when one component is disconnected', async () => {
        const fields = [
          { name: 'order_id', type: 'STRING', isPrimaryKey: true, status: 'DISCONNECTED' },
          { name: 'line_no', type: 'INTEGER', isPrimaryKey: true },
        ];

        await expect(computeMainKey(fields)).resolves.toEqual([]);
      });
    });

    // Same reason as `mainUniqueCountKeyFields` above: resolved against the RAW schema, not
    // `nativeFields`, because a formula may legally reference a field hidden for reporting.
    describe('calculatedFieldIssues', () => {
      async function computeIssues(fields: Array<Record<string, unknown>>) {
        dataMartService.getByIdAndProjectId.mockResolvedValue(
          makeDataMart({
            id: 'dm-1',
            schema: {
              type: 'bigquery-data-mart-schema',
              fields,
            } as unknown as DataMart['schema'],
          })
        );
        relationshipService.findByStorageId.mockResolvedValue([]);
        const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
        return result.calculatedFieldIssues;
      }

      it('reports a calculated field whose formula references a field the schema no longer has', async () => {
        const fields = [
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: {
              formula: '{{ref field="clicks"}} / {{ref field="deleted_field"}}',
              level: 'metric',
            },
          },
        ];

        await expect(computeIssues(fields)).resolves.toEqual([
          { field: 'ctr', missing: ['deleted_field'] },
        ]);
      });

      it('omits a calculated field whose references all resolve', async () => {
        const fields = [
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: '{{ref field="clicks"}}', level: 'metric' },
          },
        ];

        await expect(computeIssues(fields)).resolves.toEqual([]);
      });

      // The case this field exists to get right: `nativeFields` has already stripped a
      // reporting-hidden field, but the raw schema this resolves against still has it, so it
      // must NOT read as missing.
      it('does not flag a reference to a field hidden for reporting as missing', async () => {
        const fields = [
          { name: 'clicks', type: 'INTEGER', isHiddenForReporting: true },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: '{{ref field="clicks"}}', level: 'metric' },
          },
        ];

        await expect(computeIssues(fields)).resolves.toEqual([]);
      });

      // Both halves ride ONE `missing` array on one hard-blocking channel, so the comment rule has
      // to be the same on both: a commented-out reference is not SQL, and greying the metric out
      // for one would apply the rule at random from the analyst's side.
      it('does not flag an own reference that is commented out', async () => {
        const fields = [
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: {
              formula: 'SUM({{ref field="clicks"}})\n-- was {{ref field="deleted_field"}}\n',
              level: 'metric',
            },
          },
        ];

        await expect(computeIssues(fields)).resolves.toEqual([]);
      });

      it('reports every calculated field that has an issue, not just the first', async () => {
        const fields = [
          {
            name: 'ctr',
            type: 'FLOAT',
            calculated: { formula: '{{ref field="missing_a"}}', level: 'metric' },
          },
          {
            name: 'cpc',
            type: 'FLOAT',
            calculated: { formula: '{{ref field="missing_b"}}', level: 'metric' },
          },
        ];

        await expect(computeIssues(fields)).resolves.toEqual([
          { field: 'ctr', missing: ['missing_a'] },
          { field: 'cpc', missing: ['missing_b'] },
        ]);
      });

      // A joined reference goes stale in ways an own reference cannot: the join is deleted, or its
      // alias is renamed somewhere this Data Mart's cascade never reaches.
      describe('joined references', () => {
        async function computeJoinedIssues(
          formula: string,
          opts: {
            alias?: string;
            field?: string;
            hidden?: boolean;
            excluded?: boolean;
            calculated?: boolean;
            inaccessible?: boolean;
          } = {}
        ) {
          if (opts.inaccessible) {
            accessDecisionService.canAccessMany.mockResolvedValue(new Map([['dm-2', false]]));
          }
          dataMartService.getByIdAndProjectId.mockResolvedValue(
            makeDataMart({
              id: 'dm-1',
              blendedFieldsConfig: opts.excluded
                ? { sources: [{ path: opts.alias ?? 'orders', isExcluded: true }] }
                : undefined,
              schema: {
                type: 'bigquery-data-mart-schema',
                fields: [
                  { name: 'cost', type: 'FLOAT' },
                  { name: 'roi', type: 'FLOAT', calculated: { formula, level: 'metric' } },
                ],
              } as unknown as DataMart['schema'],
            })
          );
          relationshipService.findByStorageId.mockResolvedValue([
            makeRelationship({
              id: 'rel-orders',
              targetAlias: opts.alias ?? 'orders',
              targetDataMart: makeDataMart({
                id: 'dm-2',
                title: 'Orders',
                schema: makeSchema([
                  {
                    name: opts.field ?? 'amount',
                    type: 'FLOAT',
                    ...(opts.hidden ? { isHiddenForReporting: true } : {}),
                    ...(opts.calculated
                      ? { calculated: { formula: '{{ref field="gross"}}', level: 'metric' } }
                      : {}),
                  },
                ] as never),
              }),
            }),
          ]);
          const result = await service.computeBlendableSchema('dm-1', 'project-1', defaultAccessor);
          return result.calculatedFieldIssues;
        }

        const JOINED = 'SUM({{ref path="orders" field="amount"}})';

        it('omits a metric whose joined reference resolves', async () => {
          await expect(computeJoinedIssues(JOINED)).resolves.toEqual([]);
        });

        it('reports a joined reference whose alias names no source any more', async () => {
          await expect(computeJoinedIssues(JOINED, { alias: 'renamed_orders' })).resolves.toEqual([
            { field: 'roi', missing: ['orders.amount'] },
          ]);
        });

        // The grandparent case the rename cascade deliberately does not repair: the formula is left
        // pointing at a path that no longer resolves, and this is where the analyst learns that.
        it('reports a nested path whose renamed grandparent segment is stale', async () => {
          await expect(
            computeJoinedIssues('SUM({{ref path="orders.items" field="qty"}})')
          ).resolves.toEqual([{ field: 'roi', missing: ['orders.items.qty'] }]);
        });

        it('reports a joined field gone from the source', async () => {
          await expect(computeJoinedIssues(JOINED, { field: 'total' })).resolves.toEqual([
            { field: 'roi', missing: ['orders.amount'] },
          ]);
        });

        it('reports a joined field hidden from reporting', async () => {
          await expect(computeJoinedIssues(JOINED, { hidden: true })).resolves.toEqual([
            { field: 'roi', missing: ['orders.amount'] },
          ]);
        });

        // Exclusion is curation, not breakage: the join is still built (`buildRelationshipChains`
        // ignores `isIncluded`), the formula still renders, and calling it broken would grey out a
        // metric that works — while an ordinary stored column reference to the same source runs.
        it('does NOT report a source merely excluded from reporting', async () => {
          await expect(computeJoinedIssues(JOINED, { excluded: true })).resolves.toEqual([]);
        });

        // A formula may not read another formula — the joined Data Mart's own calculated field is
        // no more readable than a local one, and it has no warehouse column behind it at all.
        it('reports a joined reference to the source’s OWN calculated field', async () => {
          await expect(computeJoinedIssues(JOINED, { calculated: true })).resolves.toEqual([
            { field: 'roi', missing: ['orders.amount'] },
          ]);
        });

        // The report this metric would feed cannot be built for this user at all, so the picker
        // must grey it out rather than offer a metric whose every run 400s on access.
        it('reports a joined reference to a source this user cannot read', async () => {
          await expect(computeJoinedIssues(JOINED, { inaccessible: true })).resolves.toEqual([
            { field: 'roi', missing: ['orders.amount'] },
          ]);
        });

        it('does not report a joined reference that is commented out', async () => {
          await expect(
            computeJoinedIssues(
              'SUM({{ref field="cost"}})\n-- {{ref path="gone" field="amount"}}\n'
            )
          ).resolves.toEqual([]);
        });

        it('reports the own and joined halves of one formula together', async () => {
          await expect(
            computeJoinedIssues(
              '{{ref field="deleted_field"}} * SUM({{ref path="gone" field="amount"}})'
            )
          ).resolves.toEqual([{ field: 'roi', missing: ['deleted_field', 'gone.amount'] }]);
        });
      });
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

describe('flattenSchemaFields', () => {
  it('flattenSchemaFields keeps a calculated field', () => {
    const flat = flattenSchemaFields([
      {
        name: 'ctr',
        type: 'FLOAT',
        status: DataMartSchemaFieldStatus.DISCONNECTED,
        calculated: { formula: 'SUM({{ref field="clicks"}})', level: 'metric' },
      },
    ] as never);
    expect(flat.map(f => f.name)).toEqual(['ctr']);
  });

  it('still drops a plain DISCONNECTED field', () => {
    const flat = flattenSchemaFields([
      { name: 'gone', type: 'STRING', status: DataMartSchemaFieldStatus.DISCONNECTED },
    ] as never);
    expect(flat).toEqual([]);
  });
});
