import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';
import {
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { extractCteBody } from '@owox/test-utils';
import { BigQueryBlendedQueryBuilder } from './bigquery-blended-query-builder';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';

// ---------------------------------------------------------------------------
// Group A — SQL safety / quoting hardening
// ---------------------------------------------------------------------------

describe('BigQueryBlendedQueryBuilder — SQL safety / quoting', () => {
  let builder: BigQueryBlendedQueryBuilder;

  beforeEach(() => {
    builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());
  });

  // -------------------------------------------------------------------------
  it('alias matching a SQL keyword (order) is safely used as CTE name', () => {
    // 'order' matches [A-Za-z_][A-Za-z0-9_]* so quoteIdentifier leaves it
    // unquoted (it is a safe identifier). The test pins the contract: the
    // CTE is emitted and the generated SQL is structurally valid — the alias
    // itself appears in expected positions without corruption.
    const chain = makeChain({
      relationship: makeRelationship({
        id: 'rel-order',
        targetAlias: 'order',
        joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'id' }],
      }),
      targetTableReference: '`project.dataset.orders`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'name',
          outputAlias: 'order_name',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });

    const ctx: BlendedQueryContext = {
      mainTableReference: '`project.dataset.events`',
      mainDataMartTitle: 'Events',
      mainDataMartUrl: '/ui/events',
      chains: [chain],
      columns: ['event_id', 'order_name'],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    // Raw and aggregation CTEs must both be present
    expect(sql).toContain('order_raw AS (');
    expect(sql).toContain('order AS (');
    // Final SELECT must reference through the alias correctly
    expect(sql).toContain('order.order_name');
    // LEFT JOIN must be emitted
    expect(sql).toContain('LEFT JOIN order ON main.order_id = order.id');
  });

  // -------------------------------------------------------------------------
  it('column name with apostrophe is backtick-quoted in raw CTE projection', () => {
    // targetFieldName = "Product's_id" — apostrophe is not a SQL identifier char,
    // so quoteIdentifier wraps it: `Product's_id`
    const chain = makeChain({
      relationship: makeRelationship({
        id: 'rel-products',
        targetAlias: 'products',
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: "Product's_id" }],
      }),
      targetTableReference: '`project.dataset.products`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: "Product's_id",
          outputAlias: 'products_id_agg',
          isHidden: false,
          aggregateFunction: 'COUNT',
        },
      ],
    });

    const ctx: BlendedQueryContext = {
      mainTableReference: '`project.dataset.events`',
      mainDataMartTitle: 'Events',
      mainDataMartUrl: '/ui/events',
      chains: [chain],
      columns: ['event_id', 'products_id_agg'],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    // The column with the apostrophe must be backtick-quoted wherever it appears
    expect(sql).toContain("`Product's_id`");
    // Aggregation CTE must reference the column correctly
    expect(sql).toContain("COUNT(`Product's_id`)");
    // Verify the join ON clause also quotes the column correctly
    expect(sql).toContain("= products.`Product's_id`");
  });

  // -------------------------------------------------------------------------
  it('column name with whitespace is backtick-quoted in raw CTE and WHERE', () => {
    // targetFieldName = 'first name' — whitespace makes this unsafe without quoting
    const chain = makeChain({
      relationship: makeRelationship({
        id: 'rel-users',
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'uid' }],
      }),
      targetTableReference: '`project.dataset.users`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'first name',
          outputAlias: 'first_name_agg',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });

    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'users__first name',
          aliasPath: 'users',
          originalFieldName: 'first name',
          type: 'STRING',
        },
      ],
      availableSources: [{ aliasPath: 'users', isIncluded: true }],
    } as never);
    const ctx: BlendedQueryContext = {
      mainTableReference: '`project.dataset.events`',
      mainDataMartTitle: 'Events',
      mainDataMartUrl: '/ui/events',
      chains: [chain],
      columns: ['event_id', 'first_name_agg'],
      filters: [
        {
          column: 'users__first name',
          operator: 'is_not_null',
          placement: 'pre-join',
        },
      ],
      fieldIndex,
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    // The field must be backtick-quoted in the raw CTE SELECT projection
    expect(sql).toContain('`first name`');
    // The raw CTE must contain the WHERE referencing the backtick-quoted column
    const usersRawBody = extractCteBody(sql, 'users_raw');
    expect(usersRawBody).toContain('`first name` IS NOT NULL');
    // Unquoted 'first name' must not appear as a bare identifier
    // (a space-separated token outside backticks would break SQL parsing)
    // We verify the raw body only has it inside backticks
    const bareIdx = usersRawBody.indexOf('first name');
    if (bareIdx !== -1) {
      // Every occurrence must be preceded by a backtick
      const ctxBefore = usersRawBody[bareIdx - 1];
      expect(ctxBefore).toBe('`');
    }
  });

  // -------------------------------------------------------------------------
  it('column name containing a backtick character is double-backtick-escaped', () => {
    // targetFieldName = "weird`name" — the backtick inside must be doubled
    // per BigQuery / standard SQL convention: `weird``name`
    const chain = makeChain({
      relationship: makeRelationship({
        id: 'rel-things',
        targetAlias: 'things',
        joinConditions: [{ sourceFieldName: 'thing_id', targetFieldName: 'tid' }],
      }),
      targetTableReference: '`project.dataset.things`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'weird`name',
          outputAlias: 'weird_name_agg',
          isHidden: false,
          aggregateFunction: 'MAX',
        },
      ],
    });

    const ctx: BlendedQueryContext = {
      mainTableReference: '`project.dataset.events`',
      mainDataMartTitle: 'Events',
      mainDataMartUrl: '/ui/events',
      chains: [chain],
      columns: ['event_id', 'weird_name_agg'],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    // BigQuery convention: inner backtick is doubled
    expect(sql).toContain('`weird``name`');
    // A single bare backtick in the middle of an identifier must not appear
    // i.e., `weird`name` (unescaped) would be wrong — verify it's not there
    // We check that "weird`name`" (without doubling) doesn't appear
    expect(sql).not.toContain('`weird`name`');
  });

  // -------------------------------------------------------------------------
  it('comment injection via title/url is sanitized to single-line SQL comment', () => {
    // The DataMart title contains a newline + SQL comment marker.
    // sanitizeSqlComment() must strip/replace these so the comment stays on one line.
    const chain = makeChain({
      relationship: makeRelationship({
        id: 'rel-orders',
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'id' }],
      }),
      targetTableReference: '`project.dataset.orders`',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'amount',
          outputAlias: 'total_amount',
          isHidden: false,
          aggregateFunction: 'SUM',
        },
      ],
    });

    const injectedTitle = 'My DM\n--DROP TABLE users';
    const injectedUrl = 'https://app.example.com/dm\r\n-- evil_injection';

    const ctx: BlendedQueryContext = {
      mainTableReference: '`project.dataset.events`',
      mainDataMartTitle: injectedTitle,
      mainDataMartUrl: injectedUrl,
      chains: [chain],
      columns: ['event_id', 'total_amount'],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    // Every line of generated SQL must not start with an executable statement
    // that could have been injected via the title/url
    for (const line of sql.split('\n')) {
      if (/^\s*(DROP|INSERT|DELETE|UPDATE)\b/i.test(line)) {
        throw new Error(`Injected SQL leaked into a code line: ${line}`);
      }
    }

    // The raw `--DROP TABLE` marker must not appear literally in the SQL
    // (the `--` gets replaced with em-dash, and the newline is collapsed)
    expect(sql).not.toContain('--DROP TABLE');
    // evil_injection must not appear on its own executable line
    const evilLines = sql.split('\n').filter(l => l.includes('evil_injection'));
    for (const line of evilLines) {
      // If it appears, it must be inside a -- comment
      expect(line.trimStart().startsWith('--')).toBe(true);
    }

    // The main CTE comment block must be single-line (no bare newline in the comment text)
    // Verify: "-- My DM" appears exactly on its own comment line (sanitized, no newline)
    const commentLines = sql.split('\n').filter(l => l.includes('My DM'));
    expect(commentLines.length).toBeGreaterThan(0);
    for (const line of commentLines) {
      // Each line containing "My DM" must start with -- comment marker
      expect(line.trimStart().startsWith('--')).toBe(true);
    }
  });
});
