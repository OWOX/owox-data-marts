import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { BigQueryBlendedQueryBuilder } from './bigquery-blended-query-builder';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';

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

    expect(sql).toContain(
      "STRING_AGG(CAST(order_name AS STRING), ', ' ORDER BY CAST(order_name AS STRING)) AS order_names"
    );
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

    // `order_amount` is a JOINED column — since 3, a report-level SUM on it routes
    // through its value sleeve (uniform routing) instead of the dialect SUM re-aggregation
    // below, so this needs a populated field index (same as the real caller always supplies).
    const orderFieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        { name: 'order_amount', aliasPath: 'orders', originalFieldName: 'amount', type: 'FLOAT64' },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
    } as never);

    it('routes a joined SUM through its value sleeve with the dialect ANY_VALUE pull', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([orderChain()], ['channel', 'order_amount']),
        fieldIndex: orderFieldIndex,
        aggregations: [{ column: 'order_amount', function: 'SUM' }],
      });

      expect(sql).toContain('main.channel AS `channel`');
      expect(sql).toContain('sleeve_order_amount AS (');
      expect(sql).toContain(
        'ANY_VALUE(sleeve_order_amount.`order_amount | SUM`) AS `order_amount | SUM`'
      );
      expect(sql).not.toContain('SUM(orders.order_amount)');
      expect(sql).toContain('GROUP BY\n  main.channel');
    });

    it('routes a joined P95 through its value sleeve, spelled with the BigQuery percentile form', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([orderChain()], ['channel', 'order_amount']),
        fieldIndex: orderFieldIndex,
        aggregations: [{ column: 'order_amount', function: 'P95' }],
      });

      expect(sql).toContain('sleeve_order_amount AS (');
      expect(sql).toContain('APPROX_QUANTILES(_val, 100)[OFFSET(95)] AS `order_amount | P95`');
      expect(sql).toContain(
        'ANY_VALUE(sleeve_order_amount.`order_amount | P95`) AS `order_amount | P95`'
      );
      expect(sql).not.toContain('APPROX_QUANTILES(orders.order_amount');
      expect(sql).toContain('GROUP BY\n  main.channel');
    });
  });

  // C2.1: BigQuery treats a window ORDER BY integer literal as a constant, not an ordinal
  // reference into the outer SELECT list, so the base class's default surrogate compiles
  // as-is here — no override needed.
  describe('row surrogate (__owox_rid) for value-sleeve owners', () => {
    it('partitions the row surrogate by the chain own join key when the chain owns a joined SUM metric', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: '`project`.`dataset`.`orders`',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'orders__amount',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
        ],
      });
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__amount',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            type: 'FLOAT64',
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never);

      const { sql } = builder.buildBlendedQuery({
        ...buildContext([chain], ['orders__amount']),
        fieldIndex,
        aggregations: [{ column: 'orders__amount', function: 'SUM' }],
      });

      expect(sql).toContain(
        'ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY 1) AS __owox_rid'
      );
    });
  });
});
