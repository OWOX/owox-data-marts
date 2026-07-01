import { Test, TestingModule } from '@nestjs/testing';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { RedshiftBlendedQueryBuilder } from './redshift-blended-query-builder';
import { RedshiftClauseRenderer } from './redshift-clause-renderer';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';

const buildContext = createBuildContext('"myschema"."customers"');

describe('RedshiftBlendedQueryBuilder', () => {
  let builder: RedshiftBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedshiftBlendedQueryBuilder, RedshiftClauseRenderer],
    }).compile();

    builder = module.get(RedshiftBlendedQueryBuilder);
  });

  it('should have type AWS_REDSHIFT', () => {
    expect(builder.type).toBe(DataStorageType.AWS_REDSHIFT);
  });

  it("uses LISTAGG(CAST(field AS VARCHAR), ', ') for STRING_AGG aggregation", () => {
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

    const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_names']));

    expect(sql).toContain(
      "LISTAGG(CAST(order_name AS VARCHAR), ', ') WITHIN GROUP (ORDER BY order_name) AS order_names"
    );
    expect(sql).not.toContain('STRING_AGG');
    expect(sql).not.toContain('ARRAY_JOIN');
    expect(sql).not.toContain('COLLECT_LIST');
  });

  it('uses COUNT(DISTINCT field) for COUNT_DISTINCT aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '"myschema"."orders"',
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
      targetTableReference: '"myschema"."products"',
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
      targetTableReference: '"myschema"."orders"',
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

describe('RedshiftBlendedQueryBuilder — output controls', () => {
  let builder: RedshiftBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedshiftBlendedQueryBuilder, RedshiftClauseRenderer],
    }).compile();
    builder = module.get(RedshiftBlendedQueryBuilder);
  });

  function ctx(over: Partial<BlendedQueryContext>): BlendedQueryContext {
    return {
      mainTableReference: '"myschema"."customers"',
      mainDataMartTitle: 'M',
      mainDataMartUrl: 'http://x',
      chains: [],
      columns: ['a'],
      ...over,
    };
  }

  it('applies a post-join filter as an inlined literal predicate with no params (implicit placement defaults to post-join)', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({ filters: [{ column: 'a', operator: 'eq', value: 1 }] })
    );
    expect(sql).toContain('WHERE main.a = 1');
    expect(params).toEqual([]);
  });

  it('inlines a pre-join slice filter as a literal inside the subsidiary raw CTE with no params', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
      }),
      targetTableReference: '"myschema"."users"',
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
    // Verify structural ordering: "users_raw AS (" comes before "role = 'admin'",
    // which itself comes before the outer SELECT (proving it's in the raw CTE, not outer WHERE).
    const rawCteStart = sql.indexOf('users_raw AS (');
    const predicatePos = sql.indexOf("role = 'admin'");
    const outerSelectPos = sql.lastIndexOf('\nSELECT\n');
    expect(rawCteStart).toBeGreaterThanOrEqual(0);
    expect(predicatePos).toBeGreaterThan(rawCteStart);
    expect(predicatePos).toBeLessThan(outerSelectPos);
    // The outer WHERE must not reference the pre-join column
    expect(sql).not.toContain('WHERE main.role');
    // Redshift uses inlined literals — no bound params
    expect(params).toEqual([]);
  });

  it('renders ORDER BY and LIMIT', () => {
    const { sql } = builder.buildBlendedQuery(
      ctx({ sort: [{ column: 'a', direction: 'desc' }], limit: 10 })
    );
    expect(sql).toContain('ORDER BY\n  main.a DESC');
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
    expect(sql).toContain("WHERE main.a = 'x'\n  AND main.a <> 'y'");
    expect(params).toEqual([]);
  });
});
