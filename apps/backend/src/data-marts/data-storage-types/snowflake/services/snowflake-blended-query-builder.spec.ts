import { Test, TestingModule } from '@nestjs/testing';
import { NotImplementedException } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { SnowflakeBlendedQueryBuilder } from './snowflake-blended-query-builder';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';

const buildContext = createBuildContext('mydb."myschema"."customers"');

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

  it("uses LISTAGG(CAST(field AS VARCHAR), ', ') for STRING_AGG aggregation", () => {
    const chain = makeChain({
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
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_names']));

    expect(sql).toContain("LISTAGG(CAST(order_name AS VARCHAR), ', ') AS order_names");
    expect(sql).not.toContain('STRING_AGG');
    expect(sql).not.toContain('ARRAY_JOIN');
    expect(sql).not.toContain('COLLECT_LIST');
  });

  it('uses COUNT(DISTINCT field) for COUNT_DISTINCT aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: 'mydb."myschema"."orders"',
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

  it('uses " (double-quote) quoting for identifiers', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: "Product's",
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
      }),
      targetTableReference: 'mydb."myschema"."products"',
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

    expect(sql).toContain('"Product\'s_raw" AS (');
    expect(sql).toContain('"Product\'s" AS (');
    // Double-quotes, not backticks
    expect(sql).not.toMatch(/`Product's`/);
  });

  it('uses COUNT function correctly', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
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
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_count']));

    expect(sql).toContain('COUNT(order_id) AS order_count');
  });
});

describe('SnowflakeBlendedQueryBuilder — output controls guard', () => {
  const builder = new SnowflakeBlendedQueryBuilder();
  const baseContext: BlendedQueryContext = {
    mainTableReference: 'mydb."myschema"."customers"',
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
