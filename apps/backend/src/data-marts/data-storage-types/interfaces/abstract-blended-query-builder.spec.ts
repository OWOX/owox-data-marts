import { DataStorageType } from '../enums/data-storage-type.enum';
import { extractCteBody } from '@owox/test-utils';
import type { FilterRule } from '../../dto/schemas/filter-config.schema';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from './__fixtures__/blended-query-builder-fixtures';
import { AbstractBlendedQueryBuilder } from './abstract-blended-query-builder';
import { ResolvedRelationshipChain, BlendedQueryContext } from './blended-query-builder.interface';
import { SqlClauseRenderer, SqlParameter } from '../utils/sql-clause-renderer';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';

// Uses backtick quoting and a plain STRING_AGG syntax (no CAST) so that SQL-shape
// assertions stay readable — dialect-specific CASTs are covered by per-dialect specs.
class TestBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  protected get identifierQuoteChar() {
    return '`';
  }
  protected get clauseRenderer(): SqlClauseRenderer | null {
    return null;
  }
  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(${fieldName})`;
  }
}

const buildContext = createBuildContext('main_table');

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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery({
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

      const { sql } = builder.buildBlendedQuery({
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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_names']));
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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(buildContext([chain], ['event_names']));

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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(buildContext([chain], ['order_names']));

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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(
        buildContext([chain], ['order_names', 'count_cust'])
      );

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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(
        buildContext([ab, bc], ['campaign_id', 'b_c__product_name'])
      );

      // C (leaf) aggregation — CTE name is path-prefixed
      expect(sql).toContain('b_c AS (');
      expect(sql).toContain('FROM b_c_raw');

      // B has _joined CTE that LEFT JOINs with aggregated C
      expect(sql).toContain('b_joined AS (');
      expect(sql).toContain('LEFT JOIN b_c ON b_raw.product_id = b_c.product_id');

      // B aggregation reads from b_joined and groups by b_id ONLY
      expect(sql).toMatch(
        /\n {2}b AS \(\s*SELECT\s+b_id,[\s\S]*?FROM b_joined\s+GROUP BY b_id\s+\)/
      );

      // Final JOIN only to B, not C
      expect(sql).toContain('LEFT JOIN b ON main.b_id = b.b_id');
      const finalSection = sql.split('FROM main\n')[1];
      expect(finalSection).not.toContain('LEFT JOIN b_c ON');

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

      const { sql } = builder.buildBlendedQuery(buildContext([ab, bc], ['campaign_id', 'c_val']));

      expect(sql).toMatch(
        /\n {2}b AS \(\s*SELECT\s+shared_id,\s+MAX\(c_val\) AS c_val\s+FROM b_joined\s+GROUP BY shared_id\s+\)/
      );
      expect(sql).toMatch(
        /\n {2}b_c AS \(\s*SELECT\s+shared_id,\s+MAX\(val\) AS c_val\s+FROM b_c_raw\s+GROUP BY shared_id\s+\)/
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
        parentAlias: 'b_c',
        blendedFields: [
          {
            targetFieldName: 'value',
            outputAlias: 'd_value',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const { sql } = builder.buildBlendedQuery(buildContext([ab, bc, cd], ['col_a', 'd_value']));

      // D (leaf, cteName=b_c_d) aggregates by c_key
      expect(sql).toContain('FROM b_c_d_raw');
      expect(sql).toContain('GROUP BY c_key');

      // C (intermediate, cteName=b_c) has _joined CTE with D, aggregates by b_key
      expect(sql).toContain('b_c_joined AS (');
      expect(sql).toContain('LEFT JOIN b_c_d ON b_c_raw.c_key = b_c_d.c_key');
      expect(sql).toMatch(/\n {2}b_c AS \([\s\S]*?FROM b_c_joined\s+GROUP BY b_key\s+\)/);

      // B (intermediate) has _joined CTE with C, aggregates by a_key
      expect(sql).toContain('b_joined AS (');
      expect(sql).toContain('LEFT JOIN b_c ON b_raw.b_key = b_c.b_key');
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

      const { sql } = builder.buildBlendedQuery(
        buildContext(
          [ab, bc, bd],
          ['campaign_name', 'order_names', 'product_names', 'customer_names']
        )
      );

      expect(sql).toContain('orders_joined AS (');
      expect(sql).toContain(
        'LEFT JOIN orders_products ON orders_raw.product_id = orders_products.product_id'
      );
      expect(sql).toContain(
        'LEFT JOIN orders_customers ON orders_raw.customer_id = orders_customers.customer_id'
      );

      expect(sql).toMatch(
        /\n {2}orders AS \([\s\S]*?FROM orders_joined\s+GROUP BY campaign_id\s+\)/
      );

      expect(sql).toContain('orders.order_names');
      expect(sql).toContain('orders.product_names');
      expect(sql).toContain('orders.customer_names');

      const finalJoins = sql.split('FROM main\n')[1];
      expect(finalJoins).toContain('LEFT JOIN orders ON');
      expect(finalJoins).not.toContain('LEFT JOIN orders_products ON');
      expect(finalJoins).not.toContain('LEFT JOIN orders_customers ON');
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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(
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

      const { sql } = builder.buildBlendedQuery(
        buildContext([ab, bc], ['customer_name', 'item_skus'])
      );

      expect(sql).toContain('orders_joined AS (');
      expect(sql).toMatch(
        /\n {2}orders AS \([\s\S]*?FROM orders_joined\s+GROUP BY customer_id\s+\)/
      );
      expect(sql).toContain('STRING_AGG(item_skus) AS item_skus');
      expect(sql).toContain('orders.item_skus');
    });

    it('diamond pattern: two chains sharing targetAlias produce distinct path-prefixed CTEs', () => {
      const left = makeChain({
        relationship: makeRelationship({
          id: 'rel-main-left',
          targetAlias: 'left',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
        }),
        targetTableReference: 'left_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const right = makeChain({
        relationship: makeRelationship({
          id: 'rel-main-right',
          targetAlias: 'right',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
        }),
        targetTableReference: 'right_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const leftShared = makeChain({
        relationship: makeRelationship({
          id: 'rel-left-shared',
          targetAlias: 'shared',
          joinConditions: [{ sourceFieldName: 'left_id', targetFieldName: 'left_id' }],
        }),
        targetTableReference: 'shared_table',
        parentAlias: 'left',
        blendedFields: [
          {
            targetFieldName: 'value',
            outputAlias: 'left_shared__value',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });
      const rightShared = makeChain({
        relationship: makeRelationship({
          id: 'rel-right-shared',
          targetAlias: 'shared',
          joinConditions: [{ sourceFieldName: 'right_id', targetFieldName: 'right_id' }],
        }),
        targetTableReference: 'shared_table',
        parentAlias: 'right',
        blendedFields: [
          {
            targetFieldName: 'value',
            outputAlias: 'right_shared__value',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });

      const { sql } = builder.buildBlendedQuery(
        buildContext(
          [left, right, leftShared, rightShared],
          ['root_col', 'left_shared__value', 'right_shared__value']
        )
      );

      expect(sql).toContain('left_shared AS (');
      expect(sql).toContain('left_shared_raw AS (');
      expect(sql).toContain('right_shared AS (');
      expect(sql).toContain('right_shared_raw AS (');

      expect(sql).toContain('LEFT JOIN left_shared ON left_raw.left_id = left_shared.left_id');
      expect(sql).toContain('LEFT JOIN right_shared ON right_raw.right_id = right_shared.right_id');

      expect(sql).toContain('left.left_shared__value');
      expect(sql).toContain('right.right_shared__value');
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

      const { sql } = builder.buildBlendedQuery(
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

// --- Output controls ---

class TestBlendedWithRenderer extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  protected get identifierQuoteChar() {
    return '`';
  }
  protected get clauseRenderer() {
    return new BigQueryClauseRenderer();
  }
  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(${fieldName})`;
  }
}

describe('AbstractBlendedQueryBuilder — output controls', () => {
  let builder: TestBlendedWithRenderer;

  beforeEach(() => {
    builder = new TestBlendedWithRenderer();
  });

  it('qualifies WHERE on a native main column with the main alias', () => {
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
    const ctx: BlendedQueryContext = {
      ...buildContext([chain], ['customer_name']),
      filters: [{ column: 'customer_name', operator: 'eq', value: 'X' }],
    };
    const { sql, params } = builder.buildBlendedQuery(ctx);
    expect(sql).toContain('WHERE main.customer_name = @p0');
    expect(params).toEqual([{ name: 'p0', value: 'X' }]);
  });

  it('qualifies WHERE on a blended outputAlias with its root CTE alias', () => {
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
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([chain], ['customer_name', 'order_names']),
      filters: [{ column: 'order_names', operator: 'eq', value: 'X' }],
    });
    expect(sql).toContain('WHERE orders.order_names = @p0');
  });

  it('qualifies WHERE on a hidden blended outputAlias and keeps it out of SELECT', () => {
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
        {
          targetFieldName: 'total',
          outputAlias: 'orders__total',
          isHidden: true,
          aggregateFunction: 'SUM',
        },
      ],
    });
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([chain], ['customer_name', 'order_names']),
      filters: [{ column: 'orders__total', operator: 'gt', value: 100 }],
    });
    expect(sql).toContain('WHERE orders.orders__total > @p0');
    expect(sql).toContain('SUM(total) AS orders__total');
    const selectSection = sql.split('FROM main\n')[0];
    expect(selectSection).not.toContain('orders.orders__total,');
    expect(selectSection.match(/orders\.orders__total\b/g)).toBeNull();
  });

  it('appends ORDER BY and LIMIT in correct order after WHERE with qualified references', () => {
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
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([chain], ['customer_name']),
      filters: [{ column: 'customer_name', operator: 'eq', value: 'X' }],
      sort: [{ column: 'customer_name', direction: 'desc' }],
      limit: 50,
    });
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('ORDER BY'));
    expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT'));
    expect(sql).toContain('ORDER BY main.customer_name DESC');
    expect(sql).toContain('LIMIT 50');
  });

  it('projects native main columns referenced only by filter/sort into the main raw CTE', () => {
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
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([chain], ['order_names']),
      filters: [{ column: 'customer_name', operator: 'eq', value: 'X' }],
      sort: [{ column: 'signup_date', direction: 'desc' }],
    });
    expect(sql).toMatch(
      /main AS \(\s*SELECT\s+customer_name,\s+id,\s+signup_date\s+FROM main_table/
    );
    expect(sql).toContain('WHERE main.customer_name = @p0');
    expect(sql).toContain('ORDER BY main.signup_date DESC');
  });

  it('routes a depth-2 blended outputAlias to its root CTE in WHERE', () => {
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
          outputAlias: 'orders_items__count',
          isHidden: false,
          aggregateFunction: 'COUNT',
        },
      ],
    });
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ab, bc], ['customer_name', 'orders_items__count']),
      filters: [{ column: 'orders_items__count', operator: 'gt', value: 0 }],
    });
    expect(sql).toContain('WHERE orders.orders_items__count > @p0');
  });

  it('emits segment-aware quoting for dotted native main columns', () => {
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
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([chain], ['order_names']),
      filters: [{ column: 'user.email', operator: 'eq', value: 'a@b' }],
      sort: [{ column: 'user.email', direction: 'asc' }],
    });
    expect(sql).toContain('WHERE main.user.email = @p0');
    expect(sql).toContain('ORDER BY main.user.email ASC');
    expect(sql).not.toContain('main.`user.email`');
  });

  it('returns empty params when no filters', () => {
    const chain = makeChain({
      relationship: makeRelationship(),
      targetTableReference: 'orders_table',
      parentAlias: 'main',
      blendedFields: [],
    });
    const { params } = builder.buildBlendedQuery(buildContext([chain], ['customer_name']));
    expect(params).toEqual([]);
  });

  describe('with pre-join filters', () => {
    function makeUsersChain() {
      return makeChain({
        relationship: makeRelationship({
          targetAlias: 'users',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'user_id' }],
        }),
        targetTableReference: 'users_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'email',
            outputAlias: 'users_email',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });
    }

    it('emits WHERE inside a leaf raw CTE for a single pre-join filter', () => {
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      };
      const { sql, params } = builder.buildBlendedQuery(ctx);
      expect(sql).toMatch(/users_raw AS \([\s\S]+?WHERE\s+userRole\s*=\s*@s_users_0/);
      expect(params.find(p => p.name === 's_users_0')?.value).toBe('admin');
    });

    it('projects pre-join filter columns into the raw CTE even if not in columnConfig', () => {
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      };
      const { sql } = builder.buildBlendedQuery(ctx);
      expect(sql).toMatch(/users_raw AS \([\s\S]*?userRole[\s\S]*?FROM/);
    });

    it('combines multiple pre-join filters on the same CTE with AND', () => {
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
          {
            column: 'createdAt',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 30 },
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      };
      const { sql } = builder.buildBlendedQuery(ctx);
      expect(sql).toMatch(/WHERE[\s\S]+AND[\s\S]+DATE_SUB/);
    });

    it('uses unique param prefixes across CTEs to avoid @p0 collision', () => {
      const orgsChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-orgs',
          targetAlias: 'orgs',
          joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'org_id' }],
        }),
        targetTableReference: 'orgs_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'name',
            outputAlias: 'orgs_name',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain(), orgsChain], ['users_email', 'orgs_name']),
        filters: [
          { column: 'users_email', operator: 'contains', value: '@owox' },
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
          {
            column: 'plan',
            operator: 'eq',
            value: 'pro',
            placement: 'pre-join',
            aliasPath: 'orgs',
          },
        ],
      };
      const { params } = builder.buildBlendedQuery(ctx);
      const names = params.map(p => p.name).sort();
      expect(new Set(names).size).toBe(names.length);
    });

    it('quotes each segment of a dotted column (nested struct) in the pre-join WHERE', () => {
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'profile.country',
            operator: 'eq',
            value: 'UA',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      };
      const { sql } = builder.buildBlendedQuery(ctx);
      // M1 regression: nested struct paths must traverse as `profile.country`
      // (a STRUCT field access in BigQuery), never as a single backticked
      // identifier `profile.country` (which BigQuery would resolve as a
      // column literally named "profile.country" → unknown column error).
      // The TestBlendedWithRenderer leaves safe-pattern segments unquoted, so
      // the emitted form is `profile.country` itself; the negative assertion
      // pins the absence of the wrongly-fused form.
      expect(sql).toContain('WHERE profile.country = @s_users_0');
      expect(sql).not.toContain('`profile.country`');
    });

    it('throws when a pre-join filter aliasPath does not resolve to any chain', () => {
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'plan',
            operator: 'eq',
            value: 'pro',
            placement: 'pre-join',
            aliasPath: 'orgs',
          },
        ],
      };
      expect(() => builder.buildBlendedQuery(ctx)).toThrow(/aliasPath='orgs'/);
    });

    it("post-join filters use the 'p' prefix so they never collide with pre-join 's_<cte>_' prefixes", () => {
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['customer_name', 'users_email']),
        filters: [
          { column: 'customer_name', operator: 'eq', value: 'X' },
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
      };
      const { sql, params } = builder.buildBlendedQuery(ctx);
      expect(sql).toContain('WHERE main.customer_name = @p0');
      expect(sql).toContain('WHERE userRole = @s_users_0');
      const names = params.map(p => p.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toContain('p0');
      expect(names).toContain('s_users_0');
    });
  });

  describe('with pre-join filters — operator matrix', () => {
    function makeUsersChain() {
      return makeChain({
        relationship: makeRelationship({
          targetAlias: 'users',
          joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'user_id' }],
        }),
        targetTableReference: 'users_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'email',
            outputAlias: 'users_email',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
        ],
      });
    }

    type RuleInput = Omit<FilterRule, 'placement' | 'aliasPath'>;

    function runWithRule(rule: RuleInput): { sql: string; params: SqlParameter[] } {
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [{ ...rule, placement: 'pre-join', aliasPath: 'users' } as FilterRule],
      };
      return builder.buildBlendedQuery(ctx);
    }

    // ── Scalar comparison operators (each consumes 1 param) ────────────────

    it.each([
      ['eq', '=', 'admin' as string | number],
      ['neq', '!=', 'admin'],
      ['gt', '>', 5],
      ['lt', '<', 5],
      ['gte', '>=', 5],
      ['lte', '<=', 5],
    ] as const)('%s renders as `%s` with 1 param @s_users_0', (op, sqlOp, value) => {
      const { sql, params } = runWithRule({
        column: 'attr',
        operator: op,
        value,
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      const escaped = sqlOp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // TestBlendedWithRenderer leaves safe-pattern identifiers unquoted; the
      // shape of the emitted predicate is what matters, not the quoting.
      expect(usersRawBody).toMatch(new RegExp(`attr\\s*${escaped}\\s*@s_users_0`));
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(1);
      expect(params.find(p => p.name === 's_users_0')?.value).toBe(value);
    });

    // ── Substring / affix matchers use BigQuery built-ins, not LIKE ────────

    it.each([
      ['contains', 'STRPOS(name, @s_users_0) > 0'],
      ['not_contains', 'STRPOS(name, @s_users_0) = 0'],
      ['starts_with', 'STARTS_WITH(name, @s_users_0)'],
      ['ends_with', 'ENDS_WITH(name, @s_users_0)'],
    ] as const)('%s renders as `%s` with 1 param', (op, fragment) => {
      const { sql, params } = runWithRule({
        column: 'name',
        operator: op,
        value: 'foo',
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toContain(fragment);
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(1);
    });

    // ── No-value operators consume 0 params ────────────────────────────────

    it.each([
      ['is_null', 'flag IS NULL'],
      ['is_not_null', 'flag IS NOT NULL'],
      ['is_empty', "(flag IS NULL OR flag = '')"],
      ['is_not_empty', "(flag IS NOT NULL AND flag != '')"],
      ['is_true', 'flag = TRUE'],
      ['is_false', 'flag = FALSE'],
    ] as const)('%s renders as `%s` with 0 params', (op, fragment) => {
      const { sql, params } = runWithRule({
        column: 'flag',
        operator: op,
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toContain(fragment);
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(0);
    });

    // ── Regex operators (each consumes 1 param) ─────────────────────────────

    it.each([
      ['regex', 'REGEXP_CONTAINS'],
      ['not_regex', 'NOT REGEXP_CONTAINS'],
    ] as const)('%s renders via %s with 1 param @s_users_0', (op, fragment) => {
      const { sql, params } = runWithRule({
        column: 'name',
        operator: op,
        value: '^a',
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toContain(fragment);
      expect(usersRawBody).toContain('@s_users_0');
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(1);
    });

    // ── Range / relative-date operators ────────────────────────────────────

    it('between renders as `>= AND <=` with 2 params @s_users_0/@s_users_1', () => {
      const { sql, params } = runWithRule({
        column: 'amount',
        operator: 'between',
        value: { from: 10, to: 20 },
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toMatch(/amount\s+BETWEEN\s+@s_users_0\s+AND\s+@s_users_1/);
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(2);
    });

    it('relative_date `today` renders as `= CURRENT_DATE()` with 0 params', () => {
      const { sql, params } = runWithRule({
        column: 'created_at',
        operator: 'relative_date',
        value: { kind: 'today' },
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toContain('created_at = CURRENT_DATE()');
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(0);
    });

    it('relative_date `last_n_days` embeds `n` as a literal INTERVAL with 0 params', () => {
      const { sql, params } = runWithRule({
        column: 'created_at',
        operator: 'relative_date',
        value: { kind: 'last_n_days', n: 30 },
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toContain('DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)');
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(0);
    });
  });
});

describe('AbstractBlendedQueryBuilder — pre-join filters on tricky tree shapes', () => {
  let builder: TestBlendedWithRenderer;
  const buildContext = createBuildContext('main_table');

  beforeEach(() => {
    builder = new TestBlendedWithRenderer();
  });

  it('pre-join filter on an intermediate (non-leaf) chain: WHERE lands in b_raw, not b_joined', () => {
    // Tree: main → b → c. Pre-join filter on aliasPath='b'.
    const bChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-b',
        targetAlias: 'b',
        joinConditions: [{ sourceFieldName: 'b_id', targetFieldName: 'b_id' }],
      }),
      targetTableReference: 'b_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'b_field',
          outputAlias: 'b_blend',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });
    const cChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-c',
        targetAlias: 'c',
        joinConditions: [{ sourceFieldName: 'c_id', targetFieldName: 'c_id' }],
      }),
      targetTableReference: 'c_table',
      parentAlias: 'b',
      blendedFields: [
        {
          targetFieldName: 'c_field',
          outputAlias: 'c_blend',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const ctx: BlendedQueryContext = {
      ...buildContext([bChain, cChain], ['b_blend']),
      filters: [
        {
          column: 'b_status',
          operator: 'eq',
          value: 'active',
          placement: 'pre-join',
          aliasPath: 'b',
        } as FilterRule,
      ],
    };
    const { sql } = builder.buildBlendedQuery(ctx);

    const bRaw = extractCteBody(sql, 'b_raw');
    expect(bRaw).toMatch(/WHERE\s+b_status\s*=\s*@s_b_0/);

    // b_joined CTE must NOT carry the WHERE — the pre-join WHERE belongs to
    // the raw CTE that wraps the table, never to the join-projection CTE.
    const bJoined = extractCteBody(sql, 'b_joined');
    expect(bJoined).not.toMatch(/WHERE/);
  });

  it('pre-join filter on a deep chain (a→b→c→d): WHERE lands in deepest _raw CTE', () => {
    const aChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-a',
        targetAlias: 'a',
        joinConditions: [{ sourceFieldName: 'a_id', targetFieldName: 'a_id' }],
      }),
      targetTableReference: 'a_table',
      parentAlias: 'main',
      blendedFields: [],
    });
    const bChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-b',
        targetAlias: 'b',
        joinConditions: [{ sourceFieldName: 'b_id', targetFieldName: 'b_id' }],
      }),
      targetTableReference: 'b_table',
      parentAlias: 'a',
      blendedFields: [],
    });
    const cChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-c',
        targetAlias: 'c',
        joinConditions: [{ sourceFieldName: 'c_id', targetFieldName: 'c_id' }],
      }),
      targetTableReference: 'c_table',
      parentAlias: 'a_b',
      blendedFields: [],
    });
    const dChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-d',
        targetAlias: 'd',
        joinConditions: [{ sourceFieldName: 'd_id', targetFieldName: 'd_id' }],
      }),
      targetTableReference: 'd_table',
      parentAlias: 'a_b_c',
      blendedFields: [
        {
          targetFieldName: 'd_field',
          outputAlias: 'd_blend',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const ctx: BlendedQueryContext = {
      ...buildContext([aChain, bChain, cChain, dChain], ['d_blend']),
      filters: [
        {
          column: 'd_status',
          operator: 'eq',
          value: 'live',
          placement: 'pre-join',
          aliasPath: 'a.b.c.d',
        } as FilterRule,
      ],
    };
    const { sql } = builder.buildBlendedQuery(ctx);

    const dRaw = extractCteBody(sql, 'a_b_c_d_raw');
    expect(dRaw).toMatch(/WHERE\s+d_status\s*=\s*@s_a_b_c_d_0/);

    // Sibling _raw CTEs further up the tree must NOT carry the WHERE.
    expect(extractCteBody(sql, 'a_raw')).not.toMatch(/WHERE/);
    expect(extractCteBody(sql, 'a_b_raw')).not.toMatch(/WHERE/);
    expect(extractCteBody(sql, 'a_b_c_raw')).not.toMatch(/WHERE/);
  });

  it('diamond pattern: pre-join filter lands only in the sliced path, not in the other branch', () => {
    // Two distinct chains both targeting alias "c" via different parents
    // (path "a.c" vs "b.c"). Filter on aliasPath="a.c" must only touch a_c_raw.
    const aChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-a',
        targetAlias: 'a',
        joinConditions: [{ sourceFieldName: 'a_id', targetFieldName: 'a_id' }],
      }),
      targetTableReference: 'a_table',
      parentAlias: 'main',
      blendedFields: [],
    });
    const acChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-ac',
        targetAlias: 'c',
        joinConditions: [{ sourceFieldName: 'c_id', targetFieldName: 'c_id' }],
      }),
      targetTableReference: 'c_table',
      parentAlias: 'a',
      blendedFields: [
        {
          targetFieldName: 'c_field',
          outputAlias: 'ac_blend',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });
    const bChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-b',
        targetAlias: 'b',
        joinConditions: [{ sourceFieldName: 'b_id', targetFieldName: 'b_id' }],
      }),
      targetTableReference: 'b_table',
      parentAlias: 'main',
      blendedFields: [],
    });
    const bcChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-bc',
        targetAlias: 'c',
        joinConditions: [{ sourceFieldName: 'c_id', targetFieldName: 'c_id' }],
      }),
      targetTableReference: 'c_table',
      parentAlias: 'b',
      blendedFields: [
        {
          targetFieldName: 'c_field',
          outputAlias: 'bc_blend',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const ctx: BlendedQueryContext = {
      ...buildContext([aChain, acChain, bChain, bcChain], ['ac_blend', 'bc_blend']),
      filters: [
        {
          column: 'c_status',
          operator: 'eq',
          value: 'live',
          placement: 'pre-join',
          aliasPath: 'a.c',
        } as FilterRule,
      ],
    };
    const { sql } = builder.buildBlendedQuery(ctx);

    const acRaw = extractCteBody(sql, 'a_c_raw');
    expect(acRaw).toMatch(/WHERE\s+c_status\s*=\s*@s_a_c_0/);

    const bcRaw = extractCteBody(sql, 'b_c_raw');
    expect(bcRaw).not.toMatch(/WHERE/);
  });

  it('pre-join column equal to a join key: projected at most once in the raw CTE SELECT', () => {
    // joinConditions targetFieldName='user_id' is both the join key (always
    // projected into the raw CTE) and the pre-join WHERE column. The
    // collectSubsidiaryReferences dedup must avoid emitting it twice.
    const usersChain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'user_id' }],
      }),
      targetTableReference: 'users_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'email',
          outputAlias: 'users_email',
          isHidden: false,
          aggregateFunction: 'STRING_AGG',
        },
      ],
    });

    const ctx: BlendedQueryContext = {
      ...buildContext([usersChain], ['users_email']),
      filters: [
        {
          column: 'user_id',
          operator: 'is_not_null',
          placement: 'pre-join',
          aliasPath: 'users',
        } as FilterRule,
      ],
    };
    const { sql } = builder.buildBlendedQuery(ctx);

    const usersRaw = extractCteBody(sql, 'users_raw');
    // Count occurrences of `user_id` inside the SELECT projection of users_raw
    // (between AS ( and FROM). Each match is a SELECT-list item; >1 means dup.
    const selectMatch = /SELECT\s+([\s\S]+?)\s+FROM/m.exec(usersRaw);
    expect(selectMatch).not.toBeNull();
    const selectList = selectMatch![1];
    // TestBlendedWithRenderer leaves safe identifiers unquoted, so count bare
    // `user_id` occurrences. Use a word-boundary match to avoid catching it
    // as a substring of a longer alphanumeric identifier.
    const userIdMatches = selectList.match(/\buser_id\b/g) ?? [];
    expect(userIdMatches.length).toBe(1);

    // WHERE still applies on user_id IS NOT NULL.
    expect(usersRaw).toMatch(/WHERE\s+user_id\s+IS NOT NULL/);
  });
});

describe('AbstractBlendedQueryBuilder — regression: ambiguous column in WHERE/ORDER BY', () => {
  let builder: TestBlendedWithRenderer;

  beforeEach(() => {
    builder = new TestBlendedWithRenderer();
  });

  it('qualifies every WHERE / ORDER BY reference when columns are shared across CTEs', () => {
    const visitors = makeChain({
      relationship: makeRelationship({
        id: 'rel-visitors',
        targetAlias: 'visitors_e_commerce',
        joinConditions: [{ sourceFieldName: 'visitor_id', targetFieldName: 'visitor_id' }],
      }),
      targetTableReference: 'visitors_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'total_sessions',
          outputAlias: 'visitors_e_commerce__total_sessions',
          isHidden: true,
          aggregateFunction: 'SUM',
        },
      ],
    });
    const unifiedAdSpend = makeChain({
      relationship: makeRelationship({
        id: 'rel-ad-spend',
        targetAlias: 'unified_ad_spend_e_commerce',
        joinConditions: [
          { sourceFieldName: 'date', targetFieldName: 'date' },
          { sourceFieldName: 'source', targetFieldName: 'source' },
          { sourceFieldName: 'medium', targetFieldName: 'medium' },
        ],
      }),
      targetTableReference: 'unified_ad_spend_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'spend',
          outputAlias: 'unified_ad_spend_e_commerce__spend',
          isHidden: false,
          aggregateFunction: 'SUM',
        },
      ],
    });

    const { sql, params } = builder.buildBlendedQuery({
      ...buildContext(
        [visitors, unifiedAdSpend],
        [
          'date',
          'customer_id',
          'device_category',
          'is_conversion',
          'source',
          'medium',
          'unified_ad_spend_e_commerce__spend',
        ]
      ),
      filters: [
        {
          column: 'date',
          operator: 'between',
          value: { from: '2025-01-01', to: '2025-01-31' },
        },
        { column: 'visitors_e_commerce__total_sessions', operator: 'gt', value: 5 },
      ],
      sort: [{ column: 'source', direction: 'asc' }],
      limit: 1000,
    });

    expect(sql).toContain('WHERE main.date BETWEEN @p0 AND @p1');
    expect(sql).toContain('AND visitors_e_commerce.visitors_e_commerce__total_sessions > @p2');
    expect(sql).toContain('ORDER BY main.source ASC');
    expect(sql).toContain('LIMIT 1000');

    const tail = sql.slice(sql.indexOf('\nWHERE'));
    expect(tail).not.toMatch(/WHERE\s+`?date`?\s/);
    expect(tail).not.toMatch(/AND\s+`?date`?\s/);
    expect(tail).not.toMatch(/ORDER BY\s+`?source`?\s/);
    expect(tail).not.toMatch(/AND\s+`?source`?\s/);
    expect(tail).not.toMatch(/WHERE\s+`?visitors_e_commerce__total_sessions`?\s/);

    expect(params).toEqual([
      { name: 'p0', value: '2025-01-01' },
      { name: 'p1', value: '2025-01-31' },
      { name: 'p2', value: 5 },
    ]);
  });
});
