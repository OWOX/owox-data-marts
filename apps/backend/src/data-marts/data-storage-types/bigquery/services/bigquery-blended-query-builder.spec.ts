import { Test, TestingModule } from '@nestjs/testing';
import { DataMartRelationship } from '../../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { ResolvedRelationshipChain } from '../../interfaces/blended-query-builder.interface';
import { BigQueryBlendedQueryBuilder } from './bigquery-blended-query-builder';

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

describe('BigQueryBlendedQueryBuilder', () => {
  let builder: BigQueryBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BigQueryBlendedQueryBuilder],
    }).compile();

    builder = module.get(BigQueryBlendedQueryBuilder);
  });

  it('should have type GOOGLE_BIGQUERY', () => {
    expect(builder.type).toBe(DataStorageType.GOOGLE_BIGQUERY);
  });

  describe('single subsidiary with STRING_AGG', () => {
    it('generates correct SQL with pre-aggregation and LEFT JOIN', () => {
      const chain: ResolvedRelationshipChain = {
        relationship: makeRelationship(),
        targetTableReference: '`project`.`dataset`.`orders`',
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
        '`project`.`dataset`.`customers`',
        [chain],
        ['customer_name', 'order_names']
      );

      expect(sql).toContain('FROM `project`.`dataset`.`customers` AS main');
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('FROM `project`.`dataset`.`orders`');
      expect(sql).toContain('GROUP BY customer_id');
      expect(sql).toContain("STRING_AGG(CAST(order_name AS STRING), ', ') AS order_names");
      expect(sql).toContain('ON main.id = orders.customer_id');
      expect(sql).toContain('main.customer_name');
      expect(sql).toContain('orders.order_names');
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
        targetTableReference: '`p`.`d`.`orders`',
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
        targetTableReference: '`p`.`d`.`payments`',
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
        '`p`.`d`.`customers`',
        [chain1, chain2],
        ['customer_name', 'order_names', 'total_amount']
      );

      expect(sql).toContain('ON main.id = orders.customer_id');
      expect(sql).toContain('ON main.id = payments.payer_id');
      expect(sql).toContain('MAX(amount) AS total_amount');
    });
  });

  describe('transitive join', () => {
    it('uses parentAlias in ON clause instead of main', () => {
      const chain: ResolvedRelationshipChain = {
        relationship: makeRelationship({
          targetAlias: 'items',
          joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'item_order_id' }],
          blendedFields: [
            {
              targetFieldName: 'sku',
              outputAlias: 'item_skus',
              isHidden: false,
              aggregateFunction: 'STRING_AGG',
            },
          ],
        }),
        targetTableReference: '`p`.`d`.`items`',
        parentAlias: 'orders',
        blendedFields: [
          {
            targetFieldName: 'sku',
            outputAlias: 'item_skus',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      };

      const sql = builder.buildBlendedQuery('`p`.`d`.`customers`', [chain], ['item_skus']);

      expect(sql).toContain('ON orders.order_id = items.item_order_id');
    });
  });

  describe('multi-key join', () => {
    it('generates AND in ON clause for multiple join keys', () => {
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
        targetTableReference: '`p`.`d`.`events`',
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

      const sql = builder.buildBlendedQuery('`p`.`d`.`customers`', [chain], ['event_names']);

      expect(sql).toContain(
        'ON main.project_id = events.evt_project_id AND main.user_id = events.evt_user_id'
      );
      expect(sql).toContain('GROUP BY evt_project_id, evt_user_id');
    });
  });

  describe('column selection', () => {
    it('includes only specified columns in SELECT', () => {
      const chain: ResolvedRelationshipChain = {
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
            {
              targetFieldName: 'revenue',
              outputAlias: 'total_revenue',
              isHidden: false,
              aggregateFunction: 'SUM',
            },
          ],
        }),
        targetTableReference: '`p`.`d`.`orders`',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
          {
            targetFieldName: 'revenue',
            outputAlias: 'total_revenue',
            isHidden: false,
            aggregateFunction: 'SUM',
          },
        ],
      };

      const sql = builder.buildBlendedQuery(
        '`p`.`d`.`customers`',
        [chain],
        ['customer_name', 'order_names']
      );

      // order_names is in columns → present
      expect(sql).toContain('orders.order_names');
      // total_revenue is NOT in columns → absent from SELECT
      expect(sql).not.toContain('orders.total_revenue');
      // total_revenue should still appear in subquery (it's a blended field)
      expect(sql).toContain('SUM(revenue) AS total_revenue');
    });
  });

  describe('hidden fields', () => {
    it('hidden fields are excluded from SELECT but available in JOIN subquery', () => {
      const chain: ResolvedRelationshipChain = {
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
            {
              targetFieldName: 'internal_flag',
              outputAlias: 'hidden_flag',
              isHidden: true,
              aggregateFunction: 'MAX',
            },
          ],
        }),
        targetTableReference: '`p`.`d`.`orders`',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
          {
            targetFieldName: 'internal_flag',
            outputAlias: 'hidden_flag',
            isHidden: true,
            aggregateFunction: 'MAX',
          },
        ],
      };

      const sql = builder.buildBlendedQuery(
        '`p`.`d`.`customers`',
        [chain],
        ['customer_name', 'order_names', 'hidden_flag']
      );

      // hidden_flag is marked isHidden=true, so it should be treated as a main column
      // (not prefixed with the alias in SELECT, i.e. not in allSubsidiaryOutputAliases)
      expect(sql).toContain('main.hidden_flag');
      // but MAX(internal_flag) still appears in the subquery
      expect(sql).toContain('MAX(internal_flag) AS hidden_flag');
    });
  });
});
