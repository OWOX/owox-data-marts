import { Test, TestingModule } from '@nestjs/testing';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { AthenaBlendedQueryBuilder } from './athena-blended-query-builder';
import { AthenaClauseRenderer } from './athena-clause-renderer';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';

const buildContext = createBuildContext('"mydb"."customers"');

describe('AthenaBlendedQueryBuilder', () => {
  let builder: AthenaBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthenaBlendedQueryBuilder, AthenaClauseRenderer],
    }).compile();

    builder = module.get(AthenaBlendedQueryBuilder);
  });

  it('should have type AWS_ATHENA', () => {
    expect(builder.type).toBe(DataStorageType.AWS_ATHENA);
  });

  it("uses ARRAY_JOIN(ARRAY_AGG(CAST(field AS VARCHAR)), ', ') for STRING_AGG aggregation", () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '"mydb"."orders"',
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
      "ARRAY_JOIN(ARRAY_AGG(CAST(order_name AS VARCHAR)), ', ') AS order_names"
    );
    expect(sql).not.toContain('STRING_AGG');
    expect(sql).not.toContain('LISTAGG');
    expect(sql).not.toContain('COLLECT_LIST');
  });

  it('uses COUNT(DISTINCT field) for COUNT_DISTINCT aggregation', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '"mydb"."orders"',
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
      targetTableReference: '"mydb"."products"',
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
      targetTableReference: '"mydb"."orders"',
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

  // Trino does not guarantee ANY_VALUE across engine versions; the leaf rollup must use arbitrary().
  it('uses arbitrary(field) for ANY_VALUE leaf aggregation (not ANY_VALUE)', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: '"mydb"."orders"',
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

    expect(sql).toContain('arbitrary(order_name) AS sample_name');
    expect(sql).not.toContain('ANY_VALUE');
  });
});

describe('AthenaBlendedQueryBuilder — output controls', () => {
  let builder: AthenaBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AthenaBlendedQueryBuilder, AthenaClauseRenderer],
    }).compile();
    builder = module.get(AthenaBlendedQueryBuilder);
  });

  function ctx(over: Partial<BlendedQueryContext>): BlendedQueryContext {
    return {
      mainTableReference: '"mydb"."customers"',
      mainDataMartTitle: 'M',
      mainDataMartUrl: 'http://x',
      chains: [],
      columns: ['a'],
      ...over,
    };
  }

  it('renders post-join WHERE with positional ?', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({ filters: [{ column: 'a', operator: 'eq', value: 1 }] })
    );
    expect(sql).toContain('WHERE main.a = ?');
    expect(params.map(p => p.value)).toEqual([1]);
  });

  it('renders ORDER BY and LIMIT', () => {
    const { sql } = builder.buildBlendedQuery(
      ctx({ sort: [{ column: 'a', direction: 'desc' }], limit: 10 })
    );
    expect(sql).toContain('ORDER BY\n  main.a DESC');
    expect(sql).toContain('LIMIT 10');
  });

  it('post-join filter on a column NOT in context.columns still appears in WHERE', () => {
    // "hidden_metric" is used as a filter target but is absent from context.columns.
    // The abstract builder adds postJoin filter columns to referencedColumns so
    // the main CTE fetches the column, and the final WHERE references it.
    const { sql, params } = builder.buildBlendedQuery(
      ctx({
        columns: ['a'],
        filters: [{ column: 'hidden_metric', operator: 'gt', value: 0, placement: 'post-join' }],
      })
    );
    // The final outer WHERE must reference the filter column via the main qualifier
    expect(sql).toContain('WHERE main.hidden_metric > ?');
    expect(params.map(p => p.value)).toEqual([0]);
    // The final outer SELECT (after FROM main) must not project hidden_metric;
    // only the explicitly requested column 'a' should appear there.
    const outerSelectMatch = sql.match(/\nSELECT\n([\s\S]*?)\nFROM main/);
    const outerSelect = outerSelectMatch?.[1] ?? '';
    expect(outerSelect).toContain('main.a');
    expect(outerSelect).not.toContain('hidden_metric');
  });

  it('multiple post-join filters combine with AND in correct param order', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({
        columns: ['a'],
        filters: [
          { column: 'a', operator: 'eq', value: 'x', placement: 'post-join' },
          { column: 'a', operator: 'neq', value: 'y', placement: 'post-join' },
        ],
      })
    );
    expect(sql).toContain('WHERE main.a = ?\n  AND (main.a IS NULL OR main.a <> ?)');
    expect(params.map(p => p.value)).toEqual(['x', 'y']);
  });

  it('positional params come out in textual order: pre-join (CTE) before post-join', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
      }),
      targetTableReference: '"mydb"."users"',
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
    const { params } = builder.buildBlendedQuery(
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
          { column: 'a', operator: 'eq', value: 'post', placement: 'post-join' },
        ],
        fieldIndex,
      })
    );
    // pre-join value first (lives inside the users_raw CTE), post-join value last.
    expect(params.map(p => p.value)).toEqual(['admin', 'post']);
  });

  it('casts a post-join date filter placeholder via columnTypes.postJoin', () => {
    const { sql, params } = builder.buildBlendedQuery(
      ctx({
        columns: ['a'],
        filters: [
          { column: 'created_at', operator: 'gte', value: '2024-01-01', placement: 'post-join' },
        ],
        columnTypes: { postJoin: new Map([['created_at', 'TIMESTAMP']]) },
      })
    );
    expect(sql).toContain('WHERE main.created_at >= CAST(? AS TIMESTAMP)');
    expect(params.map(p => p.value)).toEqual(['2024-01-01']);
  });

  it('casts a pre-join date slice placeholder inside the subsidiary CTE', () => {
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
      }),
      targetTableReference: '"mydb"."users"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'signup_date',
          outputAlias: 'signup',
          isHidden: true,
          aggregateFunction: 'MAX',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'users__signup_date',
          aliasPath: 'users',
          originalFieldName: 'signup_date',
          type: 'DATE',
        },
      ],
      availableSources: [{ aliasPath: 'users', isIncluded: true }],
    } as never);
    const { sql, params } = builder.buildBlendedQuery(
      ctx({
        chains: [chain],
        columns: ['a'],
        filters: [
          {
            column: 'users__signup_date',
            operator: 'gte',
            value: '2024-01-01',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
      })
    );
    expect(sql).toContain('signup_date >= CAST(? AS DATE)');
    expect(params.map(p => p.value)).toEqual(['2024-01-01']);
  });

  it('casts a pre-join date slice by the RAW sourceFieldType even when the dedup effective type is INTEGER', () => {
    // The joined `signup_date` is deduped COUNT_DISTINCT, so its effective `type` is INTEGER,
    // but the pre-join slice runs on the raw DATE column BEFORE dedup — the cast must follow the
    // RAW sourceFieldType (DATE), not the effective INTEGER (which would drop the date cast).
    const chain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
      }),
      targetTableReference: '"mydb"."users"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'signup_date',
          outputAlias: 'signup',
          isHidden: true,
          aggregateFunction: 'COUNT_DISTINCT',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'users__signup_date',
          aliasPath: 'users',
          originalFieldName: 'signup_date',
          type: 'INTEGER',
          sourceFieldType: 'DATE',
        },
      ],
      availableSources: [{ aliasPath: 'users', isIncluded: true }],
    } as never);
    const { sql, params } = builder.buildBlendedQuery(
      ctx({
        chains: [chain],
        columns: ['a'],
        filters: [
          {
            column: 'users__signup_date',
            operator: 'gte',
            value: '2024-01-01',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
      })
    );
    expect(sql).toContain('signup_date >= CAST(? AS DATE)');
    expect(params.map(p => p.value)).toEqual(['2024-01-01']);
  });
});
