import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { BigQueryBlendedQueryBuilder } from './bigquery-blended-query-builder';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';

const buildContext = createBuildContext('`project`.`dataset`.`customers`');

describe('BigQueryBlendedQueryBuilder', () => {
  let builder: BigQueryBlendedQueryBuilder;

  beforeEach(() => {
    builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());
  });

  it('should have type GOOGLE_BIGQUERY', () => {
    expect(builder.type).toBe(DataStorageType.GOOGLE_BIGQUERY);
  });

  it('uses STRING_AGG(CAST(... AS STRING)) for STRING_AGG aggregation', () => {
    const chain = makeChain({
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
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_names']));

    expect(sql).toContain("STRING_AGG(CAST(order_name AS STRING), ', ') AS order_names");
    expect(sql).not.toContain('LISTAGG');
    expect(sql).not.toContain('ARRAY_JOIN');
  });

  it('uses backtick quoting for identifiers', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: "Product's",
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
      }),
      targetTableReference: '`p`.`d`.`products`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'name',
          outputAlias: 'product_names',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['product_names']));

    expect(sql).toContain("`Product's_raw` AS (");
    expect(sql).toContain("`Product's` AS (");
    // Backticks, not double-quotes
    expect(sql).not.toMatch(/"Product's"/);
  });

  it('uses COUNT function correctly', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`project`.`dataset`.`orders`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'order_id',
          outputAlias: 'order_count',
          isHidden: false,
          aggregateFunction: 'COUNT',
        },
      ],
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_count']));

    expect(sql).toContain('COUNT(order_id) AS order_count');
  });

  it('uses ANY_VALUE(field) for ANY_VALUE leaf aggregation (natively supported)', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`project`.`dataset`.`orders`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'order_name',
          outputAlias: 'sample_name',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['sample_name']));

    expect(sql).toContain('ANY_VALUE(order_name) AS sample_name');
    expect(sql).not.toContain('arbitrary');
  });

  it('uses COUNT(DISTINCT field) for COUNT_DISTINCT aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`project`.`dataset`.`orders`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'customer_id',
          outputAlias: 'unique_customers',
          isHidden: false,
          aggregateFunction: 'COUNT_DISTINCT',
        },
      ],
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['unique_customers']));

    expect(sql).toContain('COUNT(DISTINCT customer_id) AS unique_customers');
  });

  describe('post-join aggregation', () => {
    function orderChain() {
      return makeChain({
        relationship: makeRelationship(),
        targetTableReference: '`project`.`dataset`.`orders`',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'order_amount',
            isHidden: false,
            aggregateFunction: 'SUM',
          },
        ],
      });
    }

    it('emits an outer GROUP BY over the blended result with the dialect SUM expression', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([orderChain()], ['channel', 'order_amount']),
        aggregations: [{ column: 'order_amount', function: 'SUM' }],
      });

      expect(sql).toContain('main.channel AS `channel`');
      expect(sql).toContain('SUM(orders.order_amount) AS `order_amount | SUM`');
      expect(sql).toContain('GROUP BY\n  main.channel');
    });

    it('routes a P95 metric through the BigQuery dialect percentile expression', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([orderChain()], ['channel', 'order_amount']),
        aggregations: [{ column: 'order_amount', function: 'P95' }],
      });

      expect(sql).toContain(
        'APPROX_QUANTILES(orders.order_amount, 100)[OFFSET(95)] AS `order_amount | P95`'
      );
      expect(sql).toContain('GROUP BY\n  main.channel');
    });
  });
});
