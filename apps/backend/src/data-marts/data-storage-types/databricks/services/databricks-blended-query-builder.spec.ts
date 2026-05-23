import { Test, TestingModule } from '@nestjs/testing';
import { NotImplementedException } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { DatabricksBlendedQueryBuilder } from './databricks-blended-query-builder';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';

const buildContext = createBuildContext('`catalog`.`schema`.`customers`');

describe('DatabricksBlendedQueryBuilder', () => {
  let builder: DatabricksBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabricksBlendedQueryBuilder],
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
      "CONCAT_WS(', ', COLLECT_LIST(CAST(order_name AS STRING))) AS order_names"
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

describe('DatabricksBlendedQueryBuilder — output controls guard', () => {
  const builder = new DatabricksBlendedQueryBuilder();
  const baseContext: BlendedQueryContext = {
    mainTableReference: '`catalog`.`schema`.`customers`',
    mainDataMartTitle: 'M',
    mainDataMartUrl: 'http://x',
    chains: [],
    columns: ['a'],
  };

  it('throws NotImplemented when filters are non-empty', () => {
    expect(() =>
      builder.buildBlendedQuery({
        ...baseContext,
        filters: [{ column: 'a', operator: 'eq', value: 1 }],
      })
    ).toThrow(NotImplementedException);
  });

  it('throws NotImplemented when sort is non-empty', () => {
    expect(() =>
      builder.buildBlendedQuery({
        ...baseContext,
        sort: [{ column: 'a', direction: 'asc' }],
      })
    ).toThrow(NotImplementedException);
  });

  it('throws NotImplemented when limit is set', () => {
    expect(() =>
      builder.buildBlendedQuery({
        ...baseContext,
        limit: 100,
      })
    ).toThrow(NotImplementedException);
  });

  it('throws NotImplemented on pre-join filters (slices)', () => {
    expect(() =>
      builder.buildBlendedQuery({
        ...baseContext,
        filters: [
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      })
    ).toThrow(NotImplementedException);
  });
});
