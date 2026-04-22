import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { BlendedQueryContext, ResolvedRelationshipChain } from './blended-query-builder.interface';
import { AbstractBlendedQueryBuilder } from './abstract-blended-query-builder';

/**
 * Minimal concrete implementation for testing the abstract base class.
 * Uses backtick quoting and a simple STRING_AGG syntax (no CAST) so that
 * existing SQL-shape assertions stay readable — dialect-specific CASTs are
 * covered by the per-dialect builder specs.
 */
class TestBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  protected get identifierQuoteChar() {
    return '`';
  }
  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(${fieldName})`;
  }
}

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

function makeChain(
  partial: Omit<ResolvedRelationshipChain, 'targetDataMartTitle' | 'targetDataMartUrl'>
): ResolvedRelationshipChain {
  return {
    ...partial,
    targetDataMartTitle: 'Test Subsidiary',
    targetDataMartUrl: '/ui/proj/data-marts/sub-1/data-setup',
  };
}

function buildContext(chains: ResolvedRelationshipChain[], columns: string[]): BlendedQueryContext {
  return {
    mainTableReference: 'main_table',
    mainDataMartTitle: 'Test Main',
    mainDataMartUrl: '/ui/proj/data-marts/main-1/data-setup',
    chains,
    columns,
  };
}

describe('AbstractBlendedQueryBuilder', () => {
  let builder: TestBlendedQueryBuilder;

  beforeEach(() => {
    builder = new TestBlendedQueryBuilder();
  });

  describe('CTE structure', () => {
    it('starts with WITH and contains main CTE', () => {
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: 'orders_table',
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

      const sql = builder.buildBlendedQuery(
        buildContext([chain], ['customer_name', 'order_names'])
      );

      expect(sql.trimStart().startsWith('WITH')).toBe(true);
      expect(sql).toContain('main AS (');
      expect(sql).toContain('orders_raw AS (');
      expect(sql).toContain('orders AS (');
      expect(sql).toContain('FROM orders_raw');
      expect(sql).toContain('GROUP BY customer_id');
    });

    it('includes SQL comments with data mart title and URL above each raw CTE', () => {
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: 'orders_table',
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

      const sql = builder.buildBlendedQuery({
        mainTableReference: 'customers_table',
        mainDataMartTitle: 'Customers DM',
        mainDataMartUrl: 'https://app.example.com/dm-main',
        chains: [chain],
        columns: ['order_names'],
      });

      expect(sql).toContain('-- Customers DM');
      expect(sql).toContain('-- https://app.example.com/dm-main');
      expect(sql).toContain('-- Test Subsidiary');
      expect(sql).toContain('-- /ui/proj/data-marts/sub-1/data-setup');
    });

    it('sanitizes newlines and comment markers in title/url to prevent SQL injection', () => {
      const chain: ResolvedRelationshipChain = {
        ...makeChain({
          relationship: makeRelationship(),
          targetTableReference: 'orders_table',
          parentAlias: 'main',
          blendedFields: [
            {
              targetFieldName: 'order_name',
              outputAlias: 'order_names',
              isHidden: false,
              aggregateFunction: 'STRING_AGG',
            },
          ],
        }),
        targetDataMartTitle: 'Orders\n DROP TABLE secrets; --',
        targetDataMartUrl: 'https://app/\r\nSELECT 1',
      };

      const sql = builder.buildBlendedQuery({
        mainTableReference: 'customers_table',
        mainDataMartTitle: 'Customers\nSELECT 1; --',
        mainDataMartUrl: 'https://app\r\n--evil',
        chains: [chain],
        columns: ['order_names'],
      });

      for (const line of sql.split('\n')) {
        if (/^\s*(DROP|INSERT|DELETE|UPDATE|SELECT 1)/i.test(line)) {
          throw new Error(`Injected SQL leaked into a code line: ${line}`);
        }
      }
      const dropLines = sql.split('\n').filter(l => l.includes('DROP TABLE'));
      for (const line of dropLines) {
        expect(line.trimStart().startsWith('--')).toBe(true);
      }
    });

    it('places raw CTE before aggregation CTE within each subtree', () => {
      const chain1 = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'orders_table',
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
      const chain2 = makeChain({
        relationship: makeRelationship({
          id: 'rel-2',
          targetAlias: 'payments',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'payer_id' }],
        }),
        targetTableReference: 'payments_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'total_amount',
            isHidden: false,
            aggregateFunction: 'MAX',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([chain1, chain2], ['customer_name', 'order_names', 'total_amount'])
      );

      const ordersRawPos = sql.indexOf('orders_raw AS (');
      const ordersAggPos = sql.indexOf('\n  orders AS (');
      expect(ordersRawPos).toBeLessThan(ordersAggPos);

      const paymentsRawPos = sql.indexOf('payments_raw AS (');
      const paymentsAggPos = sql.indexOf('\n  payments AS (');
      expect(paymentsRawPos).toBeLessThan(paymentsAggPos);
    });

    it('separates CTEs with a blank line', () => {
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: 'orders_table',
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

      const sql = builder.buildBlendedQuery(buildContext([chain], ['order_names']));
      expect(sql).toContain('),\n\n');
    });
  });

  describe('multiple subsidiaries', () => {
    it('generates multiple LEFT JOINs for root-level chains', () => {
      const chain1 = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'orders_table',
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
      const chain2 = makeChain({
        relationship: makeRelationship({
          id: 'rel-2',
          targetAlias: 'payments',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'payer_id' }],
        }),
        targetTableReference: 'payments_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'total_amount',
            isHidden: false,
            aggregateFunction: 'MAX',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([chain1, chain2], ['customer_name', 'order_names', 'total_amount'])
      );

      expect(sql).toContain('ON main.id = orders.customer_id');
      expect(sql).toContain('ON main.id = payments.payer_id');
      expect(sql).toContain('MAX(amount) AS total_amount');
    });
  });

  describe('multi-key join', () => {
    it('generates AND in ON clause for multiple join keys', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'events',
          joinConditions: [
            { sourceFieldName: 'project_id', targetFieldName: 'evt_project_id' },
            { sourceFieldName: 'user_id', targetFieldName: 'evt_user_id' },
          ],
        }),
        targetTableReference: 'events_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'event_name',
            outputAlias: 'event_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(buildContext([chain], ['event_names']));

      expect(sql).toContain(
        'ON main.project_id = events.evt_project_id AND main.user_id = events.evt_user_id'
      );
      expect(sql).toContain('GROUP BY evt_project_id, evt_user_id');
    });
  });

  describe('column selection', () => {
    it('includes only specified columns in SELECT', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'orders_table',
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
      });

      const sql = builder.buildBlendedQuery(
        buildContext([chain], ['customer_name', 'order_names'])
      );

      expect(sql).toContain('orders.order_names');
      expect(sql).not.toContain('orders.total_revenue');
      expect(sql).toContain('SUM(revenue) AS total_revenue');
    });
  });

  describe('identifier quoting', () => {
    it('quotes unsafe identifiers and leaves safe ones unquoted', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: "Product's",
          joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
        }),
        targetTableReference: 'products_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'product_name',
            outputAlias: "Product's__product_name",
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([chain], ['campaign_name', "Product's__product_name"])
      );

      expect(sql).toContain("`Product's_raw` AS (");
      expect(sql).toContain("`Product's` AS (");
      expect(sql).toContain("`Product's`.`Product's__product_name`");
      expect(sql).toContain("LEFT JOIN `Product's` ON main.product_id = `Product's`.product_id");
      expect(sql).toContain('main.campaign_name');
      expect(sql).not.toContain('`main`');
    });

    it('quotes column names with special characters in joinConditions', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: "user's_id", targetFieldName: "owner's_id" }],
        }),
        targetTableReference: 'orders_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: "order's_name",
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(buildContext([chain], ['order_names']));

      expect(sql).toContain("LEFT JOIN orders ON main.`user's_id` = orders.`owner's_id`");
      expect(sql).toContain("GROUP BY `owner's_id`");
    });
  });

  describe('explicit raw CTE projection', () => {
    it('main raw CTE projects only requested native columns + join keys', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'cust_id' }],
        }),
        targetTableReference: 'orders_table',
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

      const sql = builder.buildBlendedQuery(
        buildContext([chain], ['customer_name', 'order_names'])
      );

      expect(sql).not.toContain('SELECT *');
      expect(sql).toMatch(/main AS \(\s*SELECT\s+customer_id,\s+customer_name\s+FROM main_table/);
      expect(sql).toMatch(/orders_raw AS \(\s*SELECT\s+cust_id,\s+order_name\s+FROM orders_table/);
    });

    it('intermediate raw CTE includes join keys for downstream chain', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'b',
          joinConditions: [{ sourceFieldName: 'b_id', targetFieldName: 'b_id' }],
        }),
        targetTableReference: 'b_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'c',
          joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
        }),
        targetTableReference: 'c_table',
        parentAlias: 'b',
        blendedFields: [
          {
            targetFieldName: 'product_name',
            outputAlias: 'b_c__product_name',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([ab, bc], ['campaign_id', 'b_c__product_name'])
      );

      expect(sql).not.toContain('SELECT *');
      expect(sql).toMatch(/b_raw AS \(\s*SELECT\s+b_id,\s+product_id\s+FROM b_table/);
    });

    it('deduplicates and sorts projected columns for stable SQL output', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [
            { sourceFieldName: 'customer_id', targetFieldName: 'cust_id' },
            { sourceFieldName: 'project_id', targetFieldName: 'proj_id' },
          ],
        }),
        targetTableReference: 'orders_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'cust_id',
            outputAlias: 'count_cust',
            isHidden: false,
            aggregateFunction: 'COUNT',
          },
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(buildContext([chain], ['order_names', 'count_cust']));

      expect(sql).toMatch(
        /orders_raw AS \(\s*SELECT\s+cust_id,\s+order_name,\s+proj_id\s+FROM orders_table/
      );
    });

    it('falls back to SELECT * when a field uses dot-notation (nested struct)', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'events',
          joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user.id' }],
        }),
        targetTableReference: 'events_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'event_name',
            outputAlias: 'event_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([chain], ['customer_name', 'event_names'])
      );

      expect(sql).toContain('events_raw AS (\n    SELECT * FROM events_table');
    });
  });

  describe('hidden fields', () => {
    it('hidden fields are excluded from SELECT but available in the aggregation CTE', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'orders_table',
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
      });

      const sql = builder.buildBlendedQuery(
        buildContext([chain], ['customer_name', 'order_names', 'hidden_flag'])
      );

      expect(sql).toContain('main.hidden_flag');
      expect(sql).toContain('MAX(internal_flag) AS hidden_flag');
    });
  });

  describe('bottom-up blending', () => {
    it('intermediate node uses _joined CTE and groups by parent key only', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'b',
          joinConditions: [{ sourceFieldName: 'b_id', targetFieldName: 'b_id' }],
        }),
        targetTableReference: 'b_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'c',
          joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
        }),
        targetTableReference: 'c_table',
        parentAlias: 'b',
        blendedFields: [
          {
            targetFieldName: 'product_name',
            outputAlias: 'b_c__product_name',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([ab, bc], ['campaign_id', 'b_c__product_name'])
      );

      // C (leaf) aggregation
      expect(sql).toContain('c AS (');
      expect(sql).toContain('FROM c_raw');

      // B has _joined CTE that LEFT JOINs with aggregated C
      expect(sql).toContain('b_joined AS (');
      expect(sql).toContain('LEFT JOIN c ON b_raw.product_id = c.product_id');

      // B aggregation reads from b_joined and groups by b_id ONLY
      expect(sql).toMatch(
        /\n {2}b AS \(\s*SELECT\s+b_id,[\s\S]*?FROM b_joined\s+GROUP BY b_id\s+\)/
      );

      // Final JOIN only to B, not C
      expect(sql).toContain('LEFT JOIN b ON main.b_id = b.b_id');
      const finalSection = sql.split('FROM main\n')[1];
      expect(finalSection).not.toContain('LEFT JOIN c ON');

      // b_c__product_name surfaced through B
      expect(sql).toContain('b.b_c__product_name');
    });

    it('shared join key between parent and child is handled correctly', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'b',
          joinConditions: [{ sourceFieldName: 'shared_id', targetFieldName: 'shared_id' }],
        }),
        targetTableReference: 'b_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'c',
          joinConditions: [{ sourceFieldName: 'shared_id', targetFieldName: 'shared_id' }],
        }),
        targetTableReference: 'c_table',
        parentAlias: 'b',
        blendedFields: [
          {
            targetFieldName: 'val',
            outputAlias: 'c_val',
            isHidden: false,
            aggregateFunction: 'MAX',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(buildContext([ab, bc], ['campaign_id', 'c_val']));

      expect(sql).toMatch(
        /\n {2}b AS \(\s*SELECT\s+shared_id,\s+MAX\(c_val\) AS c_val\s+FROM b_joined\s+GROUP BY shared_id\s+\)/
      );
      expect(sql).toMatch(
        /\n {2}c AS \(\s*SELECT\s+shared_id,\s+MAX\(val\) AS c_val\s+FROM c_raw\s+GROUP BY shared_id\s+\)/
      );
    });

    it('3-level chain: cascading re-aggregation (A→B→C→D)', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'b',
          joinConditions: [{ sourceFieldName: 'a_key', targetFieldName: 'a_key' }],
        }),
        targetTableReference: 'b_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'c',
          joinConditions: [{ sourceFieldName: 'b_key', targetFieldName: 'b_key' }],
        }),
        targetTableReference: 'c_table',
        parentAlias: 'b',
        blendedFields: [],
      });
      const cd = makeChain({
        relationship: makeRelationship({
          id: 'rel-cd',
          targetAlias: 'd',
          joinConditions: [{ sourceFieldName: 'c_key', targetFieldName: 'c_key' }],
        }),
        targetTableReference: 'd_table',
        parentAlias: 'c',
        blendedFields: [
          {
            targetFieldName: 'value',
            outputAlias: 'd_value',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(buildContext([ab, bc, cd], ['col_a', 'd_value']));

      // D (leaf) aggregates by c_key
      expect(sql).toContain('FROM d_raw');
      expect(sql).toContain('GROUP BY c_key');

      // C (intermediate) has _joined CTE with D, aggregates by b_key
      expect(sql).toContain('c_joined AS (');
      expect(sql).toContain('LEFT JOIN d ON c_raw.c_key = d.c_key');
      expect(sql).toMatch(/\n {2}c AS \([\s\S]*?FROM c_joined\s+GROUP BY b_key\s+\)/);

      // B (intermediate) has _joined CTE with C, aggregates by a_key
      expect(sql).toContain('b_joined AS (');
      expect(sql).toContain('LEFT JOIN c ON b_raw.b_key = c.b_key');
      expect(sql).toMatch(/\n {2}b AS \([\s\S]*?FROM b_joined\s+GROUP BY a_key\s+\)/);

      // Final SELECT references only main and b
      expect(sql).toContain('LEFT JOIN b ON main.a_key = b.a_key');
      expect(sql).toContain('b.d_value');
    });

    it('multiple children at one node: _joined CTE has multiple LEFT JOINs', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'campaign_id', targetFieldName: 'campaign_id' }],
        }),
        targetTableReference: 'orders_table',
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
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'products',
          joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
        }),
        targetTableReference: 'products_table',
        parentAlias: 'orders',
        blendedFields: [
          {
            targetFieldName: 'product_name',
            outputAlias: 'product_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });
      const bd = makeChain({
        relationship: makeRelationship({
          id: 'rel-bd',
          targetAlias: 'customers',
          joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'customers_table',
        parentAlias: 'orders',
        blendedFields: [
          {
            targetFieldName: 'customer_name',
            outputAlias: 'customer_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext(
          [ab, bc, bd],
          ['campaign_name', 'order_names', 'product_names', 'customer_names']
        )
      );

      expect(sql).toContain('orders_joined AS (');
      expect(sql).toContain('LEFT JOIN products ON orders_raw.product_id = products.product_id');
      expect(sql).toContain(
        'LEFT JOIN customers ON orders_raw.customer_id = customers.customer_id'
      );

      expect(sql).toMatch(
        /\n {2}orders AS \([\s\S]*?FROM orders_joined\s+GROUP BY campaign_id\s+\)/
      );

      expect(sql).toContain('orders.order_names');
      expect(sql).toContain('orders.product_names');
      expect(sql).toContain('orders.customer_names');

      const finalJoins = sql.split('FROM main\n')[1];
      expect(finalJoins).toContain('LEFT JOIN orders ON');
      expect(finalJoins).not.toContain('LEFT JOIN products ON');
      expect(finalJoins).not.toContain('LEFT JOIN customers ON');
    });

    it('re-aggregation: COUNT becomes SUM at parent level', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'orders_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'items',
          joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
        }),
        targetTableReference: 'items_table',
        parentAlias: 'orders',
        blendedFields: [
          {
            targetFieldName: 'item_id',
            outputAlias: 'item_count',
            isHidden: false,
            aggregateFunction: 'COUNT',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([ab, bc], ['customer_name', 'item_count'])
      );

      expect(sql).toContain('COUNT(item_id) AS item_count');
      expect(sql).toContain('SUM(item_count) AS item_count');
    });

    it('re-aggregation: COUNT_DISTINCT becomes SUM at parent level', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'orders_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'items',
          joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
        }),
        targetTableReference: 'items_table',
        parentAlias: 'orders',
        blendedFields: [
          {
            targetFieldName: 'item_id',
            outputAlias: 'unique_items',
            isHidden: false,
            aggregateFunction: 'COUNT_DISTINCT',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([ab, bc], ['customer_name', 'unique_items'])
      );

      expect(sql).toContain('COUNT(DISTINCT item_id) AS unique_items');
      expect(sql).toContain('SUM(unique_items) AS unique_items');
    });

    it('empty blendedFields on intermediate node: passthrough only', () => {
      const ab = makeChain({
        relationship: makeRelationship({
          id: 'rel-ab',
          targetAlias: 'orders',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
        }),
        targetTableReference: 'orders_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const bc = makeChain({
        relationship: makeRelationship({
          id: 'rel-bc',
          targetAlias: 'items',
          joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
        }),
        targetTableReference: 'items_table',
        parentAlias: 'orders',
        blendedFields: [
          {
            targetFieldName: 'sku',
            outputAlias: 'item_skus',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(buildContext([ab, bc], ['customer_name', 'item_skus']));

      expect(sql).toContain('orders_joined AS (');
      expect(sql).toMatch(
        /\n {2}orders AS \([\s\S]*?FROM orders_joined\s+GROUP BY customer_id\s+\)/
      );
      expect(sql).toContain('STRING_AGG(item_skus) AS item_skus');
      expect(sql).toContain('orders.item_skus');
    });

    it('row-count guarantee: only root-level LEFT JOINs in final FROM clause', () => {
      const chainA = makeChain({
        relationship: makeRelationship({
          id: 'rel-a',
          targetAlias: 'a',
          joinConditions: [{ sourceFieldName: 'a_id', targetFieldName: 'a_id' }],
        }),
        targetTableReference: 'a_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'a_val',
            outputAlias: 'a_vals',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });
      const chainB = makeChain({
        relationship: makeRelationship({
          id: 'rel-b',
          targetAlias: 'b',
          joinConditions: [{ sourceFieldName: 'b_id', targetFieldName: 'b_id' }],
        }),
        targetTableReference: 'b_table',
        parentAlias: 'a',
        blendedFields: [
          {
            targetFieldName: 'b_val',
            outputAlias: 'b_vals',
            isHidden: false,
            aggregateFunction: 'MAX',
          },
        ],
      });
      const chainD = makeChain({
        relationship: makeRelationship({
          id: 'rel-d',
          targetAlias: 'd',
          joinConditions: [{ sourceFieldName: 'd_id', targetFieldName: 'd_id' }],
        }),
        targetTableReference: 'd_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'd_val',
            outputAlias: 'd_vals',
            isHidden: false,
            aggregateFunction: 'COUNT',
          },
        ],
      });

      const sql = builder.buildBlendedQuery(
        buildContext([chainA, chainB, chainD], ['root_col', 'a_vals', 'b_vals', 'd_vals'])
      );

      const fromSection = sql.split('FROM main\n')[1];
      const leftJoins = fromSection.match(/LEFT JOIN \w+ ON/g) ?? [];
      expect(leftJoins).toHaveLength(2);
      expect(fromSection).toContain('LEFT JOIN a ON main.a_id = a.a_id');
      expect(fromSection).toContain('LEFT JOIN d ON main.d_id = d.d_id');

      expect(sql).toContain('a.a_vals');
      expect(sql).toContain('a.b_vals');
      expect(sql).toContain('d.d_vals');
    });
  });
});
