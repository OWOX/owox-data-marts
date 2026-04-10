import { Test, TestingModule } from '@nestjs/testing';
import { DataMartRelationship } from '../../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  BlendedQueryContext,
  ResolvedRelationshipChain,
} from '../../interfaces/blended-query-builder.interface';
import { RedshiftBlendedQueryBuilder } from './redshift-blended-query-builder';

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

function makeChain(
  partial: Omit<ResolvedRelationshipChain, 'targetDataMartTitle' | 'targetDataMartUrl'>
): ResolvedRelationshipChain {
  return {
    ...partial,
    targetDataMartTitle: 'Test Subsidiary',
    targetDataMartUrl: '/ui/proj/data-marts/sub-1/data-setup',
  };
}

function buildContext(
  mainTableReference: string,
  chains: ResolvedRelationshipChain[],
  columns: string[]
): BlendedQueryContext {
  return {
    mainTableReference,
    mainDataMartTitle: 'Test Main',
    mainDataMartUrl: '/ui/proj/data-marts/main-1/data-setup',
    chains,
    columns,
  };
}

describe('RedshiftBlendedQueryBuilder', () => {
  let builder: RedshiftBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedshiftBlendedQueryBuilder],
    }).compile();

    builder = module.get(RedshiftBlendedQueryBuilder);
  });

  it('should have type AWS_REDSHIFT', () => {
    expect(builder.type).toBe(DataStorageType.AWS_REDSHIFT);
  });

  describe('single subsidiary with LISTAGG', () => {
    it('generates correct SQL with pre-aggregation and LEFT JOIN using LISTAGG', () => {
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: '"myschema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext('"myschema"."customers"', [chain], ['customer_name', 'order_names'])
      );

      expect(sql.trimStart().startsWith('WITH')).toBe(true);
      expect(sql).toContain('main AS (');
      expect(sql).toContain('SELECT * FROM "myschema"."customers"');
      expect(sql).toContain('orders_raw AS (');
      expect(sql).toContain('SELECT * FROM "myschema"."orders"');
      expect(sql).toContain('orders AS (');
      expect(sql).toContain('FROM orders_raw');
      expect(sql).toContain('GROUP BY customer_id');
      expect(sql).toContain("LISTAGG(order_name, ', ') AS order_names");
      expect(sql).toContain('FROM main');
      expect(sql).toContain('LEFT JOIN orders ON main.id = orders.customer_id');
      expect(sql).toContain('main.customer_name');
      expect(sql).toContain('orders.order_names');
    });

    it('does not use STRING_AGG syntax', () => {
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: '"myschema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext('"myschema"."customers"', [chain], ['order_names'])
      );

      expect(sql).not.toContain('STRING_AGG');
    });
  });

  describe('multi-key join', () => {
    it('generates AND in ON clause and multi-column GROUP BY for multiple join keys', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'events',
          joinConditions: [
            { sourceFieldName: 'project_id', targetFieldName: 'evt_project_id' },
            { sourceFieldName: 'user_id', targetFieldName: 'evt_user_id' },
          ],
        }),
        targetTableReference: '"myschema"."events"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'event_name',
            outputAlias: 'event_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext('"myschema"."customers"', [chain], ['event_names'])
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
      const chain1 = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: '"schema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const chain2 = makeChain({
        relationship: makeRelationship({
          id: 'rel-2',
          targetAlias: 'payments',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'payer_id' }],
        }),
        targetTableReference: '"schema"."payments"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'total_amount',
            isHidden: false,
            aggregateFunction: 'MAX',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext(
          '"schema"."customers"',
          [chain1, chain2],
          ['customer_name', 'order_names', 'total_amount']
        )
      );

      expect(sql).toContain('ON main.id = orders.customer_id');
      expect(sql).toContain('ON main.id = payments.payer_id');
      expect(sql).toContain('MAX(amount) AS total_amount');
    });
  });

  describe('non-STRING_AGG aggregation', () => {
    it('uses SUM function correctly', () => {
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: '"myschema"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'revenue',
            outputAlias: 'total_revenue',
            isHidden: false,
            aggregateFunction: 'SUM',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext('"myschema"."customers"', [chain], ['total_revenue'])
      );

      expect(sql).toContain('SUM(revenue) AS total_revenue');
    });
  });
});
