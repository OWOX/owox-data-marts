import { Test, TestingModule } from '@nestjs/testing';
import { DataMartRelationship } from '../../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { ResolvedRelationshipChain } from '../../interfaces/blended-query-builder.interface';
import { SnowflakeBlendedQueryBuilder } from './snowflake-blended-query-builder';

function makeRelationship(overrides: Partial<DataMartRelationship> = {}): DataMartRelationship {
  return {
    id: 'rel-1',
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
    blendedFields: [
      {
        targetFieldName: 'order_name',
        outputAlias: 'order_names',
        isHidden: false,
        aggregateFunction: 'STRING_AGG',
      },
    ],
    projectId: 'proj',
    createdById: 'user-1',
    createdAt: new Date(),
    modifiedAt: new Date(),
    ...overrides,
  } as DataMartRelationship;
}

describe('SnowflakeBlendedQueryBuilder', () => {
  let builder: SnowflakeBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SnowflakeBlendedQueryBuilder],
    }).compile();

    builder = module.get(SnowflakeBlendedQueryBuilder);
  });

  it('should have type SNOWFLAKE', () => {
    expect(builder.type).toBe(DataStorageType.SNOWFLAKE);
  });

  describe('single subsidiary with LISTAGG', () => {
    it('generates correct SQL with pre-aggregation and LEFT JOIN using LISTAGG', () => {
      const chain: ResolvedRelationshipChain = {
        relationship: makeRelationship(),
        targetTableReference: 'mydb."myschema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      };

      const sql = builder.buildBlendedQuery(
        'mydb."myschema"."customers"',
        [chain],
        ['customer_name', 'order_names']
      );

      expect(sql).toContain('FROM mydb."myschema"."customers" AS main');
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('FROM mydb."myschema"."orders"');
      expect(sql).toContain('GROUP BY customer_id');
      expect(sql).toContain("LISTAGG(order_name, ', ') AS order_names");
      expect(sql).toContain('ON main.id = orders.customer_id');
      expect(sql).toContain('main.customer_name');
      expect(sql).toContain('orders.order_names');
    });

    it('does not use STRING_AGG syntax', () => {
      const chain: ResolvedRelationshipChain = {
        relationship: makeRelationship(),
        targetTableReference: 'mydb."myschema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      };

      const sql = builder.buildBlendedQuery(
        'mydb."myschema"."customers"',
        [chain],
        ['order_names']
      );

      expect(sql).not.toContain('STRING_AGG');
    });
  });

  describe('multi-key join', () => {
    it('generates AND in ON clause and multi-column GROUP BY for multiple join keys', () => {
      const chain: ResolvedRelationshipChain = {
        relationship: makeRelationship({
          targetAlias: 'events',
          joinConditions: [
            { sourceFieldName: 'project_id', targetFieldName: 'evt_project_id' },
            { sourceFieldName: 'user_id', targetFieldName: 'evt_user_id' },
          ],
          blendedFields: [
            {
              targetFieldName: 'event_name',
              outputAlias: 'event_names',
              isHidden: false,
              aggregateFunction: 'STRING_AGG',
            },
          ],
        }),
        targetTableReference: 'mydb."myschema"."events"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'event_name',
            outputAlias: 'event_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      };

      const sql = builder.buildBlendedQuery(
        'mydb."myschema"."customers"',
        [chain],
        ['event_names']
      );

      expect(sql).toContain(
        'ON main.project_id = events.evt_project_id AND main.user_id = events.evt_user_id'
      );
      expect(sql).toContain('GROUP BY evt_project_id, evt_user_id');
      expect(sql).toContain("LISTAGG(event_name, ', ') AS event_names");
    });
  });

  describe('multiple subsidiaries', () => {
    it('generates multiple LEFT JOINs', () => {
      const chain1: ResolvedRelationshipChain = {
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
          blendedFields: [
            {
              targetFieldName: 'order_name',
              outputAlias: 'order_names',
              isHidden: false,
              aggregateFunction: 'STRING_AGG',
            },
          ],
        }),
        targetTableReference: 'db."schema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      };

      const chain2: ResolvedRelationshipChain = {
        relationship: makeRelationship({
          id: 'rel-2',
          targetAlias: 'payments',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'payer_id' }],
          blendedFields: [
            {
              targetFieldName: 'amount',
              outputAlias: 'total_amount',
              isHidden: false,
              aggregateFunction: 'MAX',
            },
          ],
        }),
        targetTableReference: 'db."schema"."payments"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'total_amount',
            isHidden: false,
            aggregateFunction: 'MAX',
          },
        ],
      };

      const sql = builder.buildBlendedQuery(
        'db."schema"."customers"',
        [chain1, chain2],
        ['customer_name', 'order_names', 'total_amount']
      );

      expect(sql).toContain('ON main.id = orders.customer_id');
      expect(sql).toContain('ON main.id = payments.payer_id');
      expect(sql).toContain('MAX(amount) AS total_amount');
    });
  });

  describe('non-STRING_AGG aggregation', () => {
    it('uses COUNT function correctly', () => {
      const chain: ResolvedRelationshipChain = {
        relationship: makeRelationship({
          blendedFields: [
            {
              targetFieldName: 'order_id',
              outputAlias: 'order_count',
              isHidden: false,
              aggregateFunction: 'COUNT',
            },
          ],
        }),
        targetTableReference: 'mydb."myschema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_id',
            outputAlias: 'order_count',
            isHidden: false,
            aggregateFunction: 'COUNT',
          },
        ],
      };

      const sql = builder.buildBlendedQuery(
        'mydb."myschema"."customers"',
        [chain],
        ['order_count']
      );

      expect(sql).toContain('COUNT(order_id) AS order_count');
    });
  });
});
