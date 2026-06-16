import { Test, TestingModule } from '@nestjs/testing';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { SnowflakeBlendedQueryBuilder } from './snowflake-blended-query-builder';
import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';

const buildContext = createBuildContext('mydb."myschema"."customers"');

describe('SnowflakeBlendedQueryBuilder', () => {
  let builder: SnowflakeBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SnowflakeBlendedQueryBuilder, SnowflakeClauseRenderer],
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

    expect(sql).toContain(
      'LISTAGG(CAST("order_name" AS VARCHAR), \', \') WITHIN GROUP (ORDER BY "order_name") AS "order_names"'
    );
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

    expect(sql).toContain('COUNT(DISTINCT "customer_id") AS "unique_customers"');
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

  it('always quotes simple lowercase identifiers (Snowflake folds unquoted to UPPERCASE)', () => {
    // The base builder returns simple names bare — safe for lowercase-folding engines but
    // NOT Snowflake: a bare `campaign_id` resolves to CAMPAIGN_ID and misses the lowercase
    // column the OWOX connector creates (as quoted) → "invalid identifier".
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: 'mydb."myschema"."orders"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'campaign_id',
          outputAlias: 'campaign_ids',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['campaign_ids']));

    expect(sql).toContain('LISTAGG(CAST("campaign_id" AS VARCHAR)');
    expect(sql).toContain('AS "campaign_ids"');
    expect(sql).not.toContain('CAST(campaign_id AS'); // never bare
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

    expect(sql).toContain('COUNT("order_id") AS "order_count"');
  });
});

describe('SnowflakeBlendedQueryBuilder — output controls', () => {
  let builder: SnowflakeBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SnowflakeBlendedQueryBuilder, SnowflakeClauseRenderer],
    }).compile();
    builder = module.get(SnowflakeBlendedQueryBuilder);
  });

  function ctx(over: Partial<BlendedQueryContext>): BlendedQueryContext {
    return {
      mainTableReference: 'mydb."myschema"."customers"',
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
    expect(sql).toContain('WHERE "main"."a" = 1');
    expect(params).toEqual([]);
  });

  it('quotes the main CTE alias consistently in its definition AND references', () => {
    // Snowflake folds a bare `main` to MAIN, which cannot resolve the lowercase-quoted
    // "main" CTE. The definition (always quoted) and every reference (FROM / qualifier)
    // must use the same "main" form, or blended OC reports fail at runtime.
    const { sql } = builder.buildBlendedQuery(
      ctx({ filters: [{ column: 'a', operator: 'eq', value: 1 }] })
    );
    expect(sql).toContain('"main" AS (');
    expect(sql).toContain('FROM "main"');
    expect(sql).not.toContain('FROM main');
  });

  it('uses CONTAINS for string contains operator (no ? / @p placeholders)', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({ filters: [{ column: 'status', operator: 'contains', value: 'active' }] })
    );
    expect(sql).toContain('CONTAINS("main"."status", \'active\')');
    expect(sql).not.toMatch(/[?]|@p\d/);
    expect(params).toEqual([]);
  });

  it('renders ORDER BY and LIMIT', () => {
    const { sql } = builder.buildBlendedQuery(
      ctx({ sort: [{ column: 'a', direction: 'desc' }], limit: 10 })
    );
    expect(sql).toContain('ORDER BY "main"."a" DESC');
    expect(sql).toContain('LIMIT 10');
  });

  it('multiple post-join filters combine with AND (inlined, no params)', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({
        columns: ['a'],
        filters: [
          { column: 'a', operator: 'eq', value: 'x', placement: 'post-join' },
          { column: 'a', operator: 'neq', value: 'y', placement: 'post-join' },
        ],
      })
    );
    expect(sql).toContain('WHERE "main"."a" = \'x\' AND "main"."a" <> \'y\'');
    expect(params).toEqual([]);
  });

  it('inlines a pre-join slice filter as a literal inside the subsidiary raw CTE with no params', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
      }),
      targetTableReference: 'mydb."myschema"."users"',
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
    // The inlined literal predicate must appear inside the subsidiary raw CTE.
    const rawCteStart = sql.indexOf('"users_raw" AS (');
    const predicatePos = sql.indexOf('"role" = \'admin\'');
    const outerSelectPos = sql.lastIndexOf('\nSELECT\n');
    expect(rawCteStart).toBeGreaterThanOrEqual(0);
    expect(predicatePos).toBeGreaterThan(rawCteStart);
    expect(predicatePos).toBeLessThan(outerSelectPos);
    // The outer WHERE must not reference the pre-join column
    expect(sql).not.toContain('"main"."role"');
    // Snowflake uses inlined literals — no bound params
    expect(params).toEqual([]);
  });
});
