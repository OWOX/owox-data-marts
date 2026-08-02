import { Test, TestingModule } from '@nestjs/testing';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { DatabricksBlendedQueryBuilder } from './databricks-blended-query-builder';
import { DatabricksClauseRenderer } from './databricks-clause-renderer';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';
import type { AggregationRule } from '../../../dto/schemas/aggregation-config.schema';

const buildContext = createBuildContext('`catalog`.`schema`.`customers`');

describe('DatabricksBlendedQueryBuilder', () => {
  let builder: DatabricksBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabricksBlendedQueryBuilder, DatabricksClauseRenderer],
    }).compile();

    builder = module.get(DatabricksBlendedQueryBuilder);
  });

  it('should have type DATABRICKS', () => {
    expect(builder.type).toBe(DataStorageType.DATABRICKS);
  });

  it("uses CONCAT_WS(', ', COLLECT_LIST(CAST(field AS STRING))) for STRING_AGG aggregation", () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`catalog`.`schema`.`orders`',
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
      "CONCAT_WS(', ', SORT_ARRAY(COLLECT_LIST(CAST(order_name AS STRING)))) AS order_names"
    );
    expect(sql).not.toContain('STRING_AGG');
    expect(sql).not.toContain('LISTAGG');
    expect(sql).not.toContain('ARRAY_JOIN');
  });

  it('uses COUNT(DISTINCT field) for COUNT_DISTINCT aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '`catalog`.`schema`.`orders`',
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

  it('uses ` (backtick) quoting for identifiers', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: "Product's",
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
      }),
      targetTableReference: '`catalog`.`schema`.`products`',
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
      targetTableReference: '`catalog`.`schema`.`orders`',
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
});

// C2.1: Spark SQL treats a window ORDER BY integer literal as a constant (the ordinal
// shorthand is a distinct, top-level-query-only ORDER BY/SORT BY feature gated by
// `spark.sql.orderByOrdinal`, not part of window OVER clause parsing), so the base
// class's default surrogate compiles as-is here — no override needed.
describe('DatabricksBlendedQueryBuilder — row surrogate (__owox_rid) for value-sleeve owners', () => {
  let builder: DatabricksBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabricksBlendedQueryBuilder, DatabricksClauseRenderer],
    }).compile();
    builder = module.get(DatabricksBlendedQueryBuilder);
  });

  it('partitions the row surrogate by the chain own join key when the chain owns a joined SUM metric', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
      }),
      targetTableReference: '`catalog`.`schema`.`orders`',
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
          type: 'DOUBLE',
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
    } as never);

    const ctx: BlendedQueryContext = {
      ...buildContext([chain], ['orders__amount']),
      fieldIndex,
      aggregations: [{ column: 'orders__amount', function: 'SUM' } as AggregationRule],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY 1) AS __owox_rid');

    // (tester): pin the sleeve BODY on Databricks too, not just the surrogate line.
    const s = sql.replace(/\s+/g, ' ');
    expect(s).toContain('sleeve_orders__amount AS (');
    expect(s).toContain('SUM(_val) AS `orders__amount | SUM`');
    expect(s).toContain('orders_raw.__owox_rid AS _oid');
    expect(s).toContain('orders_raw.amount AS _val');
    expect(s).toContain('ANY_VALUE(sleeve_orders__amount.`orders__amount | SUM`)');
  });

  it('spells a joined percentile as an ordered-set aggregate inside the value sleeve', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
      }),
      targetTableReference: '`catalog`.`schema`.`orders`',
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
          type: 'DOUBLE',
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
    } as never);

    const { sql } = builder.buildBlendedQuery({
      ...buildContext([chain], ['orders__amount']),
      fieldIndex,
      aggregations: [{ column: 'orders__amount', function: 'P75' } as AggregationRule],
    });
    const s = sql.replace(/\s+/g, ' ');

    expect(s).toContain(
      'PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY _val) AS `orders__amount | P75`'
    );
    expect(s).toContain('orders_raw.amount AS _val');
  });
});

describe('DatabricksBlendedQueryBuilder — output controls', () => {
  let builder: DatabricksBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabricksBlendedQueryBuilder, DatabricksClauseRenderer],
    }).compile();
    builder = module.get(DatabricksBlendedQueryBuilder);
  });

  function ctx(over: Partial<BlendedQueryContext>): BlendedQueryContext {
    return {
      mainTableReference: '`catalog`.`schema`.`customers`',
      mainDataMartTitle: 'M',
      mainDataMartUrl: 'http://x',
      chains: [],
      columns: ['a'],
      ...over,
    };
  }

  it('applies a post-join filter as an inlined literal predicate with no bound params', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({ filters: [{ column: 'a', operator: 'eq', value: 1 }] })
    );
    // Spark is case-insensitive, so simple post-join columns stay bare (main.a, not main.`a`).
    expect(sql).toContain('WHERE main.a = 1');
    expect(params).toEqual([]);
  });

  it('uses contains for the string contains operator (no ? / @p placeholders)', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({ filters: [{ column: 'status', operator: 'contains', value: 'active' }] })
    );
    expect(sql).toContain("contains(main.status, 'active')");
    expect(sql).not.toMatch(/[?]|@p\d/);
    expect(params).toEqual([]);
  });

  it('renders ORDER BY and LIMIT', () => {
    const { sql } = builder.buildBlendedQuery(
      ctx({ sort: [{ column: 'a', direction: 'desc' }], limit: 10 })
    );
    expect(sql).toContain('ORDER BY\n  main.a DESC');
    expect(sql).toContain('LIMIT 10');
  });

  it('inlines a pre-join slice filter as a literal inside the subsidiary raw CTE with no params', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
      }),
      targetTableReference: '`catalog`.`schema`.`users`',
      parentAlias: 'main',
      blendedFields: [
        { targetFieldName: 'role', outputAlias: 'role', isHidden: true, aggregateFunction: 'MAX' },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        { name: 'users__role', aliasPath: 'users', originalFieldName: 'role', type: 'STRING' },
      ],
      availableSources: [{ aliasPath: 'users', isIncluded: true }],
    } as never);
    const { sql, params } = builder.buildBlendedQuery(
      ctx({
        chains: [chain],
        columns: ['a'],
        filters: [
          {
            column: 'users__role',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
      })
    );
    // The inlined predicate must sit inside the subsidiary raw CTE, before the outer SELECT.
    // Spark is case-insensitive so the simple alias/column stay bare (users_raw, role).
    const rawCteStart = sql.indexOf('users_raw AS (');
    const predicatePos = sql.indexOf("role = 'admin'");
    const outerSelectPos = sql.lastIndexOf('\nSELECT\n');
    expect(rawCteStart).toBeGreaterThanOrEqual(0);
    expect(predicatePos).toBeGreaterThan(rawCteStart);
    expect(predicatePos).toBeLessThan(outerSelectPos);
    expect(sql).not.toContain('main.role');
    expect(params).toEqual([]);
  });
});
