import { Logger } from '@nestjs/common';
import { extractCteBody } from '@owox/test-utils';
import type { FilterRule } from '../../dto/schemas/filter-config.schema';
import type { RoutedFilterRule } from '../../dto/domain/filter-clause';
import type { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import {
  TestBlendedQueryBuilder,
  TestBlendedWithDriftedSleeve,
  TestBlendedWithRenderer,
  createBuildContext,
  fixtureEventsUsersOrgs,
  makeChain,
  makeRelationship,
} from './__fixtures__/blended-query-builder-fixtures';
import { ResolvedRelationshipChain, BlendedQueryContext } from './blended-query-builder.interface';
import { CalculatedFieldPlan, SqlParameter } from '../utils/sql-clause-renderer';
import { buildFormulaOwnerPlan } from '../../calculated-fields/formula-owner-plan';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';
import { buildBlendedFieldIndex } from '../../services/blended-field-index';
import { collectValueSleeveOwners } from '../blending/metric-sleeve.planner';
import {
  SLEEVE_ROUTED_FUNCTIONS,
  ReportAggregateFunction,
} from '../../dto/schemas/aggregate-function.schema';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';

const buildContext = createBuildContext('main_table');

// Collapses indentation/newlines so multi-line CTE SQL can be asserted against with
// simple substring checks, independent of the builder's exact line-wrapping.
function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
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

    // The nested path is on a BLENDED FIELD, not on the join key: a blended field genuinely
    // supports one (the raw CTE widens to SELECT *, so the struct is in scope and the aggregation
    // CTE reads `user.name` and aliases the result flat), whereas a nested JOIN KEY cannot work
    // at all — the dedup CTE would project it unaliased, every engine names that column after the
    // last segment, and every reference to it is built as `<cte>.user.id`. This test used to use
    // a nested join key as the vehicle for the SELECT * fallback, which pinned a shape the
    // builder now rejects outright.
    it('falls back to SELECT * when a field uses dot-notation (nested struct)', () => {
      const chain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'events',
          joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
        }),
        targetTableReference: 'events_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'user.name',
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

    it('re-aggregation: COUNT_DISTINCT becomes SUM at parent level (known over-count limitation)', () => {
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

      // KNOWN LIMITATION (documented in getReAggregateFunction): on a 2+ level blend this
      // SUMs per-child-group distinct counts, which over-counts a value present in more than
      // one group — it is NOT a true global distinct. Asserting the current SQL, not a claim
      // of semantic correctness.
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
    expect(sql).toContain('ORDER BY\n  main.customer_name DESC');
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
    expect(sql).toContain('ORDER BY\n  main.signup_date DESC');
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
    expect(sql).toContain('ORDER BY\n  main.user.email ASC');
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
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'users__userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
      };
      const { sql, params } = builder.buildBlendedQuery(ctx);
      expect(sql).toMatch(/users_raw AS \([\s\S]+?WHERE\s+userRole\s*=\s*@s_users_0/);
      expect(params.find(p => p.name === 's_users_0')?.value).toBe('admin');
    });

    it('projects pre-join filter columns into the raw CTE even if not in columnConfig', () => {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'users__userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
      };
      const { sql } = builder.buildBlendedQuery(ctx);
      expect(sql).toMatch(/users_raw AS \([\s\S]*?userRole[\s\S]*?FROM/);
    });

    it('combines multiple pre-join filters on the same CTE with AND', () => {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: 'STRING',
          },
          {
            name: 'users__createdAt',
            aliasPath: 'users',
            originalFieldName: 'createdAt',
            type: 'TIMESTAMP',
          },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'users__userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
          },
          {
            column: 'users__createdAt',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 30 },
            placement: 'pre-join',
          },
        ],
        fieldIndex,
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
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: 'STRING',
          },
          { name: 'orgs__plan', aliasPath: 'orgs', originalFieldName: 'plan', type: 'STRING' },
        ],
        availableSources: [
          { aliasPath: 'users', isIncluded: true },
          { aliasPath: 'orgs', isIncluded: true },
        ],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain(), orgsChain], ['users_email', 'orgs_name']),
        filters: [
          { column: 'users_email', operator: 'contains', value: '@owox' },
          {
            column: 'users__userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
          },
          {
            column: 'orgs__plan',
            operator: 'eq',
            value: 'pro',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
      };
      const { params } = builder.buildBlendedQuery(ctx);
      const names = params.map(p => p.name).sort();
      expect(new Set(names).size).toBe(names.length);
    });

    it('quotes each segment of a dotted column (nested struct) in the pre-join WHERE', () => {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__profile.country',
            aliasPath: 'users',
            originalFieldName: 'profile.country',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'users__profile.country',
            operator: 'eq',
            value: 'UA',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
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

    it('throws when a pre-join filter column does not resolve in the field index', () => {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'users__email', aliasPath: 'users', originalFieldName: 'email', type: 'STRING' },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [
          {
            column: 'orgs__plan',
            operator: 'eq',
            value: 'pro',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
      };
      expect(() => builder.buildBlendedQuery(ctx)).toThrow(/column='orgs__plan'/);
    });

    it("post-join filters use the 'p' prefix so they never collide with pre-join 's_<cte>_' prefixes", () => {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['customer_name', 'users_email']),
        filters: [
          { column: 'customer_name', operator: 'eq', value: 'X' },
          {
            column: 'users__userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
          },
        ],
        fieldIndex,
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

    type RuleInput = Omit<FilterRule, 'placement'>;

    function runWithRule(rule: RuleInput): { sql: string; params: SqlParameter[] } {
      // Build a field index that maps the unified name to the users CTE.
      // Column in rule is the raw field name; unified name = 'users__<column>'.
      const rawColumn = rule.column;
      const unifiedName = `users__${rawColumn}`;
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: unifiedName, aliasPath: 'users', originalFieldName: rawColumn, type: 'STRING' },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...buildContext([makeUsersChain()], ['users_email']),
        filters: [{ ...rule, column: unifiedName, placement: 'pre-join' } as FilterRule],
        fieldIndex,
      };
      return builder.buildBlendedQuery(ctx);
    }

    // ── Scalar comparison operators (each consumes 1 param) ────────────────

    it.each([
      ['eq', '=', 'admin' as string | number],
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

    // neq is null-inclusive: `(attr IS NULL OR attr <> @p)`, not bare `!=`.
    it('neq keeps NULL rows with 1 param @s_users_0', () => {
      const { sql, params } = runWithRule({
        column: 'attr',
        operator: 'neq',
        value: 'admin',
      } as RuleInput);
      const usersRawBody = extractCteBody(sql, 'users_raw');
      expect(usersRawBody).toMatch(/attr\s+IS NULL\s+OR\s+attr\s*<>\s*@s_users_0/);
      expect(params.filter(p => p.name.startsWith('s_users_'))).toHaveLength(1);
      expect(params.find(p => p.name === 's_users_0')?.value).toBe('admin');
    });

    // ── Substring / affix matchers use BigQuery built-ins, not LIKE ────────

    it.each([
      ['contains', 'STRPOS(name, @s_users_0) > 0'],
      ['not_contains', '(name IS NULL OR STRPOS(name, @s_users_0) = 0)'],
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
      ['not_regex', 'IS NULL OR NOT REGEXP_CONTAINS'],
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

    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        { name: 'b__b_status', aliasPath: 'b', originalFieldName: 'b_status', type: 'STRING' },
      ],
      availableSources: [{ aliasPath: 'b', isIncluded: true }],
    } as never);
    const ctx: BlendedQueryContext = {
      ...buildContext([bChain, cChain], ['b_blend']),
      filters: [
        {
          column: 'b__b_status',
          operator: 'eq',
          value: 'active',
          placement: 'pre-join',
        } as FilterRule,
      ],
      fieldIndex,
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

    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'a_b_c_d__d_status',
          aliasPath: 'a.b.c.d',
          originalFieldName: 'd_status',
          type: 'STRING',
        },
      ],
      availableSources: [{ aliasPath: 'a.b.c.d', isIncluded: true }],
    } as never);
    const ctx: BlendedQueryContext = {
      ...buildContext([aChain, bChain, cChain, dChain], ['d_blend']),
      filters: [
        {
          column: 'a_b_c_d__d_status',
          operator: 'eq',
          value: 'live',
          placement: 'pre-join',
        } as FilterRule,
      ],
      fieldIndex,
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

    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        { name: 'a_c__c_status', aliasPath: 'a.c', originalFieldName: 'c_status', type: 'STRING' },
      ],
      availableSources: [{ aliasPath: 'a.c', isIncluded: true }],
    } as never);
    const ctx: BlendedQueryContext = {
      ...buildContext([aChain, acChain, bChain, bcChain], ['ac_blend', 'bc_blend']),
      filters: [
        {
          column: 'a_c__c_status',
          operator: 'eq',
          value: 'live',
          placement: 'pre-join',
        } as FilterRule,
      ],
      fieldIndex,
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

    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'users__user_id',
          aliasPath: 'users',
          originalFieldName: 'user_id',
          type: 'STRING',
        },
      ],
      availableSources: [{ aliasPath: 'users', isIncluded: true }],
    } as never);
    const ctx: BlendedQueryContext = {
      ...buildContext([usersChain], ['users_email']),
      filters: [
        {
          column: 'users__user_id',
          operator: 'is_not_null',
          placement: 'pre-join',
        } as FilterRule,
      ],
      fieldIndex,
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

describe('AbstractBlendedQueryBuilder — post-join aggregation', () => {
  let builder: TestBlendedWithRenderer;
  const buildContext = createBuildContext('main_table');

  beforeEach(() => {
    builder = new TestBlendedWithRenderer();
  });

  function spendChain() {
    return makeChain({
      relationship: makeRelationship({
        targetAlias: 'spend',
        joinConditions: [{ sourceFieldName: 'date', targetFieldName: 'date' }],
      }),
      targetTableReference: 'spend_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'cost',
          outputAlias: 'spend__cost',
          isHidden: false,
          aggregateFunction: 'SUM',
        },
      ],
    });
  }

  // `spend__cost` is a JOINED column — since 3, a SUM/AVG report metric on it
  // routes through its value sleeve, which needs a populated field index to resolve the
  // raw source (same as the real BlendedReportDataService caller always supplies).
  const spendFieldIndex = buildBlendedFieldIndex({
    blendedFields: [
      { name: 'spend__cost', aliasPath: 'spend', originalFieldName: 'cost', type: 'FLOAT' },
    ],
    availableSources: [{ aliasPath: 'spend', isIncluded: true }],
  } as never);

  it('groups by a native dimension and aggregates a joined metric via its value sleeve', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
    });

    // BigQuery's renderer always backticks the output alias, but the builder's own
    // qualifier leaves safe identifiers unquoted — hence `main.channel AS `channel``.
    expect(sql).toContain('main.channel AS `channel`');
    expect(sql).toContain('sleeve_spend__cost AS (');
    expect(sql).toContain(
      'ANY_VALUE(sleeve_spend__cost.`spend__cost | SUM`) AS `spend__cost | SUM`'
    );
    // The old dedup+SUM re-aggregation path is gone for a joined metric.
    expect(sql).not.toContain('SUM(spend.spend__cost)');
    expect(sql).toContain('GROUP BY\n  main.channel');
    // The outer GROUP BY lands after the final FROM/JOIN. NOTE: anchor on the FULL outer
    // join-condition text, not the bare `LEFT JOIN spend` prefix — now that spend__cost is
    // sleeve-routed, `sleeve_spend__cost` emits its own `LEFT JOIN spend_raw ON ...` INSIDE
    // the WITH clause, and `'LEFT JOIN spend'` is a prefix of `'LEFT JOIN spend_raw'`, so the
    // bare prefix would false-match the sleeve-internal join and the ordering check would be
    // tautological.
    expect(sql.indexOf('LEFT JOIN spend ON main.date = spend.date')).toBeLessThan(
      sql.indexOf('GROUP BY\n  main.channel')
    );
  });

  it('orders by an aggregated blended metric via its output alias, not the bare column', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      sort: [{ column: 'spend__cost', direction: 'desc' }],
    });

    expect(sql).toContain('ORDER BY\n  `spend__cost | SUM` DESC');
    // NOTE: a bare `sql.indexOf('ORDER BY')` would false-match the row surrogate's OWN
    // `ROW_NUMBER() OVER (ORDER BY 1)` window clause inside `spend_raw` (a joined SUM now
    // needs the surrogate, 1) — anchor on the outer clause's full, already-`toContain`ed text instead.
    expect(sql.indexOf('GROUP BY')).toBeLessThan(
      sql.indexOf('ORDER BY\n  `spend__cost | SUM` DESC')
    );
  });

  it('emits two aggregated SELECT items when one blended metric carries two functions, sharing ONE merged value sleeve', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [
        { column: 'spend__cost', function: 'SUM' },
        { column: 'spend__cost', function: 'AVG' },
      ],
    });

    // Two sleeve-eligible functions on the SAME joined column now share ONE merged sleeve
    // CTE — one dedup pass, two outer aggregates — instead of two identically-shaped
    // `SELECT DISTINCT` subqueries (the pre-C3.1 `_SUM`/`_AVG`-suffixed collision-avoidance
    // shape; see the dedicated "value-sleeve merging" coverage below for more merge cases).
    expect(sql).toContain('sleeve_spend__cost AS (');
    expect(sql.match(/sleeve_spend__cost AS \(/g)).toHaveLength(1);
    expect(sql.match(/SELECT DISTINCT/g)).toHaveLength(1);
    expect(sql).toContain('SUM(_val) AS `spend__cost | SUM`');
    expect(sql).toContain('AVG(_val) AS `spend__cost | AVG`');
    expect(sql).toContain(
      'ANY_VALUE(sleeve_spend__cost.`spend__cost | SUM`) AS `spend__cost | SUM`'
    );
    expect(sql).toContain(
      'ANY_VALUE(sleeve_spend__cost.`spend__cost | AVG`) AS `spend__cost | AVG`'
    );
    // ONE join-back feeds both aggregates.
    expect(sql.match(/LEFT JOIN sleeve_spend__cost ON/g)).toHaveLength(1);
    expect(sql).toContain('GROUP BY\n  main.channel');
  });

  it('keeps a post-join filter before the GROUP BY (filters rows pre-aggregation)', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      filters: [{ column: 'channel', operator: 'eq', value: 'cpc' }],
    });

    expect(sql).toContain('WHERE main.channel = @p0');
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('GROUP BY\n  main.channel'));
  });

  it('truncates a date dimension and groups by the truncated qualified expression', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['date', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      dateTruncs: [{ column: 'date', unit: 'MONTH' }],
    });

    expect(sql).toContain('DATE_TRUNC(DATE(main.date), MONTH) AS `date`');
    expect(sql).toContain('GROUP BY\n  DATE_TRUNC(DATE(main.date), MONTH)');
  });

  // the sleeve's join-back dimension and the outer GROUP BY key are derived
  // independently, so the builder asserts they came out byte-identical. Inject exactly the
  // drift that already happened once (the sleeve projecting a date dimension untruncated) by
  // making the renderer's public sleeve entry point disagree with its own internal one.
  it('throws when a sleeve dimension drifts from the outer GROUP BY key', () => {
    class DriftingRenderer extends BigQueryClauseRenderer {
      renderDateTruncExpression(columnRef: string): string {
        return columnRef;
      }
    }
    class DriftingBuilder extends TestBlendedWithRenderer {
      protected get clauseRenderer() {
        return new DriftingRenderer();
      }
    }

    expect(() =>
      new DriftingBuilder().buildBlendedQuery({
        ...buildContext([spendChain()], ['date', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        dateTruncs: [{ column: 'date', unit: 'MONTH' }],
      })
    ).toThrow(/not one of the outer GROUP BY keys/);
  });

  it('accepts a date-trunc dimension when both renderings agree (guard has no false positive)', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['date', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      dateTruncs: [{ column: 'date', unit: 'MONTH' }],
    });

    expect(sql).toContain('GROUP BY\n  DATE_TRUNC(DATE(main.date), MONTH)');
    expect(sql).toContain('sleeve_spend__cost AS (');
  });

  // Totals under a metric filter: a Totals query has no GROUP BY, so the report's HAVING cannot
  // apply there — it travels as a `groupRestriction` instead. The builder recomputes the
  // surviving groups and semi-joins them, so Totals summarise exactly the rows the report shows.
  // Restricting ROWS (not adding up per-group values) is what keeps a joined COUNT DISTINCT
  // right: an entity present in two surviving groups still counts once.
  describe('Totals restricted to the groups a metric filter keeps', () => {
    it('emits the kept-groups CTE with the report GROUP BY + HAVING and joins it', () => {
      const { sql, params } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        groupRestriction: {
          dimensions: ['channel'],
          having: [
            {
              column: 'clicks',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });
      const s = normalizeSql(sql);

      // The report's own grain and its metric filter decide which groups survive...
      expect(s).toContain('_kept_groups AS (');
      expect(s).toContain('GROUP BY main.channel');
      expect(s).toContain('HAVING SUM(main.clicks) > @kgh0');
      // ...and the Totals body is restricted to their rows, with no GROUP BY of its own.
      // The key is projected under a PRIVATE alias, not under the dimension's own name: the
      // restriction is joined into queries whose columns are unqualified on four of the five
      // dialects, where a same-named column makes every outer reference ambiguous.
      expect(s).toContain('SELECT main.channel AS _owox_kg_0');
      expect(s).toContain('JOIN _kept_groups ON ((main.channel) = (_kept_groups._owox_kg_0)');
      expect(params.map(p => p.value)).toContain(10);
    });

    /**
     * A ROW-LEVEL calculated field is a real grouping key of the report, so
     * the restriction has to reproduce it — one key coarser and the metric filter keeps a
     * different row set than the report shows, which is a wrong number rather than an error. The
     * flat renderer already does this; these are the two halves the blended builder was missing.
     */
    describe('a row-level calculated dimension in the restriction', () => {
      const SESSION_KEY_SQL = 'CONCAT(main.session_id, main.user_id)';
      const restrictedContext = (): BlendedQueryContext => ({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        groupRestriction: {
          dimensions: ['channel', 'session_key'],
          calculatedDimensions: [
            {
              outputName: 'session_key',
              type: 'STRING',
              level: 'column',
              formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
            },
          ],
          having: [
            {
              column: 'clicks',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });

      it('regroups the kept-groups CTE by the expression, after every column key', () => {
        const { sql } = builder.buildBlendedQuery(restrictedContext());
        const cte = normalizeSql(sql).split('_kept_groups AS (')[1]?.split(') SELECT')[0] ?? '';

        expect(cte).toContain(`${SESSION_KEY_SQL} AS _owox_kg_1`);
        expect(cte).toContain(`GROUP BY main.channel, ${SESSION_KEY_SQL}`);
        // Its NAME is never projected: the positional private alias is the whole point.
        expect(cte).not.toContain('session_key');
      });

      it('joins the outer query back on that same expression', () => {
        const { sql } = builder.buildBlendedQuery(restrictedContext());

        expect(sql).toContain('JOIN _kept_groups ON ((main.channel) = (_kept_groups._owox_kg_0)');
        expect(sql).toContain(`AND ((${SESSION_KEY_SQL}) = (_kept_groups._owox_kg_1)`);
      });

      // The half that bites. `referencedColumns` takes the restriction's dimension NAMES, and the
      // loop that strips calculated names knew only about `context.calculatedFields` — from which
      // a Totals plan deliberately excludes every row-level field. Left alone the main CTE emitted
      // `SELECT session_key FROM <main table>`: `Unrecognized name`.
      it('projects the columns the formula reads into the main CTE, and not its name', () => {
        const { sql } = builder.buildBlendedQuery(restrictedContext());
        const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);

        expect(mainCte).not.toBeNull();
        expect(mainCte![1]).toContain('session_id');
        expect(mainCte![1]).toContain('user_id');
        expect(mainCte![1]).not.toContain('session_key');
      });

      // The sleeve reads the SAME join clause, and its FROM starts at `main` — so the expression
      // resolves there unchanged, and the sleeve aggregates exactly the rows the report shows.
      it('reuses the join verbatim inside the metric sleeve', () => {
        const { sql } = builder.buildBlendedQuery(restrictedContext());
        const sleeveBody = normalizeSql(sql).split('sleeve_spend__cost AS (')[1] ?? '';

        expect(sleeveBody).toContain(`AND ((${SESSION_KEY_SQL}) = (_kept_groups._owox_kg_1)`);
      });

      // An AGGREGATE-level plan contributes NO grouping key, so the calculated keys are a filtered
      // SUBSEQUENCE of `calculatedDimensions` and the positional list must be rebuilt from that
      // same filtered array — pairing against the unfiltered one shifts every later key onto the
      // wrong dimension, silently.
      it('ignores an aggregate-level plan in the restriction rather than pairing against it', () => {
        const context = restrictedContext();
        const { sql } = builder.buildBlendedQuery({
          ...context,
          groupRestriction: {
            ...context.groupRestriction!,
            calculatedDimensions: [
              {
                outputName: 'ctr',
                type: 'FLOAT',
                level: 'metric',
                formula:
                  'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
              },
              ...context.groupRestriction!.calculatedDimensions!,
            ],
          },
        });
        const cte = normalizeSql(sql).split('_kept_groups AS (')[1]?.split(') SELECT')[0] ?? '';

        expect(cte).toContain(`${SESSION_KEY_SQL} AS _owox_kg_1`);
        expect(cte).not.toContain('_owox_kg_2');
        expect(cte).not.toContain('ctr');
      });

      /**
       * The THIRD channel of the bug class the selected and the filtered plans just closed, and the
       * one the Totals path opens by design: a Totals plan projects no dimensions, so its row-level
       * fields are deliberately absent from `calculatedFields` and travel here instead — where the
       * two ownership guards, which walked those two lists, never saw them.
       *
       * A row-level formula reads its own Data Mart only. One that names a joined field
       * has nothing to route it: no sleeve is planned for a restriction dimension. It does NOT fail
       * loudly — the reference resolves through the shared options object to the joined mart's DEDUP
       * CTE, so the CTE emitted `GROUP BY main.channel, CONCAT(spend.spend__cost)` and the sleeve
       * joined back on that same string. Valid SQL that runs, keying the restriction on the joined
       * mart's post-roll-up value instead of the report's grain: Totals then cover a different row
       * set than the report shows, with nothing anywhere to say so.
       *
       * Latent in production today only because the report query beside this one carries the same
       * field in `calculatedFields` and refuses first. That is protection by call order — the
       * composer's own comment says the precondition holds "by call order alone" — and this branch
       * has had two guards expire on exactly that reasoning.
       */
      it('refuses a joined reference in a restriction dimension’s formula', () => {
        const context = restrictedContext();

        expect(() =>
          builder.buildBlendedQuery({
            ...context,
            groupRestriction: {
              ...context.groupRestriction!,
              calculatedDimensions: [
                {
                  outputName: 'session_key',
                  type: 'STRING',
                  level: 'column',
                  formula: 'CONCAT({{ref path="spend" field="cost"}})',
                },
              ],
            },
          })
        ).toThrow(BusinessViolationException);
      });

      // Once the REPORT aggregates it, the field is no longer a grouping key — so the
      // restriction, which reproduces the report's own grain, must stop reproducing it. Kept, the
      // CTE groups one key FINER than the report, its HAVING keeps a different row set, and Totals
      // come back plausibly wrong; since that refusal landed the whole blended Totals query throws
      // instead, because this CTE renders from an EMPTY rule list on purpose.
      it('drops a plan the report AGGREGATES, so the CTE stays at the report grain', () => {
        const context = restrictedContext();
        const { sql } = builder.buildBlendedQuery({
          ...context,
          groupRestriction: {
            ...context.groupRestriction!,
            // The composer builds `dimensions` from the grouping keys, so the name is gone here too.
            dimensions: ['channel'],
            calculatedDimensions: context.groupRestriction!.calculatedDimensions!.map(plan => ({
              ...plan,
              isAggregatedByReport: true,
            })),
          },
        });
        const cte = normalizeSql(sql).split('_kept_groups AS (')[1]?.split(') SELECT')[0] ?? '';

        expect(cte).toContain('GROUP BY main.channel');
        expect(cte).not.toContain('CONCAT(');
        expect(cte).not.toContain('_owox_kg_1');
        expect(sql).toContain('JOIN _kept_groups ON ((main.channel) = (_kept_groups._owox_kg_0)');
      });
    });

    it('restricts the metric sleeve too, so a joined COUNT DISTINCT ignores hidden groups', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        groupRestriction: {
          dimensions: ['channel'],
          having: [
            {
              column: 'clicks',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });
      const sleeveBody = normalizeSql(sql).split('sleeve_spend__cost AS (')[1] ?? '';

      // The sleeve reads RAW rows, so without this join it would aggregate entities whose group
      // the report hides — the exact discrepancy this restriction exists to remove.
      expect(sleeveBody).toContain('JOIN _kept_groups ON');
    });

    // A Totals plan makes every selected NUMERIC column a metric — including one the report
    // itself shows ungrouped as a plain dimension. Rendering the restriction with those rules
    // turned that dimension into `SUM(x) AS "x | SUM"`, so it dropped out of the GROUP BY (the
    // HAVING was then evaluated at the wrong grain) and the join referenced a key the subquery
    // never projected.
    it('keeps a restriction dimension that is ALSO a totals metric as a grouping key', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['clicks']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'clicks', function: 'SUM' }],
        groupRestriction: {
          dimensions: ['clicks'],
          having: [
            {
              column: 'clicks',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });
      const cte = normalizeSql(sql).split('_kept_groups AS (')[1]?.split(') SELECT')[0] ?? '';

      expect(cte).toContain('SELECT main.clicks AS _owox_kg_0');
      expect(cte).toContain('GROUP BY main.clicks');
      expect(cte).not.toContain('clicks | SUM');
    });

    // The restriction's join qualifies each dimension as `<dedupCte>.<col>`, so a JOINED
    // dimension needs that dedup CTE in the sleeve's own FROM. A Totals sleeve has no dimensions
    // of its own, so nothing else pulls it in — the sleeve subquery referenced a CTE it never
    // joined ("Unrecognized name: spend").
    it('joins the dedup CTE of a JOINED restriction dimension inside the sleeve', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        groupRestriction: {
          dimensions: ['spend__cost'],
          having: [
            {
              column: 'clicks',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });
      const sleeveBody = normalizeSql(sql).split('sleeve_spend__cost AS (')[1] ?? '';

      expect(sleeveBody).toContain('JOIN _kept_groups ON ((spend.spend__cost) = ');
      // The dedup CTE the join's left-hand side reads must be in the sleeve's own FROM.
      expect(sleeveBody.indexOf('LEFT JOIN spend ON')).toBeGreaterThan(-1);
      expect(sleeveBody.indexOf('LEFT JOIN spend ON')).toBeLessThan(
        sleeveBody.indexOf('JOIN _kept_groups ON')
      );
    });

    // A metrics-only report (no dimensions at all) is what `query_data_mart` emits for
    // "total revenue, only if above 1000". With nothing to project, the CTE body came out as a
    // bare `SELECT` followed by FROM — a syntax error on every engine.
    it('projects a constant and cross-joins when the report has no dimensions', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        groupRestriction: {
          dimensions: [],
          having: [
            {
              column: 'clicks',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });
      const s = normalizeSql(sql);

      expect(s).toContain('_kept_groups AS ( SELECT 1 AS _owox_kg_0 FROM main');
      expect(s).toContain('CROSS JOIN _kept_groups');
      expect(s).not.toMatch(/SELECT\s+FROM/);
    });

    // The same invariant the outer HAVING has: a metric filter on a SLEEVE-routed joined metric
    // would be rendered here from the dedup CTE, filtering on a different value than the sleeve
    // returns. The rules travel in `groupRestriction.having`, so a guard reading only the outer
    // filters never saw them.
    it('refuses a restriction whose HAVING targets a sleeve-routed joined metric', () => {
      expect(() =>
        builder.buildBlendedQuery({
          ...buildContext([spendChain()], ['spend__cost']),
          fieldIndex: spendFieldIndex,
          aggregations: [{ column: 'spend__cost', function: 'SUM' }],
          groupRestriction: {
            dimensions: ['channel'],
            having: [
              {
                column: 'spend__cost',
                function: 'SUM',
                operator: 'gt',
                value: 10,
                placement: 'post-join',
              },
            ] as never,
          },
        })
      ).toThrow(/target a sleeve-routed joined metric/);
    });

    // Nothing in the outer SELECT mentions the restriction's dimensions or its HAVING columns, so
    // the source CTEs only carry them if the restriction is counted as a reference. It was not:
    // the emitted query failed at the warehouse with "Name weight not found inside main".
    it('projects the restriction dimensions AND its HAVING columns into the source CTEs', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        groupRestriction: {
          dimensions: ['country'],
          having: [
            {
              column: 'weight',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });
      const mainCte = normalizeSql(sql).split('main AS (')[1]?.split(')')[0] ?? '';

      expect(mainCte).toContain('country');
      expect(mainCte).toContain('weight');
    });

    // `columnTypes` decides the NaN-safe leg of every join this feature emits, and no blended
    // spec passed it: deleting the argument left the whole suite green. GROUP BY buckets all NaNs
    // together, but `NaN = NaN` is FALSE on BigQuery and Trino, so without the extra leg a float
    // dimension holding a NaN lands in an outer group that matches no sleeve row — the metric
    // reads NULL, or 0 once a COUNT DISTINCT pull coalesces.
    it('adds the NaN-safe leg to the sleeve join-back for a float dimension only', () => {
      const withFloat = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['score', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        columnTypes: { postJoin: new Map([['score', 'FLOAT64']]) } as never,
      });
      const withString = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['score', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        columnTypes: { postJoin: new Map([['score', 'STRING']]) } as never,
      });

      expect(withFloat.sql).toContain('!=');
      expect(withString.sql).not.toContain('!=');
    });

    // The kept-groups semi-join reads the same type map, and got the same non-coverage.
    it('adds the NaN-safe leg to the kept-groups join for a float dimension', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        columnTypes: { postJoin: new Map([['score', 'FLOAT64']]) } as never,
        groupRestriction: {
          dimensions: ['score'],
          having: [
            {
              column: 'clicks',
              function: 'SUM',
              operator: 'gt',
              value: 10,
              placement: 'post-join',
            },
          ] as never,
        },
      });

      expect(sql).toContain('JOIN _kept_groups ON');
      expect(sql).toContain('!=');
    });

    // The headline ORDER BY fix was motivated by "it changes which rows survive LIMIT", yet no
    // blended test emitted a LIMIT on the aggregated path at all — so the clause that makes the
    // sort consequential was itself uncovered.
    it('applies LIMIT after ORDER BY on the aggregated path', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        sort: [{ column: 'spend__cost', direction: 'desc' }] as never,
        limit: 10,
      });

      expect(sql).toContain('LIMIT 10');
      // Order matters: a LIMIT before the sort would keep a different ten rows.
      expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT 10'));
      expect(sql.indexOf('GROUP BY')).toBeLessThan(sql.indexOf('ORDER BY'));
      // ...and the sort resolves to the sleeve's output alias, not a bare dedup-CTE column.
      expect(sql).toContain('ORDER BY\n  `spend__cost | SUM` DESC');
    });

    // The grain guards had no tests at all, including the one the code calls "the DANGEROUS one":
    // a sleeve at a COARSER grain hands one value to several outer groups through ANY_VALUE — a
    // plausible number, no NULL, no error. The real sleeve builder cannot produce that drift, so
    // the drift is injected on purpose.
    it('refuses a sleeve that carries FEWER dimensions than the outer query groups by', () => {
      const drifted = new TestBlendedWithDriftedSleeve(sleeve => ({ ...sleeve, dimRefs: [] }));
      const build = () =>
        drifted.buildBlendedQuery({
          ...buildContext([spendChain()], ['channel', 'spend__cost']),
          fieldIndex: spendFieldIndex,
          aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        });

      expect(build).toThrow(/groups by 0 dimension\(s\) but the outer query groups by 1/);
      expect(build).toThrow(/coarser grain/);
    });

    it('refuses a sleeve whose join-back key is not an outer GROUP BY key', () => {
      const drifted = new TestBlendedWithDriftedSleeve(sleeve => ({
        ...sleeve,
        dimRefs: sleeve.dimRefs.map(d => ({ ...d, outer: 'main.drifted' })),
      }));
      const build = () =>
        drifted.buildBlendedQuery({
          ...buildContext([spendChain()], ['channel', 'spend__cost']),
          fieldIndex: spendFieldIndex,
          aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        });

      expect(build).toThrow(/would join back on 'main.drifted'/);
      expect(build).toThrow(/silently match/);
    });

    it('emits no restriction when the report has no metric filter', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      });

      expect(sql).not.toContain('_kept_groups');
    });
  });

  // (tester): a HAVING on a MAIN-native metric alongside a joined sleeve metric is
  // legal and reachable, and nothing covered the two together — the sleeve's own WHERE copy and
  // the outer HAVING must both render, with their params in placeholder order.
  it('renders a HAVING on a main-native metric alongside a sleeve metric', () => {
    const { sql, params } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'clicks', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [
        { column: 'clicks', function: 'SUM' },
        { column: 'spend__cost', function: 'SUM' },
      ],
      filters: [
        { column: 'clicks', function: 'SUM', operator: 'gt', value: 10, placement: 'post-join' },
      ] as never,
    });

    expect(sql).toContain('sleeve_spend__cost AS (');
    expect(sql).toContain('HAVING SUM(main.clicks) > @h0');
    expect(params.map(p => p.value)).toEqual([10]);
  });

  // (round 4): the validator rejects HAVING on a sleeve-routed joined metric, but
  // the builder used to state that invariant only in a comment. HAVING renders from the dedup
  // CTE, so it would filter on a different value than the SELECT returns.
  it('throws when a metric filter targets a sleeve-routed joined metric', () => {
    expect(() =>
      builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [{ column: 'spend__cost', function: 'SUM' }],
        filters: [
          {
            column: 'spend__cost',
            function: 'SUM',
            operator: 'gt',
            value: 100,
            placement: 'post-join',
          },
        ] as never,
      })
    ).toThrow(/target a sleeve-routed joined metric/);
  });

  // (round 4) Critical: a column can carry a sleeve function AND a non-sleeve one.
  // `agg.aliasByColumn` only sees the non-sleeve ones, so resolving ORDER BY from it alone
  // silently re-points an existing report's sort at a different metric — different top-N under
  // LIMIT, no error, and `SortRule` carries no function so the user cannot say what they meant.
  // The documented contract is "first aggregation in RULE order".
  describe('ORDER BY alias resolution on a multi-aggregated column', () => {
    it('resolves to the FIRST rule even when that rule is the sleeve-routed one', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [
          { column: 'spend__cost', function: 'SUM' },
          { column: 'spend__cost', function: 'MAX' },
        ],
        sort: [{ column: 'spend__cost', direction: 'desc' }],
      });

      expect(sql).toContain('ORDER BY\n  `spend__cost | SUM` DESC');
      expect(sql).not.toContain('`spend__cost | MAX` DESC');
    });

    it('resolves to the FIRST rule whichever function it carries', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'spend__cost']),
        fieldIndex: spendFieldIndex,
        aggregations: [
          { column: 'spend__cost', function: 'MAX' },
          { column: 'spend__cost', function: 'SUM' },
        ],
        sort: [{ column: 'spend__cost', direction: 'desc' }],
      });

      expect(sql).toContain('ORDER BY\n  `spend__cost | MAX` DESC');
    });

    it('leaves a main-native multi-aggregated column on its first rule (unchanged)', () => {
      const { sql } = builder.buildBlendedQuery({
        ...buildContext([spendChain()], ['channel', 'clicks']),
        fieldIndex: spendFieldIndex,
        aggregations: [
          { column: 'clicks', function: 'MIN' },
          { column: 'clicks', function: 'MAX' },
        ],
        sort: [{ column: 'clicks', direction: 'asc' }],
      });

      expect(sql).toContain('ORDER BY\n  `clicks | MIN` ASC');
    });
  });

  it('emits sleeve pulls AFTER the non-sleeve select items, so SELECT order != header order', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
    });

    // The dimension is a non-sleeve select item; the sleeve pull is appended after it, while
    // `resolveReportDataHeaders` keeps the metric header at its own column's position. Readers
    // bind result columns to headers BY NAME, which is what makes this divergence safe.
    const dimensionAt = sql.indexOf('main.channel AS `channel`');
    const sleevePullAt = sql.indexOf('ANY_VALUE(sleeve_spend__cost.`spend__cost | SUM`)');
    expect(dimensionAt).toBeGreaterThan(-1);
    expect(sleevePullAt).toBeGreaterThan(dimensionAt);
  });

  it('does not aggregate when no aggregation/date-trunc is requested', () => {
    const { sql } = builder.buildBlendedQuery(
      buildContext([spendChain()], ['channel', 'spend__cost'])
    );

    expect(sql).not.toContain('GROUP BY main.');
    expect(sql).not.toContain(' | ');
    expect(sql).toContain('main.channel');
    expect(sql).toContain('spend.spend__cost');
  });

  it('emits COUNT(DISTINCT pk) Unique Count when uniqueCount=true with a single PK', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      uniqueCount: true,
      primaryKeyColumns: ['user_id'],
    });

    expect(sql).toContain('COUNT(DISTINCT main.user_id) AS `Unique Count`');
  });

  it('emits COUNT(DISTINCT CASE WHEN ... END) Unique Count when uniqueCount=true with composite PK', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      uniqueCount: true,
      primaryKeyColumns: ['project_id', 'user_id'],
    });

    expect(sql).toContain('COUNT(DISTINCT CASE WHEN ');
    expect(sql).toContain('main.project_id IS NULL OR main.user_id IS NULL THEN NULL ELSE CONCAT(');
    expect(sql).toContain('CAST(main.project_id AS STRING)');
    expect(sql).toContain('CAST(main.user_id AS STRING)');
    expect(sql).toContain('AS `Unique Count`');
  });

  it('does not emit Unique Count when uniqueCount=false', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      uniqueCount: false,
      primaryKeyColumns: ['user_id'],
    });

    expect(sql).not.toContain('Unique Count');
  });

  it('does not emit Unique Count when primaryKeyColumns is empty', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      uniqueCount: true,
      primaryKeyColumns: [],
    });

    expect(sql).not.toContain('Unique Count');
  });

  it('triggers aggregation path when only uniqueCount+PK is set (no aggregationConfig)', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      uniqueCount: true,
      primaryKeyColumns: ['user_id'],
    });

    expect(sql).toContain('COUNT(DISTINCT main.user_id) AS `Unique Count`');
    expect(sql).toContain('GROUP BY');
  });

  // Regression: `Unique Count` is an OUTER-SELECT alias, not a column of any CTE. The
  // sort-derived refs feed the main raw CTE projection, so an unfiltered sort column would
  // emit `SELECT \`Unique Count\` FROM main_table` — a column that does not exist.
  it('does NOT project the synthetic Unique Count label into the main raw CTE when sorted by it', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['channel', 'spend__cost']),
      fieldIndex: spendFieldIndex,
      aggregations: [{ column: 'spend__cost', function: 'SUM' }],
      uniqueCount: true,
      primaryKeyColumns: ['user_id'],
      sort: [{ column: 'Unique Count', direction: 'desc' }],
    });

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).not.toContain('Unique Count');
    // The PK is still projected (Unique Count aggregates it) and the outer ORDER BY still works.
    expect(mainCte![1]).toContain('user_id');
    expect(sql).toContain('COUNT(DISTINCT main.user_id) AS `Unique Count`');
    expect(sql).toContain('ORDER BY\n  `Unique Count` DESC');
  });

  // A real main-mart column legitimately named `Unique Count` must still reach the CTE —
  // it arrives via `columns`, so the synthetic exclusion must not strip it.
  it('still projects a REAL main column named "Unique Count" into the main raw CTE', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([spendChain()], ['Unique Count', 'spend__cost']),
      sort: [{ column: 'Unique Count', direction: 'desc' }],
    });

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('Unique Count');
  });
});

/**
 * A main-owner calculated field on a report that ALSO spans a joined Data Mart. The
 * bottom-up join leaves at most one row per main-mart row, so `SUM(clicks)` inside a formula is
 * the same grain — and the same render site — as the already-shipped `SUM(spend__cost)`.
 */
describe('AbstractBlendedQueryBuilder — calculated field', () => {
  let builder: TestBlendedWithRenderer;
  const buildContext = createBuildContext('main_table');

  const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';
  const ctrMetric: CalculatedFieldPlan = {
    outputName: 'ctr',
    type: 'FLOAT',
    formula: CTR_FORMULA,
    level: 'metric',
  };
  // The rendered metric, qualified against `main` by the SAME resolver every other outer-SELECT
  // reference goes through.
  const CTR_SELECT_ITEM = 'SUM(main.clicks) / NULLIF(SUM(main.impressions), 0) AS `ctr`';

  beforeEach(() => {
    builder = new TestBlendedWithRenderer();
  });

  function ordersChain() {
    return makeChain({
      relationship: makeRelationship({
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
      }),
      targetTableReference: 'orders_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'country',
          outputAlias: 'orders__country',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
  }

  it('substitutes the formula in the outer SELECT and projects the columns it reads', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['orders__country']),
      calculatedFields: [ctrMetric],
    });

    expect(sql).toContain(CTR_SELECT_ITEM);
    // Nothing else references `clicks`/`impressions`, so only the formula can have put them in
    // the main raw CTE — without that the outer SELECT reads columns the CTE never projected.
    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('clicks');
    expect(mainCte![1]).toContain('impressions');
    // Already an aggregate: grouped by the joined dimension only, never by the metric itself.
    expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toBe('GROUP BY\n  orders.orders__country');
  });

  it('makes the query aggregated on its own, with no aggregation rules at all', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['channel', 'orders__country']),
      calculatedFields: [ctrMetric],
    });

    expect(sql).toContain(CTR_SELECT_ITEM);
    expect(sql).toContain('GROUP BY\n  main.channel,\n  orders.orders__country');
  });

  // A formula that reads another formula. The main CTE's projection is derived from the
  // formulas this query RENDERS, and a dependency is one of them — so both halves of that
  // derivation have to walk the closure, not just the top-level plans.
  const revenueMetric: CalculatedFieldPlan = {
    outputName: 'revenue_metric',
    type: 'FLOAT',
    formula: 'SUM({{ref field="amount"}})',
    level: 'metric',
  };
  const costMetric: CalculatedFieldPlan = {
    outputName: 'cost_metric',
    type: 'FLOAT',
    formula: 'SUM({{ref field="spend"}})',
    level: 'metric',
  };
  const roasMetric: CalculatedFieldPlan = {
    outputName: 'roas',
    type: 'FLOAT',
    formula: '{{ref field="revenue_metric"}} / NULLIF({{ref field="cost_metric"}}, 0)',
    level: 'metric',
    dependencies: [revenueMetric, costMetric],
  };

  // Kills "collect own-mart references from the top-level plans only": the outer SELECT emits
  // `SUM(main.amount)` over a main CTE that never projected `amount` — `Unrecognized name` on
  // every dialect, on every blended report selecting this metric.
  it('projects the columns a DEPENDENCY reads into the main CTE', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['orders__country']),
      calculatedFields: [roasMetric],
    });

    expect(sql).toContain('(SUM(main.amount)) / NULLIF((SUM(main.spend)), 0) AS `roas`');
    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    // Nothing else references them, so only the dependencies' formulas can have put them here.
    expect(mainCte![1]).toContain('amount');
    expect(mainCte![1]).toContain('spend');
  });

  // The other half, and the one the file's own comment at the delete loop states as a rule: no
  // warehouse column can own a calculated field's name, so a dependency's NAME must never reach
  // the main raw CTE either. Kills "delete only the top-level plans' outputNames".
  it('keeps a DEPENDENCY’s name out of the main CTE', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['orders__country']),
      calculatedFields: [roasMetric],
    });

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).not.toContain('revenue_metric');
    expect(mainCte![1]).not.toContain('cost_metric');
  });

  // The row-level shape fails identically, and it is the one the metric sleeve also reads: the
  // outer GROUP BY and `_owox_dim_1` both render `CONCAT(CONCAT(main.first_name, …), …)`.
  it('projects a row-level dependency’s columns, and not its name, into the main CTE', () => {
    const initials: CalculatedFieldPlan = {
      outputName: 'initials',
      type: 'STRING',
      formula: 'CONCAT({{ref field="first_name"}}, {{ref field="last_name"}})',
      level: 'column',
    };
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['orders__country']),
      calculatedFields: [
        {
          outputName: 'session_key',
          type: 'STRING',
          formula: 'CONCAT({{ref field="initials"}}, {{ref field="visit_id"}})',
          level: 'column',
          dependencies: [initials],
        },
      ],
    });

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('first_name');
    expect(mainCte![1]).toContain('last_name');
    expect(mainCte![1]).toContain('visit_id');
    expect(mainCte![1]).not.toContain('initials');
  });

  // The mirror image, and the reason the flip reads the LEVEL rather than the count: a row-level
  // formula is a dimension, so it must not turn a plain blended projection into a grouped one.
  //
  // Only the flip is pinned here. What that ungrouped SELECT projects is the PLAIN blended path's
  // own question, and that path has no calculated channel yet — the grouped path's
  // rendering is pinned in its own describe below.
  it('does not force the grouped shape when the only calculated field is row-level', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['channel', 'orders__country']),
      calculatedFields: [
        {
          outputName: 'session_key',
          type: 'STRING',
          formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
          level: 'column',
        },
      ],
    });

    // The OUTER query only: each source CTE keeps its own dedup GROUP BY regardless.
    expect(sql.slice(sql.lastIndexOf('\n\nSELECT\n'))).not.toContain('GROUP BY');
  });

  it('renders alongside a joined Unique Count without disturbing the sleeve grain', () => {
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'orders__country',
          aliasPath: 'orders',
          originalFieldName: 'country',
          type: 'STRING',
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
    } as never);

    // The sleeve grain assertions compare `dimRefs.length` against `groupByParts.length`, so a
    // metric that leaked into GROUP BY would throw here rather than silently mis-group.
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['channel']),
      fieldIndex,
      calculatedFields: [ctrMetric],
      uniqueCountSources: [
        {
          aliasPath: 'orders',
          cteName: 'orders',
          pkColumns: ['order_id'],
          outputLabel: 'orders__unique_count',
        },
      ],
    });

    expect(sql).toContain(CTR_SELECT_ITEM);
    expect(sql).toContain(
      'COALESCE(ANY_VALUE(sleeve_uc_orders.orders__unique_count), 0) AS orders__unique_count'
    );
    // The sleeve path adds projections of its own to the raw CTEs; the formula's columns must
    // still reach the main one alongside them.
    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('clicks');
    expect(mainCte![1]).toContain('impressions');
    expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toBe('GROUP BY\n  main.channel');
  });

  // Sorting by a calculated field is SUPPORTED and `validateSort` only checks the column is
  // selected — so this saves as a 200 and
  // then has to run. The metric's name is an outer-SELECT alias, never a warehouse column: leaving
  // it in `referencedColumns` put it in the main raw CTE's projection and every run, Looker fetch
  // and HTTP-Data stream failed with `Unrecognized name: ctr`.
  it('sorts by the metric without projecting its name into the main raw CTE', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['orders__country']),
      calculatedFields: [ctrMetric],
      sort: [{ column: 'ctr', direction: 'desc' }],
    });

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).not.toContain('ctr');
    // The columns the formula actually reads still have to be there.
    expect(mainCte![1]).toContain('clicks');
    expect(mainCte![1]).toContain('impressions');
    expect(sql).toContain(CTR_SELECT_ITEM);
    // A FLOAT-declared metric sorts by the same cast expression its filter would compare, extended
    // to the sort: ordering the bare alias sorted the formula's text, which under a
    // LIMIT returns a different ROW SET. The alias itself cannot be wrapped — Redshift does not
    // resolve an output name inside an ORDER BY expression — so the expression is repeated.
    expect(sql).toContain(
      'ORDER BY\n  CAST((SUM(main.clicks) / NULLIF(SUM(main.impressions), 0)) AS FLOAT64) DESC'
    );
    expect(sql).not.toContain('ORDER BY\n  `ctr` DESC');
  });

  // A predicate on a Calculated Field compares its FORMULA. It travels on its own
  // channel because the field need not be SELECTED to be filtered on — and an aggregate-level
  // PREDICATE forces the grouped shape exactly as selecting one does, or this takes the ungrouped
  // branch where `assertNoHavingRules` refuses a predicate that belongs to no clause.
  it('groups the query and compares the formula in HAVING for a filter on an unselected metric', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['orders__country']),
      calculatedFilterMetrics: [ctrMetric],
      filters: [
        { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
      ] satisfies RoutedFilterRule[],
    });

    // Both sides carry the DECLARED type; the VALUE's half appears only because
    // `partitionBlendedFilters` answers a Calculated Field with its declaration.
    expect(sql).toContain(
      'HAVING CAST((SUM(main.clicks) / NULLIF(SUM(main.impressions), 0)) AS FLOAT64) > ' +
        'CAST(@h0 AS FLOAT64)'
    );
    // Filtered, not selected: never projected, and never a column of any CTE.
    expect(sql).not.toContain(CTR_SELECT_ITEM);
    expect(sql).not.toContain('main.ctr');
    // The columns the formula READS still have to reach the main raw CTE, and its own NAME must
    // not: the filter puts `ctr` in the referenced-column set, and nothing else takes it out.
    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('clicks');
    expect(mainCte![1]).toContain('impressions');
    expect(mainCte![1]).not.toContain('ctr');
  });

  // An analyst who comments a reference out instead of deleting it leaves a tag naming a column
  // that may since have been dropped: every other reader on this branch is live-only, so the
  // metric reports healthy, the picker offers it and the flat report runs — while the blended one
  // failed in the warehouse with `Unrecognized name: legacy_cost` from a CTE nobody can see.
  it('keeps a COMMENTED-OUT own reference out of the main raw CTE', () => {
    const { sql } = builder.buildBlendedQuery({
      ...buildContext([ordersChain()], ['orders__country']),
      calculatedFields: [
        {
          outputName: 'clicks_total',
          type: 'FLOAT',
          formula: 'SUM({{ref field="clicks"}}) /* was {{ref field="legacy_cost"}} */',
          level: 'metric',
        },
      ],
    });

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('clicks');
    expect(mainCte![1]).not.toContain('legacy_cost');
  });
});

/**
 * A ROW-LEVEL calculated field on a report that spans a join. It is a DIMENSION:
 * the outer query groups by its rendered expression, so every metric sleeve has to carry that same
 * key. A sleeve left at the coarser grain would join one of its rows against several outer groups
 * and `ANY_VALUE` would hand each of them a value computed over all of them — a plausible number,
 * with no NULL and no warehouse error to show for it.
 */
describe('AbstractBlendedQueryBuilder — a row-level calculated field on a joined report', () => {
  const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';
  const SESSION_KEY_SQL = 'CONCAT(main.session_id, main.user_id)';
  const sessionKey: CalculatedFieldPlan = {
    outputName: 'session_key',
    type: 'STRING',
    formula: SESSION_KEY_FORMULA,
    level: 'column',
  };

  const costChain = (): ResolvedRelationshipChain =>
    makeChain({
      relationship: makeRelationship({
        targetAlias: 'spend',
        joinConditions: [{ sourceFieldName: 'date', targetFieldName: 'date' }],
      }),
      targetTableReference: 'spend_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'cost',
          outputAlias: 'spend__cost',
          isHidden: false,
          aggregateFunction: 'SUM',
        },
      ],
    });

  const costFieldIndex = buildBlendedFieldIndex({
    blendedFields: [
      { name: 'spend__cost', aliasPath: 'spend', originalFieldName: 'cost', type: 'FLOAT' },
    ],
    availableSources: [{ aliasPath: 'spend', isIncluded: true }],
  } as never);

  // A joined SUM routes through a value sleeve, which is the whole reason the grain has to agree.
  const joinedContext = (): BlendedQueryContext => ({
    ...buildContext([costChain()], ['channel', 'spend__cost']),
    fieldIndex: costFieldIndex,
    calculatedFields: [sessionKey],
    aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
  });

  it('groups the outer query by the formula and gives the sleeve the identical key', () => {
    const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(joinedContext());

    expect(sql).toContain(`${SESSION_KEY_SQL} AS \`session_key\``);
    expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toBe(
      `GROUP BY\n  main.channel,\n  ${SESSION_KEY_SQL}`
    );
    // Byte-identical by construction: the sleeve and the outer SELECT render this through one
    // method with one options object, so the NULL-safe join-back below can only ever match.
    expect(sql).toContain(`${SESSION_KEY_SQL} AS _owox_dim_1`);
    expect(sql).toContain(
      `((${SESSION_KEY_SQL}) = (sleeve_spend__cost._owox_dim_1) OR ` +
        `((${SESSION_KEY_SQL}) IS NULL AND (sleeve_spend__cost._owox_dim_1) IS NULL))`
    );
  });

  // The columns the formula reads are referenced by nothing else, so only the formula can have put
  // them there — and the field's own NAME is an outer-SELECT alias no CTE may project.
  it('projects the columns the formula reads into the main CTE, and not its name', () => {
    const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(joinedContext());

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('session_id');
    expect(mainCte![1]).toContain('user_id');
    expect(mainCte![1]).not.toContain('session_key');
  });

  // Keyed by column NAME in `columnTypes.postJoin` — and that map DOES hold a calculated field:
  // `blended-report-data.service.ts` builds it from the schema and `isConnected` keeps a calculated
  // field in (`data-mart-schema.utils.ts`). So the leg follows the analyst's DECLARED type, exactly
  // as it does on the flat path (`kept-groups-join.spec.ts`, "takes the NaN-safe leg from the
  // calculated field own declared type"). The fixture therefore carries the type production would.
  it('adds no NaN-safe leg for a calculated key declared non-float', () => {
    const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
      ...joinedContext(),
      columnTypes: {
        postJoin: new Map([
          ['channel', 'STRING'],
          ['session_key', 'STRING'],
        ]),
      },
    });

    expect(sql).not.toContain(`(${SESSION_KEY_SQL}) != (${SESSION_KEY_SQL})`);
  });

  // The other half of the same rule. `x != x` is legal for any scalar on all five dialects and is
  // false for every non-NaN value, so a declared type that lies costs nothing; a truthful FLOAT
  // declaration is what keeps a NaN group in Totals.
  it('adds the NaN-safe leg for a calculated key declared float', () => {
    const MARGIN_SQL = '(main.revenue - main.discount)';
    const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
      ...joinedContext(),
      calculatedFields: [
        {
          outputName: 'margin',
          type: 'FLOAT',
          formula: '({{ref field="revenue"}} - {{ref field="discount"}})',
          level: 'column',
        },
      ],
      columnTypes: {
        postJoin: new Map([
          ['channel', 'STRING'],
          ['margin', 'FLOAT64'],
        ]),
      },
    });

    expect(sql).toContain(
      `OR ((${MARGIN_SQL}) != (${MARGIN_SQL}) AND ` +
        `(sleeve_spend__cost._owox_dim_1) != (sleeve_spend__cost._owox_dim_1))`
    );
  });

  // The safety net, exercised in the DANGEROUS direction. The real builder cannot produce this
  // drift, so the only way to see the guard work is to introduce it: a sleeve whose grain stops at
  // the column dimension while the outer query also groups by the formula.
  it('refuses a sleeve that stayed at the coarser grain when the formula was added', () => {
    const drifted = new TestBlendedWithDriftedSleeve(sleeve => ({
      ...sleeve,
      dimRefs: sleeve.dimRefs.filter(d => d.column !== 'session_key'),
    }));

    expect(() => drifted.buildBlendedQuery(joinedContext())).toThrow(
      /groups by 1 dimension\(s\) but the outer query groups by 2/
    );
    expect(() => drifted.buildBlendedQuery(joinedContext())).toThrow(/coarser grain/);
  });

  /**
   * The report may apply an aggregation to the field, and it then stops being a
   * grouping key — of the OUTER query and of every SLEEVE, together. One key out of step and the
   * sleeve's join-back matches nothing: NULL, or 0 once the COUNT_DISTINCT pull coalesces.
   */
  describe('once the report aggregates it', () => {
    const aggregatedContext = (): BlendedQueryContext => ({
      ...joinedContext(),
      calculatedFields: [{ ...sessionKey, isAggregatedByReport: true }],
      aggregations: [
        { column: 'spend__cost', function: 'SUM' },
        { column: 'session_key', function: 'COUNT_DISTINCT' },
      ] as AggregationRule[],
    });

    it('drops it from the outer GROUP BY and from the sleeve grain together', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(aggregatedContext());

      expect(sql).toContain(
        `COUNT(DISTINCT (${SESSION_KEY_SQL})) AS \`session_key | COUNTUNIQUE\``
      );
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toBe('GROUP BY\n  main.channel');
      // The sleeve's grain moves with the outer one: a second key here and its join-back below
      // would match no row at all.
      expect(sql).not.toContain('_owox_dim_1');
      expect(sql).toContain('(main.channel) = (sleeve_spend__cost._owox_dim_0)');
      // It no longer projects under its bare name either — the header binds to the label.
      expect(sql).not.toContain('AS `session_key`');
    });

    // A blended report with NO sleeve reaches neither the count nor the membership assertion, so
    // the guard that makes a half-applied change loud is simply absent there. Hence its own test —
    // and the grain check inside `buildAll`, which runs whether or not a sleeve exists.
    it('drops it from the grouping keys on a blended report that carries no sleeve', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
        ...buildContext([costChain()], ['channel']),
        fieldIndex: costFieldIndex,
        calculatedFields: [{ ...sessionKey, isAggregatedByReport: true }],
        aggregations: [{ column: 'session_key', function: 'COUNT_DISTINCT' }] as AggregationRule[],
      });

      expect(sql).not.toContain('sleeve_');
      expect(sql).toContain(
        `COUNT(DISTINCT (${SESSION_KEY_SQL})) AS \`session_key | COUNTUNIQUE\``
      );
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toBe('GROUP BY\n  main.channel');
    });

    // The blended half of probe shape 4b. The outer SELECT casts the substituted
    // formula to the declared type before SUM reads it; a metric filter over that same aggregation
    // must compare the SAME string. Where it re-derived its own left-hand side, Redshift printed
    // `1.75` for a group and then dropped it for failing `> 1.5`, having truncated the uncast
    // value to `1`. Read out of one rendered query, so the relationship is what is asserted.
    it('compares the metric filter against the aggregate the outer SELECT prints', () => {
      const numericText: CalculatedFieldPlan = {
        ...sessionKey,
        // Declared FLOAT over a text formula: legal (a declaration is never validated against the
        // formula) and the shape that makes the cast observable.
        type: 'FLOAT',
        isAggregatedByReport: true,
      };
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
        ...joinedContext(),
        calculatedFields: [numericText],
        aggregations: [
          { column: 'spend__cost', function: 'SUM' },
          { column: 'session_key', function: 'SUM' },
        ] as AggregationRule[],
        filters: [{ column: 'session_key', function: 'SUM', operator: 'gt', value: 1.5 }],
      });

      const projected = / {2}(SUM\(.+?\)) AS `session_key \| SUM`/.exec(sql);
      expect(projected).not.toBeNull();
      expect(sql).toContain(`HAVING ${projected![1]} > @h0`);
      // Not a vacuous match: the projection casts here, and comparing the uncast value is exactly
      // what dropped the group whose printed number satisfied the filter.
      expect(projected![1]).toContain('CAST(');
    });

    // The hard guarantee behind the two moves: the sleeve grain is built from these plans alone, so
    // one that is not a grouping key widens every sleeve past the outer GROUP BY. Nothing in the
    // type system forces a caller to filter, so assert it where it cannot be skipped.
    it('refuses a plan that is not a grouping key, before any sleeve exists', () => {
      const builder = new TestBlendedWithRenderer();
      expect(() =>
        builder.sleeves().buildAll([], aggregatedContext(), {
          outputAliasToRoot: new Map(),
          filters: [],
          calculatedDimensions: {
            plans: new Map([['session_key', { ...sessionKey, isAggregatedByReport: true }]]),
            renderOptions: {},
          },
        })
      ).toThrow(/session_key/);
    });
  });

  /**
   * The report may BUCKET the field by date, and the outer GROUP BY key
   * is then the truncated expression. The sleeve has to reproduce both steps in the same order —
   * projecting the raw formula is the drift `abstract-blended-query-builder.ts` records as having
   * already happened once for an ordinary column, and a COUNT_DISTINCT pull would today COALESCE
   * that miss into a confident zero.
   */
  describe('once the report buckets it by date', () => {
    const VISIT_DAY_FORMULA = 'COALESCE({{ref field="visit_ts"}}, {{ref field="created_ts"}})';
    const VISIT_DAY_SQL = 'COALESCE(main.visit_ts, main.created_ts)';
    // DATE-declared, which is what makes the type argument observable: BigQuery's renderer wraps a
    // non-DATE expression in `DATE(...)` and leaves a DATE one bare.
    const visitDay: CalculatedFieldPlan = {
      outputName: 'visit_day',
      type: 'DATE',
      formula: VISIT_DAY_FORMULA,
      level: 'column',
    };
    const BUCKET_SQL = `DATE_TRUNC(${VISIT_DAY_SQL}, MONTH)`;

    const bucketedContext = (): BlendedQueryContext => ({
      ...joinedContext(),
      calculatedFields: [visitDay],
      dateTruncs: [{ column: 'visit_day', unit: 'MONTH' }],
    });

    it('gives the sleeve the truncated key, byte-identical to the outer GROUP BY', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(bucketedContext());

      expect(sql).toContain(`${BUCKET_SQL} AS \`visit_day\``);
      expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toBe(
        `GROUP BY\n  main.channel,\n  ${BUCKET_SQL}`
      );
      expect(sql).toContain(`${BUCKET_SQL} AS _owox_dim_1`);
      expect(sql).toContain(
        `((${BUCKET_SQL}) = (sleeve_spend__cost._owox_dim_1) OR ` +
          `((${BUCKET_SQL}) IS NULL AND (sleeve_spend__cost._owox_dim_1) IS NULL))`
      );
      // The raw formula must not survive as a key of its own on either side.
      expect(sql).not.toContain(`${VISIT_DAY_SQL} AS _owox_dim_1`);
    });

    // The probe measured `CAST(<expr> AS DATE)` returning `2026-05-01` on Redshift for a value
    // meaning the 5th of August, where the uncast shape errors — so a cast added here to "help" the
    // sleeve would trade a loud refusal for a wrong month.
    it('adds no cast on the way to the truncation', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(bucketedContext());

      expect(sql).not.toContain('CAST(');
    });

    // The type argument comes off the PLAN, which is the same object the outer SELECT renders from
    // — not off `columnTypes.postJoin`, which is a second, independent derivation. Fixture makes the
    // two disagree: a map-fed sleeve would emit `DATE_TRUNC(DATE(...), MONTH)` against the outer
    // query's bare `DATE_TRUNC(..., MONTH)` and the membership assertion would fire.
    it('takes the declared type from the plan, not from the post-join type map', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
        ...bucketedContext(),
        columnTypes: {
          postJoin: new Map([
            ['channel', 'STRING'],
            ['visit_day', 'STRING'],
          ]),
        },
      });

      expect(sql).toContain(`${BUCKET_SQL} AS _owox_dim_1`);
      expect(sql).not.toContain(`DATE_TRUNC(DATE(${VISIT_DAY_SQL}), MONTH)`);
    });

    // The safety net, exercised on exactly the drift this task removes: a sleeve that projected the
    // formula untruncated while the outer query groups by the bucket. The real builder can no longer
    // produce it, so it is injected — the message is what a maintainer would get instead of a zero.
    it('refuses a sleeve that dropped the truncation from the calculated key', () => {
      const drifted = new TestBlendedWithDriftedSleeve(sleeve => ({
        ...sleeve,
        dimRefs: sleeve.dimRefs.map(d =>
          d.column === 'visit_day' ? { ...d, outer: VISIT_DAY_SQL } : d
        ),
      }));

      expect(() => drifted.buildBlendedQuery(bucketedContext())).toThrow(
        /not one of the outer GROUP BY keys/
      );
      expect(() => drifted.buildBlendedQuery(bucketedContext())).toThrow(
        /silently match\s+no rows \(NULL metric, or 0 after the COUNT DISTINCT coalesce\)/
      );
    });
  });

  /**
   * The report FILTERS on the field, and the predicate must reach the outer
   * query AND the inside of every metric sleeve.
   *
   * This is #6766's Critical C1 in this feature's shape — there the sleeve read `FROM main`
   * unfiltered, so any non-dimension filter computed the joined metric over ALL rows and gave
   * Totals an unfiltered grand total, with no error to show for it. A calculated predicate has a
   * second way to go wrong on top of that: the sleeve renders the field's NAME as a column
   * (`main.session_key`) over a `main` CTE that correctly never projects it.
   */
  describe('once the report filters on it', () => {
    const SESSION_KEY_RULE = {
      column: 'session_key',
      operator: 'eq',
      value: 'a1',
      clause: 'where',
    } satisfies RoutedFilterRule;

    const filteredContext = (): BlendedQueryContext => ({
      ...joinedContext(),
      calculatedFilterMetrics: [sessionKey],
      filters: [SESSION_KEY_RULE],
    });

    it('reproduces the predicate inside the metric sleeve, as the formula', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(filteredContext());

      // Inside the sleeve, on the DISTINCT set the outer aggregate reads — not after it.
      expect(extractCteBody(sql, 'sleeve_spend__cost')).toContain(
        `WHERE (${SESSION_KEY_SQL}) = @slv0p0`
      );
      // The outer query compares the same expression; one derivation, two renderings of it.
      expect(sql).toContain(`WHERE (${SESSION_KEY_SQL}) = @p0`);
      // The field's name is a SELECT alias: no CTE projects it, so a sleeve that qualified the
      // rule's column instead emits a name `main` does not carry.
      expect(sql).not.toContain('main.session_key');
    });

    // The gap that makes a filter harder than a selection: `SleeveCalculatedDimensions.plans` holds
    // SELECTED grouping keys only, so a filtered-but-not-selected field has no plan at the sleeve
    // and the raw CTE has no other reason to project the columns its formula reads.
    it('reproduces it when the field is filtered but not selected', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
        ...filteredContext(),
        calculatedFields: undefined,
      });

      expect(extractCteBody(sql, 'sleeve_spend__cost')).toContain(
        `WHERE (${SESSION_KEY_SQL}) = @slv0p0`
      );
      // The sleeve's own source is `main`, so the columns the predicate reads have to be there —
      // and the field's name must not be, on either side of that rule.
      const mainCte = extractCteBody(sql, 'main');
      expect(mainCte).toContain('session_id');
      expect(mainCte).toContain('user_id');
      expect(mainCte).not.toContain('session_key');
      // Filtered, not selected: not a grouping key of the outer query nor of the sleeve.
      expect(sql).not.toContain('_owox_dim_1');
      expect(sql).not.toContain('AS `session_key`');
    });

    // Totals: no dimensions at all, so the sleeve collapses to one global row — the exact row set
    // #6766's C1 got wrong. An unfiltered sleeve here is a grand total over rows the report hides.
    it('covers exactly the rows the report shows in a Totals query', () => {
      const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
        ...buildContext([costChain()], ['spend__cost']),
        fieldIndex: costFieldIndex,
        calculatedFilterMetrics: [sessionKey],
        aggregations: [{ column: 'spend__cost', function: 'SUM' }] as AggregationRule[],
        filters: [SESSION_KEY_RULE],
      });

      const sleeve = extractCteBody(sql, 'sleeve_spend__cost');
      expect(sleeve).toContain(`WHERE (${SESSION_KEY_SQL}) = @slv0p0`);
      // A grand total groups by nothing, so the sleeve must carry no key of its own either.
      expect(sleeve).not.toContain('_owox_dim_0');
      expect(sql).not.toContain('main.session_key');
    });
  });
});

/**
 * The SAME field on a joined report carrying NO aggregation rules.
 *
 * A row-level field is a DIMENSION, so it does not flip the query into the grouped shape — the
 * PLAIN blended projection is the only thing that can carry it, and it had no calculated channel
 * at all: the field was silently absent from the emitted SQL while `report-data-headers.utils.ts`
 * published a header for it regardless. A blank column on BigQuery, Snowflake and Databricks; an
 * exception on Athena and Redshift.
 */
describe('AbstractBlendedQueryBuilder — a row-level calculated field on an UNGROUPED joined report', () => {
  const SESSION_KEY_SQL = 'CONCAT(main.session_id, main.user_id)';
  const sessionKey: CalculatedFieldPlan = {
    outputName: 'session_key',
    type: 'STRING',
    formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
    level: 'column',
  };

  const ordersChain = (): ResolvedRelationshipChain =>
    makeChain({
      relationship: makeRelationship({
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
      }),
      targetTableReference: 'orders_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'country',
          outputAlias: 'orders__country',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });

  const plainContext = (): BlendedQueryContext => ({
    ...buildContext([ordersChain()], ['channel', 'orders__country']),
    calculatedFields: [sessionKey],
  });

  const outerSelect = (sql: string): string => sql.slice(sql.lastIndexOf('\n\nSELECT\n'));

  it('projects the formula in the plain SELECT, beside the main and joined columns', () => {
    const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(plainContext());
    const outer = outerSelect(sql);

    expect(outer).toContain(`${SESSION_KEY_SQL} AS \`session_key\``);
    expect(outer).toContain('main.channel');
    expect(outer).toContain('orders.orders__country');
    // A dimension, not an aggregate: a row-level field must not introduce a grouping shape.
    expect(outer).not.toContain('GROUP BY');
  });

  // The columns the formula reads are referenced by nothing else, so only the formula can have put
  // them there — and the field's own NAME is a SELECT alias no CTE may project.
  it('projects the columns the formula reads into the main CTE, and not its name', () => {
    const { sql } = new TestBlendedWithRenderer().buildBlendedQuery(plainContext());

    const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
    expect(mainCte).not.toBeNull();
    expect(mainCte![1]).toContain('session_id');
    expect(mainCte![1]).toContain('user_id');
    expect(mainCte![1]).not.toContain('session_key');
  });

  // The plain path resolves ORDER BY through the column qualifier, which would emit
  // `main.session_key` — an unrecognized name. The flat builders answer this with
  // `buildPlainSelectAliasResolver`; the blended one must too.
  it('sorts by the field own SELECT alias rather than qualifying it against main', () => {
    const { sql } = new TestBlendedWithRenderer().buildBlendedQuery({
      ...plainContext(),
      sort: [{ column: 'session_key', direction: 'desc' }],
    });

    expect(sql).toContain('ORDER BY\n  `session_key` DESC');
    expect(sql).not.toContain('main.session_key');
  });

  // Same verdict as the grouped path, from the same assertion: a row-level formula reads its own
  // Data Mart only, so a joined reference is refused rather than qualified against
  // `main` — an unrecognized name, or a wrong number when main owns a column of that name.
  it('refuses a joined reference in a row-level formula on this path too', () => {
    expect(() =>
      new TestBlendedWithRenderer().buildBlendedQuery({
        ...plainContext(),
        calculatedFields: [
          { ...sessionKey, formula: 'CONCAT({{ref path="orders" field="country"}})' },
        ],
      })
    ).toThrow(BusinessViolationException);
  });

  // The same verdict for a formula that is only FILTERED. This path's assertion loop read the
  // SELECTED metrics alone, so the predicate rendered `main.country` with no guard — the plausible
  // wrong number, since `orders.country` really is a column name main could own.
  it('refuses a joined reference in a row-level formula that is only FILTERED', () => {
    expect(() =>
      new TestBlendedWithRenderer().buildBlendedQuery({
        ...plainContext(),
        calculatedFields: undefined,
        calculatedFilterMetrics: [
          { ...sessionKey, formula: 'CONCAT({{ref path="orders" field="country"}})' },
        ],
        filters: [
          { column: 'session_key', operator: 'eq', value: 'a1', clause: 'where' },
        ] satisfies RoutedFilterRule[],
      })
    ).toThrow(BusinessViolationException);
  });
});

/**
 * A formula whose aggregate calls span BOTH Data Marts. The joined call cannot be computed
 * in the outer SELECT — the blend aggregates `orders` by its join key before joining it in, so
 * re-aggregating that collapsed CTE over- or under-counts on a fanning join — so it is lifted into
 * its own metric sleeve and its call site is replaced by that sleeve's pull.
 */
describe('AbstractBlendedQueryBuilder — calculated field across joined Data Marts', () => {
  let builder: TestBlendedWithRenderer;

  // Enough of a warehouse's aggregate vocabulary for the owner analysis to split these formulas.
  const isAggregateFunction = (name: string): boolean =>
    ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'ANY_VALUE', 'APPROX_COUNT_DISTINCT'].includes(
      name.trim().toUpperCase()
    );

  const metricPlan = (outputName: string, formula: string): CalculatedFieldPlan => ({
    outputName,
    type: 'FLOAT',
    formula,
    level: 'metric',
    formulaOwnership: buildFormulaOwnerPlan(formula, isAggregateFunction),
  });

  const ROI_FORMULA = 'SUM({{ref field="cost"}}) * 2 * SUM({{ref path="orders" field="amount"}})';

  function ordersChain() {
    return makeChain({
      relationship: makeRelationship({
        id: 'rel-orders',
        targetAlias: 'orders',
        joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
      }),
      targetTableReference: 'orders_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'amount',
          outputAlias: 'orders__amount',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
        {
          targetFieldName: 'id',
          outputAlias: 'orders__id',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
        {
          targetFieldName: 'rate',
          outputAlias: 'orders__rate',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
        // The funnel shape: this field's declared pre-join roll-up is a real aggregate, so the
        // blended column MEANS "distinct sessions per order", not the raw `sessions` value.
        {
          targetFieldName: 'sessions',
          outputAlias: 'orders__sessions',
          isHidden: false,
          aggregateFunction: 'COUNT_DISTINCT',
        },
        {
          targetFieldName: 'refunds',
          outputAlias: 'orders__refunds',
          isHidden: false,
          aggregateFunction: 'SUM',
        },
      ],
    });
  }

  function joinedContext(
    metrics: CalculatedFieldPlan[],
    columns = ['channel']
  ): BlendedQueryContext {
    return {
      ...buildContext([ordersChain()], columns),
      fieldIndex: buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__amount',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            type: 'NUMBER',
          },
          { name: 'orders__id', aliasPath: 'orders', originalFieldName: 'id', type: 'STRING' },
          { name: 'orders__rate', aliasPath: 'orders', originalFieldName: 'rate', type: 'NUMBER' },
          {
            name: 'orders__sessions',
            aliasPath: 'orders',
            originalFieldName: 'sessions',
            type: 'NUMBER',
          },
          {
            name: 'orders__refunds',
            aliasPath: 'orders',
            originalFieldName: 'refunds',
            type: 'NUMBER',
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never),
      calculatedFields: metrics,
    };
  }

  beforeEach(() => {
    builder = new TestBlendedWithRenderer();
  });

  it('lifts the joined call into its own sleeve and splices the pull back into the formula', () => {
    const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('roi', ROI_FORMULA)]));
    const s = normalizeSql(sql);

    // The sleeve is named after the metric and the call's index in ITS OWN call list — call 0 is
    // the own-Data-Mart SUM, which gets no sleeve.
    expect(s).toContain('sleeve_fx_roi_1 AS (');
    // The call's argument, rendered against the OWNER's raw rows, deduped per raw order row.
    expect(s).toContain('orders_raw.amount AS _val');
    expect(s).toContain('orders_raw.__owox_rid AS _oid');
    expect(s).toContain('SELECT DISTINCT main.channel AS _owox_dim_0');
    expect(s).toContain('SUM(_val) AS _fx_roi_1');
    // The own call still renders in place against `main`, and the formula's non-aggregate
    // structure (`* 2`) survives untouched around the spliced pull.
    expect(sql).toContain('SUM(main.cost) * 2 * ANY_VALUE(sleeve_fx_roi_1._fx_roi_1) AS `roi`');
    // Same NULL-safe dimension-tuple join-back every other sleeve gets.
    expect(s).toContain(
      'LEFT JOIN sleeve_fx_roi_1 ON ((main.channel) = (sleeve_fx_roi_1._owox_dim_0) ' +
        'OR ((main.channel) IS NULL AND (sleeve_fx_roi_1._owox_dim_0) IS NULL))'
    );
    // An aggregate-level calculated field is already an aggregate: grouped by the report's
    // dimension only.
    expect(sql.slice(sql.lastIndexOf('GROUP BY'))).toBe('GROUP BY\n  main.channel');
  });

  // The pull is spliced into the metric's expression tree; emitting it as its own SELECT item too
  // would project a second, unnamed-in-any-header column carrying half the metric.
  it('never emits the formula pull as an outer SELECT item of its own', () => {
    const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('roi', ROI_FORMULA)]));

    const outerSelect = sql.slice(sql.lastIndexOf('\n\nSELECT'), sql.indexOf('\nFROM main'));
    expect(outerSelect).not.toContain('AS _fx_roi_1');
    expect(outerSelect).not.toContain('AS `_fx_roi_1`');
  });

  // The joined ref's field name is the JOINED mart's column. Left in the main CTE's references it
  // becomes `SELECT amount FROM main_table` — an error, or worse a real main column of that name.
  it('keeps a joined reference out of the main raw CTE and projects it on the owner instead', () => {
    const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('roi', ROI_FORMULA)]));

    const mainCte = extractCteBody(sql, 'main');
    expect(mainCte).toContain('cost');
    expect(mainCte).not.toContain('amount');
    const ordersRaw = extractCteBody(sql, 'orders_raw');
    expect(ordersRaw).toContain('amount');
    expect(ordersRaw).toContain('__owox_rid');
  });

  // `COUNT(DISTINCT orders.id)` is the symmetric-aggregate question this feature exists to answer.
  // The quantifier belongs to the sleeve's OUTER aggregate: left in the inner slot it emits
  // `DISTINCT orders_raw.id AS _val`, which no warehouse parses.
  it('moves a COUNT(DISTINCT …) quantifier to the sleeve’s outer aggregate', () => {
    const formula = 'COUNT(DISTINCT {{ref path="orders" field="id"}}) / 2';
    const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('buyers', formula)]));
    const s = normalizeSql(sql);

    expect(s).toContain('orders_raw.id AS _val');
    expect(s).not.toContain('DISTINCT orders_raw.id AS _val');
    expect(s).toContain('COUNT(DISTINCT _val) AS _fx_buyers_0');
    // A count over zero joined rows is 0, not "no value" — the outer ANY_VALUE would read NULL.
    expect(sql).toContain(
      'COALESCE(ANY_VALUE(sleeve_fx_buyers_0._fx_buyers_0), 0) / 2 AS `buyers`'
    );
  });

  // Every other aggregate's DISTINCT has no representation in the sleeve's single slot, and the
  // failure would otherwise be a warehouse syntax error at report time.
  it('refuses a DISTINCT quantifier under any other aggregate', () => {
    const formula = 'SUM(DISTINCT {{ref path="orders" field="amount"}})';

    expect(() => builder.buildBlendedQuery(joinedContext([metricPlan('total', formula)]))).toThrow(
      BusinessViolationException
    );
  });

  // A mixed-owner call has no single grain at which it is defined. `buildFormulaOwnerPlan` reports
  // it as a violation and routes it to `own`, so without this check it renders `main.amount` —
  // an error at best, and a plausible wrong number if main happens to own a column of that name.
  it('refuses a call that mixes its own Data Mart with a joined one', () => {
    const formula = 'SUM({{ref field="cost"}} * {{ref path="orders" field="amount"}})';

    expect(() => builder.buildBlendedQuery(joinedContext([metricPlan('mixed', formula)]))).toThrow(
      /reads more than one Data Mart/
    );
  });

  // Both guards iterated the SELECTED metrics only, so a FILTER-only formula reached the SQL with
  // no ownership check at all — and `buildFormulaOwnerPlan` hands a mixed-owner call back as
  // own-owner, so it renders `main.amount`: an unrecognised name, or a plausible WRONG NUMBER when
  // main happens to own a column of that name. The validator refuses this filter upstream; the builder is
  // where the refusal has to be true even when nothing upstream ran.
  it('refuses a mixed-owner call on a formula that is only FILTERED', () => {
    const formula = 'SUM({{ref field="cost"}} * {{ref path="orders" field="amount"}})';

    expect(() =>
      builder.buildBlendedQuery({
        ...joinedContext([]),
        calculatedFilterMetrics: [metricPlan('mixed', formula)],
        filters: [
          { column: 'mixed', operator: 'gt', value: 1, clause: 'having' },
        ] satisfies RoutedFilterRule[],
      })
    ).toThrow(/reads more than one Data Mart/);
  });

  // The other half: nothing lifts a filter-only formula's joined call into a sleeve, so its
  // reference has nowhere to be routed and must be refused rather than qualified against `main`.
  it('refuses an unrouted joined reference on a formula that is only FILTERED', () => {
    expect(() =>
      builder.buildBlendedQuery({
        ...joinedContext([]),
        calculatedFilterMetrics: [metricPlan('roi', ROI_FORMULA)],
        filters: [
          { column: 'roi', operator: 'gt', value: 1, clause: 'having' },
        ] satisfies RoutedFilterRule[],
      })
    ).toThrow(/orders\.amount/);
  });

  // Outside every aggregate there is no call to route and no grain to read it at, so the reference
  // would land in the outer SELECT as a bare ungrouped column. `FORMULA_LEVEL_MIXING` gates it at
  // save; this is the saved-before-the-gate case, and it gets a message rather than a warehouse
  // error about grouping.
  it('refuses a joined reference sitting outside every aggregate', () => {
    const formula = 'SUM({{ref field="cost"}}) + {{ref path="orders" field="amount"}}';

    expect(() => builder.buildBlendedQuery(joinedContext([metricPlan('roi', formula)]))).toThrow(
      /readable only inside an aggregate call/
    );
  });

  // The ownership analysis is what routes a joined call. A metric that arrives without one has
  // every joined reference silently qualified against `main` instead.
  it('refuses a joined reference on a metric whose ownership analysis never arrived', () => {
    const context = joinedContext([
      { outputName: 'roi', type: 'FLOAT', formula: ROI_FORMULA, level: 'metric' },
    ]);

    expect(() => builder.buildBlendedQuery(context)).toThrow(/orders\.amount/);
  });

  // The bug class: a commented-out reference is not live SQL, so it must neither build a
  // sleeve nor trip the routing guard.
  it('ignores a joined reference that is commented out', () => {
    const formula = 'SUM({{ref field="cost"}}) /* was {{ref path="orders" field="amount"}} */';
    const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('roi', formula)]));

    expect(sql).not.toContain('sleeve_fx_roi');
    expect(sql).toContain('SUM(main.cost)');
  });

  // The same grain assertion every other sleeve is subject to: a formula sleeve one dimension
  // short would spread one value across several outer groups — a plausible number, no NULL.
  it('holds a formula sleeve to the same grain assertion as every other sleeve', () => {
    const drifted = new TestBlendedWithDriftedSleeve(sleeve =>
      sleeve.cteName === 'sleeve_fx_roi_1' ? { ...sleeve, dimRefs: [] } : sleeve
    );

    expect(() =>
      drifted.buildBlendedQuery(joinedContext([metricPlan('roi', ROI_FORMULA)]))
    ).toThrow(/metric sleeve 'sleeve_fx_roi_1' groups by 0 dimension\(s\)/);
  });

  // Formula sleeves are appended LAST so selecting a calculated field cannot rename another
  // sleeve's CTE or shift its `slv<i>p` bound-parameter prefix — which would silently re-bind a
  // filter value to a different placeholder on a positional dialect.
  it('leaves an existing sleeve’s CTE and bound-parameter names untouched', () => {
    const withUniqueCount = (metrics: CalculatedFieldPlan[]): BlendedQueryContext => ({
      ...joinedContext(metrics),
      filters: [{ column: 'channel', operator: 'eq', value: 'paid' }],
      uniqueCountSources: [
        {
          aliasPath: 'orders',
          cteName: 'orders',
          pkColumns: ['order_id'],
          outputLabel: 'orders__unique_count',
        },
      ],
    });

    const before = builder.buildBlendedQuery(withUniqueCount([])).sql;
    const after = builder.buildBlendedQuery(withUniqueCount([metricPlan('roi', ROI_FORMULA)])).sql;

    expect(extractCteBody(after, 'sleeve_uc_orders')).toBe(
      extractCteBody(before, 'sleeve_uc_orders')
    );
  });

  /**
   * A joined field's declared pre-join `aggregateFunction` is what that field MEANS once blended,
   * so a formula naming it must read the value a report metric on it reads. For a funnel-shaped
   * field the two paths would otherwise disagree with nothing on screen to say so: the report
   * metric sums the per-order roll-up, while a formula forced onto the raw rows would sum the raw
   * `sessions` values the roll-up exists to collapse.
   */
  describe('a joined field whose pre-join roll-up is a real aggregate', () => {
    const SESSIONS_FORMULA = 'SUM({{ref path="orders" field="sessions"}})';

    it('reads the same rows a report metric on that field reads', () => {
      const shared = joinedContext([], ['channel']);
      const formulaSql = builder.buildBlendedQuery({
        ...shared,
        calculatedFields: [metricPlan('total', SESSIONS_FORMULA)],
      }).sql;
      const reportSql = new TestBlendedWithRenderer().buildBlendedQuery({
        ...shared,
        columns: ['channel', 'orders__sessions'],
        aggregations: [{ column: 'orders__sessions', function: 'SUM' }],
      }).sql;

      // The whole CTE body, modulo the two things that legitimately differ — the output alias each
      // path names its value by. Anything else (the join set, the identity leg, the WHERE, the
      // GROUP BY) drifting apart is the two paths measuring different rows, which is the failure
      // this equality exists to catch, and a substring check would sail past it.
      const withoutAlias = (sql: string, cteName: string, alias: string): string =>
        normalizeSql(extractCteBody(sql, cteName))
          .split(cteName)
          .join('<cte>')
          .split(alias)
          .join('<value>');

      expect(withoutAlias(formulaSql, 'sleeve_fx_total_0', '_fx_total_0')).toBe(
        withoutAlias(reportSql, 'sleeve_orders__sessions', '`orders__sessions | SUM`')
      );
      // ...and that shared body is the ROLLED-UP column keyed by the join key it was rolled up per,
      // not the raw rows, which is what an unchanged `orders_raw` would mean here.
      const body = normalizeSql(extractCteBody(formulaSql, 'sleeve_fx_total_0'));
      expect(body).toContain('orders.orders__sessions AS _val');
      expect(body).toContain('orders.order_id AS _oid');
      expect(body).not.toContain('orders_raw');
    });

    // A sleeve on the roll-up keys off the owner dedup CTE's group key and never reads the per-row
    // surrogate, so projecting one costs a full window sort over the joined mart for a column
    // nothing reads.
    it('leaves the owner’s raw CTE without a row surrogate it never reads', () => {
      const { sql } = builder.buildBlendedQuery(
        joinedContext([metricPlan('total', SESSIONS_FORMULA)])
      );

      expect(extractCteBody(sql, 'orders_raw')).not.toContain('__owox_rid');
    });

    // One field is still ONE already-collapsed value per join key, so scaling it is well defined
    // after dedup — and reading it raw would be the same wrong number a bare reference would be.
    it('reads the roll-up when the expression scales that one field', () => {
      const formula = 'SUM({{ref path="orders" field="sessions"}} * 2)';
      const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('total', formula)]));

      expect(normalizeSql(sql)).toContain('orders.orders__sessions * 2 AS _val');
    });

    // Each column was collapsed separately, one value per join key, so a product of sums is not a
    // sum of products: no row set computes what was written, and raw would contradict the field's
    // own declared meaning. Refused rather than answered plausibly.
    // The message names the CALL it refuses, not a general rule about combining a summarised field
    // with another column — that rule is false for a plain joined COUNT (pinned just below), and an
    // analyst told a working combination is unsupported does not try it again.
    it.each([
      [
        'a passthrough column',
        'SUM({{ref path="orders" field="sessions"}} * {{ref path="orders" field="rate"}})',
        'SUM(…)',
      ],
      [
        'another rolled-up column',
        'SUM({{ref path="orders" field="sessions"}} * {{ref path="orders" field="refunds"}})',
        'SUM(…)',
      ],
      // A DISTINCT-counting call is exempted from the roll-up only because a report metric on that
      // ONE field answers the same way. An expression has no report counterpart to inherit that
      // from, so the exemption must not extend to it: raw gives |{5×2, 7×3}| = 2 where the
      // after-dedup product of the two roll-ups is a single value.
      [
        'another rolled-up column under COUNT DISTINCT',
        'COUNT(DISTINCT {{ref path="orders" field="sessions"}} * {{ref path="orders" field="refunds"}})',
        'COUNT(DISTINCT …)',
      ],
    ])('refuses a rolled-up field combined with %s, naming the call', (_case, formula, call) => {
      expect(() =>
        builder.buildBlendedQuery(joinedContext([metricPlan('mixed', formula)]))
      ).toThrow(`inside ${call}, in an expression that reads more than one field of 'orders'`);
    });

    // The one combination the refusal above deliberately does NOT cover. The planner leaves a
    // non-DISTINCT joined COUNT in the outer SELECT, so `renderFormulaSleeveValue` never sees it,
    // and `COUNT(a * b)` off the dedup CTE counts the MAIN rows whose product is non-null — the
    // ruled reading ("computed at the last join, after dedup"). Pinned so neither half can drift
    // into contradicting the other.
    it('allows the same combination under a plain joined COUNT, off the dedup CTE', () => {
      const formula =
        'COUNT({{ref path="orders" field="sessions"}} * {{ref path="orders" field="refunds"}})';
      const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('pairs', formula)]));

      expect(sql).toContain('COUNT(orders.orders__sessions * orders.orders__refunds) AS `pairs`');
      expect(sql).not.toContain('sleeve_fx_pairs');
    });

    // Raw stays right for a row-level expression over passthrough fields: no pre-aggregated slot
    // can represent a product of two of the owner's own columns.
    it('still reads raw for a row-level expression over passthrough fields', () => {
      const formula =
        'SUM({{ref path="orders" field="amount"}} * {{ref path="orders" field="rate"}})';
      const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('weighted', formula)]));
      const s = normalizeSql(sql);

      expect(s).toContain('orders_raw.amount * orders_raw.rate AS _val');
      expect(s).toContain('orders_raw.__owox_rid AS _oid');
    });

    // Distinct-counting is the one shape the report path deliberately keeps on raw values, because
    // counting distinct roll-ups conflates raw values that happen to roll up alike. The formula
    // path has to make the same choice or the two disagree again — and the choice is keyed on the
    // FUNCTION, not on the `DISTINCT` keyword: `APPROX_COUNT_DISTINCT(x)` carries no keyword and
    // asks the same question, so a quantifier-only gate answered it off the roll-up (raw sessions
    // [5,7,9] and [11] give 4; their roll-ups 3 and 1 give 2).
    it.each([
      ['COUNT(DISTINCT {{ref path="orders" field="sessions"}})', 'COUNT(DISTINCT _val)'],
      [
        'APPROX_COUNT_DISTINCT({{ref path="orders" field="sessions"}})',
        'APPROX_COUNT_DISTINCT(_val)',
      ],
    ])(
      'counts distinct RAW values in %s even when the field carries a roll-up',
      (formula, outer) => {
        const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('reach', formula)]));

        expect(normalizeSql(sql)).toContain('orders_raw.sessions AS _val');
        expect(normalizeSql(sql)).toContain(outer);
      }
    );
  });

  /**
   * `COUNT` counts ROWS, and the two candidate row sets are far apart on a fanning join: a sleeve
   * counts the owner's deduped raw rows (5 for one main row with 5 order lines), the report metric
   * counts the main rows that survived the join (1). The product rule is "computed at the last
   * join, after dedup", which is what the report path does — so a formula COUNT renders where the
   * report metric renders, off the dedup CTE, and gets no sleeve.
   */
  describe('a joined COUNT', () => {
    const COUNT_FORMULA = 'COUNT({{ref path="orders" field="amount"}}) / 2';

    it('renders where a report metric on that column renders, with no sleeve of its own', () => {
      const shared = joinedContext([], ['channel']);
      const formulaSql = builder.buildBlendedQuery({
        ...shared,
        calculatedFields: [metricPlan('lines', COUNT_FORMULA)],
      }).sql;
      const reportSql = new TestBlendedWithRenderer().buildBlendedQuery({
        ...shared,
        columns: ['channel', 'orders__amount'],
        aggregations: [{ column: 'orders__amount', function: 'COUNT' }],
      }).sql;

      // The same expression over the same CTE, in the same outer SELECT, as the report metric.
      expect(formulaSql).toContain('COUNT(orders.orders__amount) / 2 AS `lines`');
      expect(reportSql).toContain('COUNT(orders.orders__amount)');
      expect(formulaSql).not.toContain('sleeve_fx_lines');
      // The joined field is read off the dedup CTE, so nothing put its raw name in the main CTE.
      expect(extractCteBody(formulaSql, 'main')).not.toContain('amount');
    });

    // COUNT(DISTINCT …) is a different question and keeps its sleeve — the routing is per call.
    it('keeps the sleeve for the DISTINCT form in the same formula', () => {
      const formula =
        'COUNT({{ref path="orders" field="amount"}}) + ' +
        'COUNT(DISTINCT {{ref path="orders" field="id"}})';
      const { sql } = builder.buildBlendedQuery(joinedContext([metricPlan('both', formula)]));

      expect(sql).toContain(
        'COUNT(orders.orders__amount) + COALESCE(ANY_VALUE(sleeve_fx_both_1._fx_both_1), 0) AS `both`'
      );
      expect(normalizeSql(sql)).toContain('COUNT(DISTINCT _val) AS _fx_both_1');
    });
  });

  // `FORMULA_NESTED_AGGREGATE` gates this at save, so it is the saved-before-the-gate case — which
  // reached `renderFormulaWithReplacements` as two overlapping spans and surfaced as a bare Error,
  // i.e. a 500 with no body. Every other guard here answers that case by name.
  it('refuses a joined aggregate nested inside another instead of failing on overlapping spans', () => {
    const formula =
      'SUM({{ref path="orders" field="amount"}} * MAX({{ref path="orders" field="rate"}}))';

    expect(() => builder.buildBlendedQuery(joinedContext([metricPlan('nested', formula)]))).toThrow(
      BusinessViolationException
    );
    expect(() => builder.buildBlendedQuery(joinedContext([metricPlan('nested', formula)]))).toThrow(
      /nests the aggregate MAX\(\.\.\.\) inside another aggregate/
    );
  });

  // The same failure class through the other door: refs are attributed to the INNERMOST containing
  // call, so an outer call wrapping nothing but a joined one owns no refs and classifies as
  // own-owner. A joined-only pairing missed it, and it emitted `SUM(COUNT(orders.orders__amount))`
  // — a warehouse error carrying no metric name.
  it('refuses a joined aggregate nested inside an own-Data-Mart aggregate', () => {
    const formula = 'SUM(COUNT({{ref path="orders" field="amount"}}))';

    expect(() => builder.buildBlendedQuery(joinedContext([metricPlan('nested', formula)]))).toThrow(
      /nests the aggregate COUNT\(\.\.\.\) inside another aggregate/
    );
  });

  // Defence in depth: `buildAll` maps 1:1 over the plans, so a formula sleeve cannot go missing
  // today. If one ever did, "the reference sits inside SOME aggregate" accepted it — a joined SUM
  // then rendered `SUM(<dedup>.<col>)`, the fan-out-inflated number the sleeve exists to prevent.
  // Only the shape the planner deliberately leaves in place (a non-DISTINCT joined COUNT) passes.
  it('refuses a joined SUM whose sleeve went missing rather than reading the dedup CTE', () => {
    const lost = new TestBlendedWithDriftedSleeve(sleeve => ({
      ...sleeve,
      formulaCall: undefined,
    }));

    expect(() => lost.buildBlendedQuery(joinedContext([metricPlan('roi', ROI_FORMULA)]))).toThrow(
      /reads \[orders\.amount\] from a joined Data Mart/
    );
  });

  // The metric's name is an outer-SELECT alias, never a warehouse column — the scrub that keeps it
  // out of the main CTE must keep covering a metric that now also owns a sleeve.
  it('never lets the metric name reach the main raw CTE or the GROUP BY', () => {
    const { sql } = builder.buildBlendedQuery(
      joinedContext([metricPlan('roi', ROI_FORMULA)], ['channel', 'roi'].slice(0, 1))
    );

    expect(extractCteBody(sql, 'main')).not.toContain('roi');
    expect(sql.slice(sql.lastIndexOf('GROUP BY'))).not.toContain('roi');
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
    expect(sql).toContain('ORDER BY\n  main.source ASC');
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

// C2.1: per-raw-row surrogate id infra for the (future) SUM/AVG value sleeve. This slice
// only projects `__owox_rid` into a value-sleeve owner's raw CTE — the value sleeve itself and
// SUM/AVG routing are built in C2.2/C2.3.
describe('AbstractBlendedQueryBuilder — row surrogate (__owox_rid) for value-sleeve owners', () => {
  // main -> organizations (main.org_id = organizations_raw.orgId) — SUM/AVG target
  // main -> users         (main.user_id = users_raw.userId)       — plain dimension only
  function fixtureEventsUsersOrgs(): { context: BlendedQueryContext } {
    const organizationsChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-organizations',
        targetAlias: 'organizations',
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
      }),
      targetTableReference: 'organizations_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'revenue',
          outputAlias: 'organizations__revenue',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const usersChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-users',
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'userId' }],
      }),
      targetTableReference: 'users_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'country',
          outputAlias: 'users__country',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });

    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'organizations__revenue',
          aliasPath: 'organizations',
          originalFieldName: 'revenue',
          type: 'FLOAT64',
        },
        {
          name: 'users__country',
          aliasPath: 'users',
          originalFieldName: 'country',
          type: 'STRING',
        },
      ],
      availableSources: [
        { aliasPath: 'organizations', isIncluded: true },
        { aliasPath: 'users', isIncluded: true },
      ],
    } as never);

    const context: BlendedQueryContext = {
      ...buildContext(
        [organizationsChain, usersChain],
        ['users__country', 'organizations__revenue']
      ),
      fieldIndex,
    };

    return { context };
  }

  it('collectValueSleeveOwners picks value metrics on blended IDENTITY columns, not COUNT_DISTINCT or a main column', () => {
    const organizationsChain = makeChain({
      relationship: makeRelationship({ targetAlias: 'organizations' }),
      targetTableReference: 'organizations_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'revenue',
          outputAlias: 'organizations__revenue',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE', // identity passthrough
        },
      ],
    });
    const outputAliasToRoot = new Map([['organizations__revenue', 'organizations']]);
    const fieldIndex = new Map([
      [
        'organizations__revenue',
        {
          aliasPath: 'organizations',
          cteName: 'organizations',
          originalFieldName: 'revenue',
          type: 'FLOAT64',
          sourceFieldType: 'FLOAT64',
          isIncluded: true,
        },
      ],
    ]);
    const context: BlendedQueryContext = {
      ...buildContext([organizationsChain], ['organizations__revenue']),
      fieldIndex,
    };
    const aggs = [
      { column: 'organizations__revenue', function: 'SUM' },
      { column: 'organizations__revenue', function: 'COUNT_DISTINCT' }, // not SUM/AVG
      { column: 'revenue', function: 'SUM' }, // main (non-blended) column -> not an owner
    ] as AggregationRule[];

    expect(collectValueSleeveOwners(aggs, outputAliasToRoot, context)).toEqual(
      new Map([['organizations', { kind: 'row-surrogate' }]])
    );
  });

  it('collectValueSleeveOwners excludes an owner whose ONLY value-sleeve metric is on a NON-IDENTITY pre-join field ( — default joined SUM)', () => {
    // The DEFAULT production shape: a joined numeric field pre-aggregated with SUM at its
    // own join key (NOT a raw ANY_VALUE passthrough). Its value sleeve reads the owner
    // dedup CTE's own already-aggregated column, keyed by the pre-join GROUP KEY — it never
    // references `__owox_rid`, so the owner's raw CTE must not carry the unused surrogate.
    const hitsChain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'hits',
        joinConditions: [{ sourceFieldName: 'session_id', targetFieldName: 'session_id' }],
      }),
      targetTableReference: 'hits_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'amount',
          outputAlias: 'hits__amount',
          isHidden: false,
          aggregateFunction: 'SUM', // non-identity pre-join roll-up
        },
      ],
    });
    const outputAliasToRoot = new Map([['hits__amount', 'hits']]);
    const fieldIndex = new Map([
      [
        'hits__amount',
        {
          aliasPath: 'hits',
          cteName: 'hits',
          originalFieldName: 'amount',
          type: 'FLOAT64',
          sourceFieldType: 'FLOAT64',
          isIncluded: true,
        },
      ],
    ]);
    const context: BlendedQueryContext = {
      ...buildContext([hitsChain], ['hits__amount']),
      fieldIndex,
    };
    const aggs = [{ column: 'hits__amount', function: 'SUM' }] as AggregationRule[];

    expect(collectValueSleeveOwners(aggs, outputAliasToRoot, context)).toEqual(new Map());
  });

  it('projects __owox_rid on the raw CTE of a chain that owns a joined SUM metric', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    const orgsRaw = normalizeSql(extractCteBody(sql, 'organizations_raw'));
    expect(orgsRaw).toContain('ROW_NUMBER() OVER (PARTITION BY orgId ORDER BY 1) AS __owox_rid');

    // The users chain owns no value-sleeve metric — its raw CTE must stay lean.
    const usersRaw = normalizeSql(extractCteBody(sql, 'users_raw'));
    expect(usersRaw).not.toContain('__owox_rid');
  });

  // The surrogate is projected ALONGSIDE the declared key, not instead of it: a key row whose
  // key is NULL falls back to the surrogate for its identity, so the sleeve needs both columns.
  it('projects the declared primary key AND the surrogate the NULL fallback reads', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      chains: context.chains.map(c =>
        c.cteName === 'organizations' ? { ...c, targetPrimaryKeyFields: ['orgKey'] } : c
      ),
      aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    const orgsRaw = normalizeSql(extractCteBody(sql, 'organizations_raw'));
    expect(orgsRaw).toContain('orgKey');
    expect(orgsRaw).toContain('ROW_NUMBER() OVER (PARTITION BY orgId ORDER BY 1) AS __owox_rid');
    // The chain that owns no value-sleeve metric still pays for neither.
    expect(normalizeSql(extractCteBody(sql, 'users_raw'))).not.toContain('__owox_rid');
  });

  it('projects __owox_rid on the raw CTE of a chain that owns a joined AVG metric', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [{ column: 'organizations__revenue', function: 'AVG' } as AggregationRule],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    const orgsRaw = normalizeSql(extractCteBody(sql, 'organizations_raw'));
    expect(orgsRaw).toContain('ROW_NUMBER() OVER (PARTITION BY orgId ORDER BY 1) AS __owox_rid');
  });

  it('does NOT project __owox_rid anywhere when the only aggregation is a joined COUNT_DISTINCT (keeps raw CTEs lean)', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [
        { column: 'organizations__revenue', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    };

    const { sql } = builder.buildBlendedQuery(ctx);
    expect(sql).not.toContain('__owox_rid');
  });

  it('does NOT project __owox_rid when there is no aggregation at all', () => {
    const builder = new TestBlendedQueryBuilder();
    const { context } = fixtureEventsUsersOrgs();

    const { sql } = builder.buildBlendedQuery(context);
    expect(sql).not.toContain('__owox_rid');
  });

  it('does NOT project __owox_rid anywhere when the only value-sleeve metric is on a NON-IDENTITY pre-join field ( — default joined SUM)', () => {
    // Mirrors the DEFAULT production shape (fixtureSessionHitsFunnel below): the blended
    // field's OWN pre-join aggregateFunction is a genuine roll-up (COUNT_DISTINCT per
    // session here), not a raw ANY_VALUE passthrough — so its value sleeve keys off the
    // owner dedup CTE's own pre-join GROUP KEY and never reads `__owox_rid`. Before
    // H1a, `hits_raw` got `__owox_rid` projected regardless — an unpartitioned ROW_NUMBER()
    // window scanned for nothing.
    const builder = new TestBlendedWithRenderer();
    const hitsChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-hits',
        targetAlias: 'hits',
        joinConditions: [{ sourceFieldName: 'session_id', targetFieldName: 'session_id' }],
      }),
      targetTableReference: 'hits_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'hitId',
          outputAlias: 'hits__hitId',
          isHidden: false,
          aggregateFunction: 'COUNT_DISTINCT',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        { name: 'hits__hitId', aliasPath: 'hits', originalFieldName: 'hitId', type: 'INT64' },
      ],
      availableSources: [{ aliasPath: 'hits', isIncluded: true }],
    } as never);
    const ctx: BlendedQueryContext = {
      ...buildContext([hitsChain], ['campaign', 'hits__hitId']),
      fieldIndex,
      aggregations: [{ column: 'hits__hitId', function: 'SUM' } as AggregationRule],
    };

    const { sql } = builder.buildBlendedQuery(ctx);
    expect(sql).not.toContain('__owox_rid');
  });

  it('guards the reserved __owox_rid alias against collision with a real raw column reference', () => {
    const builder = new TestBlendedWithRenderer();
    const organizationsChain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'organizations',
        // A real source column happens to be named `__owox_rid` — this chain also owns a SUM
        // metric, so it must fail loud instead of silently colliding with the surrogate.
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: '__owox_rid' }],
      }),
      targetTableReference: 'organizations_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'revenue',
          outputAlias: 'organizations__revenue',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'organizations__revenue',
          aliasPath: 'organizations',
          originalFieldName: 'revenue',
          type: 'FLOAT64',
        },
      ],
      availableSources: [{ aliasPath: 'organizations', isIncluded: true }],
    } as never);

    const ctx: BlendedQueryContext = {
      ...buildContext([organizationsChain], ['organizations__revenue']),
      fieldIndex,
      aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
    };

    expect(() => builder.buildBlendedQuery(ctx)).toThrow(/__owox_rid/);
    // Mediums: this is USER DATA (a real source column can be named anything),
    // not an invariant violation — it must surface as a BusinessViolationException (→ HTTP
    // 400), not a bare Error (→ HTTP 500).
    expect(() => builder.buildBlendedQuery(ctx)).toThrow(BusinessViolationException);
  });

  // Every identity owner now projects the surrogate, so this guard reaches a DECLARED-KEY chain
  // that it used to skip: such a report worked before and is rejected now. That is the guard
  // doing its job — but it must still be the clean 400, with the column named, not a bare 500.
  it('guards the reserved __owox_rid alias on a DECLARED-KEY chain too, still as a clean 400', () => {
    const builder = new TestBlendedWithRenderer();
    const organizationsChain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'organizations',
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: '__owox_rid' }],
      }),
      targetTableReference: 'organizations_table',
      parentAlias: 'main',
      targetPrimaryKeyFields: ['orgKey'],
      blendedFields: [
        {
          targetFieldName: 'revenue',
          outputAlias: 'organizations__revenue',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'organizations__revenue',
          aliasPath: 'organizations',
          originalFieldName: 'revenue',
          type: 'FLOAT64',
        },
      ],
      availableSources: [{ aliasPath: 'organizations', isIncluded: true }],
    } as never);
    const ctx: BlendedQueryContext = {
      ...buildContext([organizationsChain], ['organizations__revenue']),
      fieldIndex,
      aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
    };

    try {
      builder.buildBlendedQuery(ctx);
      throw new Error('expected a BusinessViolationException');
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessViolationException);
      expect((err as BusinessViolationException).errorDetails).toEqual({
        reservedNameColumns: ['__owox_rid'],
      });
    }
  });

  it('warns that __owox_rid collision is unverifiable under the SELECT * fallback for a value-sleeve owner with a nested column', () => {
    // A nested/dotted blended-field reference forces the raw CTE to widen to `SELECT *`
    // (dotted paths can't be projected as single identifiers). The `__owox_rid` collision guard
    // only inspects the small tracked `columns` set, so under `SELECT *` a physical table
    // column literally named `__owox_rid` would collide invisibly — surface that blind spot.
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const builder = new TestBlendedWithRenderer();
      const organizationsChain = makeChain({
        relationship: makeRelationship({
          targetAlias: 'organizations',
          joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
        }),
        targetTableReference: 'organizations_table',
        parentAlias: 'main',
        blendedFields: [
          {
            // Nested-struct path → buildRawCte can't project it, widens to SELECT *.
            targetFieldName: 'profile.revenue',
            outputAlias: 'organizations__revenue',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
        ],
      });
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'organizations__revenue',
            aliasPath: 'organizations',
            originalFieldName: 'profile.revenue',
            type: 'FLOAT64',
          },
        ],
        availableSources: [{ aliasPath: 'organizations', isIncluded: true }],
      } as never);

      const ctx: BlendedQueryContext = {
        ...buildContext([organizationsChain], ['organizations__revenue']),
        fieldIndex,
        aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
      };

      const { sql } = builder.buildBlendedQuery(ctx);

      // The surrogate is still appended on the SELECT * projection...
      expect(normalizeSql(sql)).toContain(
        'SELECT *, ROW_NUMBER() OVER (PARTITION BY orgId ORDER BY 1) AS __owox_rid FROM organizations_table'
      );
      // ...but the operator is warned that the collision can't be statically verified.
      const warned = warnSpy.mock.calls.map(args => String(args[0]));
      expect(
        warned.some(
          m =>
            m.includes('organizations') &&
            m.includes('SELECT *') &&
            m.includes('__owox_rid') &&
            m.includes('cannot be statically verified')
        )
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('collectValueSleeveOwners throws (not silently skips) for a blended SUM column missing from the field index', () => {
    // A blended column present in outputAliasToRoot but absent from fieldIndex (e.g. a
    // hidden aggregated column mapOutputAliasesToRoot stamped but buildBlendedFieldIndex
    // skipped) is the SAME invariant violation buildSleeveCte throws on — the two paths
    // must be consistent, or the owner chain would silently lose the surrogate it needs.
    const outputAliasToRoot = new Map([['organizations__revenue', 'organizations']]);
    const emptyFieldIndex = new Map(); // maps nothing → the metric column is missing
    const context: BlendedQueryContext = {
      ...buildContext([], []),
      fieldIndex: emptyFieldIndex,
    };
    const aggs = [{ column: 'organizations__revenue', function: 'SUM' }] as AggregationRule[];

    expect(() => collectValueSleeveOwners(aggs, outputAliasToRoot, context)).toThrow(
      /collectValueSleeveOwners: no fieldIndex entry for value-sleeve metric column='organizations__revenue'/
    );
  });
});

// ---------------------------------------------------------------------------
// the grand-total/grouped sleeve pull reads 0 (not NULL) for a COUNT_DISTINCT
// metric when the outer FROM contributes zero rows for a bucket (an empty-matching WHERE, or
// a LEFT-JOIN miss on a grouped report) — ANY_VALUE over an empty input set is NULL, but a
// distinct count over zero/no rows is 0. SUM/AVG stay bare ANY_VALUE: NULL-over-empty is
// correct SQL semantics for them (see `buildBlendedQuery`'s `sleeveSelect`).
// ---------------------------------------------------------------------------
describe('AbstractBlendedQueryBuilder — (COALESCE the COUNT_DISTINCT sleeve pull)', () => {
  function fixtureEventsUsersOrgs(): { context: BlendedQueryContext } {
    const organizationsChain = makeChain({
      relationship: makeRelationship({
        id: 'rel-organizations',
        targetAlias: 'organizations',
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
      }),
      targetTableReference: 'organizations_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'revenue',
          outputAlias: 'organizations__revenue',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'organizations__revenue',
          aliasPath: 'organizations',
          originalFieldName: 'revenue',
          type: 'FLOAT64',
        },
      ],
      availableSources: [{ aliasPath: 'organizations', isIncluded: true }],
    } as never);

    const context: BlendedQueryContext = {
      ...buildContext([organizationsChain], ['organizations__revenue']),
      fieldIndex,
    };
    return { context };
  }

  it('wraps a COUNT_DISTINCT sleeve pull in COALESCE(..., 0)', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [
        { column: 'organizations__revenue', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    };

    const { sql } = builder.buildBlendedQuery(ctx);
    const s = normalizeSql(sql);

    expect(s).toContain(
      'COALESCE(ANY_VALUE(sleeve_organizations__revenue.`organizations__revenue | COUNTUNIQUE`), 0) ' +
        'AS `organizations__revenue | COUNTUNIQUE`'
    );
  });

  it('does NOT wrap a SUM or AVG sleeve pull — NULL-over-empty stays NULL', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
    };

    const { sql } = builder.buildBlendedQuery(ctx);
    const s = normalizeSql(sql);

    expect(s).toContain(
      'ANY_VALUE(sleeve_organizations__revenue.`organizations__revenue | SUM`) ' +
        'AS `organizations__revenue | SUM`'
    );
    expect(s).not.toContain('COALESCE');
  });
});

// ---------------------------------------------------------------------------
// round (Task R3): hardening the sleeve mechanism against
// - H5: a future SLEEVE_ROUTED_FUNCTIONS entry with no builder branch,
// - H6: a sleeve name colliding with a REAL chain CTE already in the WITH clause,
// - the DoD "label each sleeve" requirement, and
// - a report dimension literally named a reserved inner sleeve alias (_val/_oid/_dedup).
// ---------------------------------------------------------------------------
describe('AbstractBlendedQueryBuilder — hardening', () => {
  function organizationsFixture(): {
    chain: ResolvedRelationshipChain;
    fieldIndex: ReturnType<typeof buildBlendedFieldIndex>;
  } {
    const chain = makeChain({
      relationship: makeRelationship({ targetAlias: 'organizations' }),
      targetTableReference: 'organizations_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'orgId',
          outputAlias: 'organizations__orgId',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
        {
          targetFieldName: 'revenue',
          outputAlias: 'organizations__revenue',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'organizations__orgId',
          aliasPath: 'organizations',
          originalFieldName: 'orgId',
          type: 'INTEGER',
        },
        {
          name: 'organizations__revenue',
          aliasPath: 'organizations',
          originalFieldName: 'revenue',
          type: 'FLOAT64',
        },
      ],
      availableSources: [{ aliasPath: 'organizations', isIncluded: true }],
    } as never);
    return { chain, fieldIndex };
  }

  describe('H5 — exhaustive sleeve-function split', () => {
    afterEach(() => {
      // Undo the simulated future-function mutation regardless of test outcome so it can
      // never leak into another test file sharing this module instance. It must name a function
      // SLEEVE_ROUTING genuinely leaves unrouted, or this deletes a real member.
      (SLEEVE_ROUTED_FUNCTIONS as unknown as Set<ReportAggregateFunction>).delete('COUNT');
    });

    it('throws a clear error for a routed function SLEEVE_ROUTING gives no shape', () => {
      const builder = new TestBlendedWithRenderer();
      const { chain, fieldIndex } = organizationsFixture();

      (SLEEVE_ROUTED_FUNCTIONS as unknown as Set<ReportAggregateFunction>).add('COUNT');

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['organizations__orgId']),
        fieldIndex,
        aggregations: [{ column: 'organizations__orgId', function: 'COUNT' } as AggregationRule],
      };

      expect(() => builder.buildBlendedQuery(ctx)).toThrow(
        /\[organizations__orgId:COUNT\].*carry no sleeve shape in SLEEVE_ROUTING/
      );
    });

    it('does NOT throw for the real set — every routed function has a handled shape', () => {
      const builder = new TestBlendedWithRenderer();
      const { chain, fieldIndex } = organizationsFixture();

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['organizations__orgId', 'organizations__revenue']),
        fieldIndex,
        aggregations: [
          { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
          { column: 'organizations__revenue', function: 'SUM' } as AggregationRule,
          { column: 'organizations__revenue', function: 'P50' } as AggregationRule,
        ],
      };

      expect(() => builder.buildBlendedQuery(ctx)).not.toThrow();
    });
  });

  describe('H6 — sleeve name collision guard is seeded with real chain CTE names', () => {
    it('disambiguates a sleeve whose bare name collides with a real chain cteName', () => {
      const builder = new TestBlendedWithRenderer();
      // This chain's OWN cteName (== its aliasPath, so the field index agrees) happens to
      // equal the bare sleeve name a SUM metric on 'organizations__revenue' would otherwise
      // get (`sleeve_<col>`).
      const chain = makeChain({
        cteName: 'sleeve_organizations__revenue',
        relationship: makeRelationship({ targetAlias: 'sleeve_organizations__revenue' }),
        targetTableReference: 'organizations_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'revenue',
            outputAlias: 'organizations__revenue',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
        ],
      });
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'organizations__revenue',
            aliasPath: 'sleeve_organizations__revenue',
            originalFieldName: 'revenue',
            type: 'FLOAT64',
          },
        ],
        availableSources: [{ aliasPath: 'sleeve_organizations__revenue', isIncluded: true }],
      } as never);

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['organizations__revenue']),
        fieldIndex,
        aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
      };

      const { sql } = builder.buildBlendedQuery(ctx);

      // The real chain's own dedup CTE keeps its bare name, appearing exactly once...
      expect(sql.match(/sleeve_organizations__revenue AS \(/g)).toHaveLength(1);
      // ...and the value sleeve, which would otherwise ALSO want that exact name, is
      // disambiguated onto `_2` instead of silently colliding with it.
      expect(sql).toContain('sleeve_organizations__revenue_2 AS (');
    });
  });

  describe('DoD — each sleeve CTE is labeled with a sanitized comment', () => {
    it('emits a label line above the COUNT_DISTINCT sleeve and above the SUM value sleeve', () => {
      const builder = new TestBlendedWithRenderer();
      const { chain, fieldIndex } = organizationsFixture();

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['organizations__orgId', 'organizations__revenue']),
        fieldIndex,
        aggregations: [
          { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
          { column: 'organizations__revenue', function: 'SUM' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);

      expect(sql).toMatch(
        /-- calculation: unique organizations__orgId counted over the raw rows,\n\s*-- so the join's roll-up cannot hide values and its fan-out cannot inflate them\n\s*sleeve_organizations__orgId AS \(/
      );
      expect(sql).toMatch(
        /-- calculation: SUM\(organizations__revenue\) de-duplicated before aggregating,\n\s*-- so the join's fan-out cannot distort it\n\s*sleeve_organizations__revenue AS \(/
      );
    });
  });

  describe('Mediums — reserved inner sleeve names (_val/_oid/_dedup) guarded against a dimension collision', () => {
    it('rejects a dimension literally named `_val` with a BusinessViolationException instead of corrupting the SELECT DISTINCT', () => {
      const builder = new TestBlendedWithRenderer();
      const { chain, fieldIndex } = organizationsFixture();

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['_val', 'organizations__revenue']),
        fieldIndex,
        aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
      };

      expect(() => builder.buildBlendedQuery(ctx)).toThrow(BusinessViolationException);
      expect(() => builder.buildBlendedQuery(ctx)).toThrow(/_val/);
    });

    it('rejects a dimension literally named `_oid`', () => {
      const builder = new TestBlendedWithRenderer();
      const { chain, fieldIndex } = organizationsFixture();

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['_oid', 'organizations__revenue']),
        fieldIndex,
        aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
      };

      expect(() => builder.buildBlendedQuery(ctx)).toThrow(BusinessViolationException);
      expect(() => builder.buildBlendedQuery(ctx)).toThrow(/_oid/);
    });

    it('rejects a dimension literally named `_dedup`', () => {
      const builder = new TestBlendedWithRenderer();
      const { chain, fieldIndex } = organizationsFixture();

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['_dedup', 'organizations__revenue']),
        fieldIndex,
        aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
      };

      expect(() => builder.buildBlendedQuery(ctx)).toThrow(BusinessViolationException);
      expect(() => builder.buildBlendedQuery(ctx)).toThrow(/_dedup/);
    });

    it('does NOT throw for an ordinary dimension name that is not a reserved alias', () => {
      const builder = new TestBlendedWithRenderer();
      const { chain, fieldIndex } = organizationsFixture();

      const ctx: BlendedQueryContext = {
        ...buildContext([chain], ['region', 'organizations__revenue']),
        fieldIndex,
        aggregations: [{ column: 'organizations__revenue', function: 'SUM' } as AggregationRule],
      };

      expect(() => builder.buildBlendedQuery(ctx)).not.toThrow();
    });
  });
});

describe('AbstractBlendedQueryBuilder — sleeve wiring (full query)', () => {
  // Aggregation requires a non-null clauseRenderer (the capability guard at the top of
  // buildBlendedQuery throws otherwise), so these full-query tests use TestBlendedWithRenderer
  // (real BigQueryClauseRenderer) rather than the null-renderer TestBlendedQueryBuilder used
  // for the private-method tests above.
  it('routes joined COUNT_DISTINCT through a sleeve instead of dedup+SUM', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    };

    const { sql } = builder.buildBlendedQuery(ctx);
    const s = normalizeSql(sql);

    expect(s).toContain('sleeve_organizations__orgId AS (');
    expect(s).toContain('COUNT(DISTINCT organizations_raw.orgId)');
    // COALESCE(..., 0) — a COUNT_DISTINCT sleeve pull must read 0, not NULL,
    // when the outer join-back contributes no rows for a bucket.
    expect(s).toContain(
      'COALESCE(ANY_VALUE(sleeve_organizations__orgId.`organizations__orgId | COUNTUNIQUE`), 0) ' +
        'AS `organizations__orgId | COUNTUNIQUE`'
    );
    expect(s).toContain(
      'LEFT JOIN sleeve_organizations__orgId ON ((users.users__country) = ' +
        '(sleeve_organizations__orgId._owox_dim_0) ' +
        'OR ((users.users__country) IS NULL AND (sleeve_organizations__orgId._owox_dim_0) IS NULL))'
    );
    // the old over-counting path must be gone for this metric:
    expect(s).not.toContain('SUM(organizations.organizations__orgId)');
    // the raw metric column must NOT leak into the outer GROUP BY as a bogus bare
    // dimension (it has no aggregation function left once the sleeve rule is excluded).
    expect(s).toMatch(/GROUP BY users\.users__country(?!,)/);
  });

  it('renders a grand-total sleeve with no report dimensions: no GROUP BY inside it, CROSS JOIN outside', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      columns: ['organizations__orgId'],
      aggregations: [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    const sleeveCte = extractCteBody(sql, 'sleeve_organizations__orgId');
    expect(sleeveCte).not.toMatch(/GROUP BY/);
    expect(normalizeSql(sleeveCte)).toContain('COUNT(DISTINCT organizations_raw.orgId)');

    const s = normalizeSql(sql);
    expect(s).toContain('CROSS JOIN sleeve_organizations__orgId');
    expect(s).not.toContain('LEFT JOIN sleeve_organizations__orgId');
    // No dimensions anywhere → no outer GROUP BY either (single grand-total row). The
    // per-chain dedup CTEs (`organizations AS (... GROUP BY orgId)`) keep their own
    // GROUP BY regardless — that's the unrelated bottom-up blending mechanism — so this
    // must scope to the OUTER SELECT only, not the whole SQL string.
    const finalSelect = sql.slice(sql.lastIndexOf('\n\nSELECT'));
    expect(finalSelect).not.toMatch(/GROUP BY/);
    // COALESCE(..., 0) — the grand-total pull must read 0, not NULL, when a
    // report filter zeroes out every outer row.
    expect(s).toMatch(/SELECT\s*COALESCE\(ANY_VALUE\(sleeve_organizations__orgId\./);
  });

  it('orders by a sleeve metric via its output alias, not a nonexistent bare column', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
      sort: [{ column: 'organizations__orgId', direction: 'desc' }],
    };

    const { sql } = builder.buildBlendedQuery(ctx);

    // The sleeve metric's own SELECT alias — ORDER BY must reference this, not a bare
    // `organizations__orgId` (which no longer exists anywhere in the outer SELECT once
    // the column is excluded from the normal aggregated SELECT/GROUP BY).
    expect(sql).toContain('ORDER BY\n  `organizations__orgId | COUNTUNIQUE` DESC');
  });

  it('throws a clear invariant error when a sleeve metric is present but fieldIndex is absent', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    // Strip the field index the real caller always supplies; a joined COUNT_DISTINCT sleeve
    // can't resolve its raw column without it — the builder must fail loud, not dereference
    // `undefined`.
    const { fieldIndex: _omitted, ...withoutFieldIndex } = context;
    const ctx: BlendedQueryContext = {
      ...withoutFieldIndex,
      aggregations: [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    };

    expect(() => builder.buildBlendedQuery(ctx)).toThrow(
      /buildSleeveCte: context\.fieldIndex is required to resolve sleeve metric column='organizations__orgId'/
    );
  });

  it('regression: joins the sleeve back correctly when the report dimension is date-truncated', () => {
    const builder = new TestBlendedWithRenderer();
    const { context } = fixtureEventsUsersOrgs();
    const ctx: BlendedQueryContext = {
      ...context,
      aggregations: [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
      dateTruncs: [{ column: 'users__country', unit: 'MONTH' }],
    };

    const { sql } = builder.buildBlendedQuery(ctx);
    const s = normalizeSql(sql);

    // the sleeve's own internal GROUP BY and the outer aggregated GROUP BY now
    // both truncate the SAME qualified (dedup CTE) ref, so the truncated expression is
    // byte-identical on both sides — it appears at least twice (sleeve + outer).
    expect(s.match(/GROUP BY DATE_TRUNC\(DATE\(users\.users__country\), MONTH\)/g)?.length).toBe(2);
    expect(s).not.toContain('DATE_TRUNC(DATE(users_raw.country), MONTH)');

    // The join-back ON clause must compare that SAME truncated outer expression against
    // the sleeve's projected column — not a raw, untruncated outer ref (which would never
    // equal the sleeve's truncated value and leave the metric NULL for every row).
    expect(s).toContain(
      'LEFT JOIN sleeve_organizations__orgId ON ((DATE_TRUNC(DATE(users.users__country), MONTH)) = ' +
        '(sleeve_organizations__orgId._owox_dim_0) OR ' +
        '((DATE_TRUNC(DATE(users.users__country), MONTH)) IS NULL AND ' +
        '(sleeve_organizations__orgId._owox_dim_0) IS NULL))'
    );
  });

  it('resolves a MAIN (native) report dimension via buildColumnQualifier, not a blended alias', () => {
    // The report dimension here ('main_region') is a native main-table column — it has
    // NO entry in outputAliasToRoot or the field index. buildColumnQualifier's fallback
    // path must qualify it as `main.<col>`, and that SAME expression must appear on both
    // sides of the sleeve's projection/GROUP BY and the NULL-safe join-back.
    const builder = new TestBlendedWithRenderer();
    const organizationsChain = makeChain({
      relationship: makeRelationship({
        targetAlias: 'organizations',
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
      }),
      targetTableReference: 'organizations_table',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'orgId',
          outputAlias: 'organizations__orgId',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
      ],
    });
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'organizations__orgId',
          aliasPath: 'organizations',
          originalFieldName: 'orgId',
          type: 'STRING',
        },
      ],
      availableSources: [{ aliasPath: 'organizations', isIncluded: true }],
    } as never);

    const ctx: BlendedQueryContext = {
      ...buildContext([organizationsChain], ['main_region', 'organizations__orgId']),
      fieldIndex,
      aggregations: [
        { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
      ],
    };

    const { sql } = builder.buildBlendedQuery(ctx);
    const s = normalizeSql(sql);

    const sleeveCte = extractCteBody(sql, 'sleeve_organizations__orgId');
    expect(normalizeSql(sleeveCte)).toContain('main.main_region AS _owox_dim_0');
    expect(normalizeSql(sleeveCte)).toContain('GROUP BY main.main_region');

    expect(s).toContain(
      'LEFT JOIN sleeve_organizations__orgId ON ((main.main_region) = ' +
        '(sleeve_organizations__orgId._owox_dim_0) OR ' +
        '((main.main_region) IS NULL AND (sleeve_organizations__orgId._owox_dim_0) IS NULL))'
    );
  });

  // C2.3: broadens the sleeve-routing wiring from COUNT_DISTINCT-only to also cover
  // joined SUM/AVG (the value sleeve, C2.2's SQL shape). These pin the ROUTING contract
  // end-to-end — the sleeve CTE is present, the value is pulled via ANY_VALUE exactly
  // once, and the old dedup+SUM/AVG re-aggregation path is gone for that metric.
  describe('value-sleeve routing', () => {
    it('routes joined SUM through a value sleeve instead of dedup+SUM', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [{ column: 'organizations__orgId', function: 'SUM' } as AggregationRule],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      // The value-sleeve shape (nested DISTINCT dedup + outer SUM), not the single-level
      // COUNT_DISTINCT form.
      expect(s).toContain('sleeve_organizations__orgId AS (');
      expect(s).toContain('SELECT DISTINCT');
      expect(s).toContain('organizations_raw.__owox_rid AS _oid');
      expect(s).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      expect(s).toContain(
        'ANY_VALUE(sleeve_organizations__orgId.`organizations__orgId | SUM`) ' +
          'AS `organizations__orgId | SUM`'
      );
      // The old dedup+SUM path over the (fanned-out) dedup CTE must be gone for this metric.
      expect(s).not.toContain('SUM(organizations.organizations__orgId)');
      // Exactly one pull from the sleeve — no double emission.
      expect(
        s.match(/ANY_VALUE\(sleeve_organizations__orgId\.`organizations__orgId \| SUM`\)/g)
      ).toHaveLength(1);
    });

    it('routes joined AVG through a value sleeve instead of dedup+AVG', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [{ column: 'organizations__orgId', function: 'AVG' } as AggregationRule],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      expect(s).toContain('sleeve_organizations__orgId AS (');
      expect(s).toContain('AVG(_val) AS `organizations__orgId | AVG`');
      expect(s).toContain(
        'ANY_VALUE(sleeve_organizations__orgId.`organizations__orgId | AVG`) ' +
          'AS `organizations__orgId | AVG`'
      );
      expect(s).not.toContain('AVG(organizations.organizations__orgId)');
      expect(
        s.match(/ANY_VALUE\(sleeve_organizations__orgId\.`organizations__orgId \| AVG`\)/g)
      ).toHaveLength(1);
    });

    it('a joined COUNT still uses the dedup branch — it counts the rows the join keeps', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [{ column: 'organizations__orgId', function: 'COUNT' } as AggregationRule],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      expect(s).not.toContain('sleeve_organizations__orgId');
      expect(s).toContain(
        'COUNT(organizations.organizations__orgId) AS `organizations__orgId | COUNT`'
      );
    });

    it('a joined MIN/MAX reads the same raw grain as AVG, so the three stay comparable', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [
          { column: 'organizations__orgId', function: 'MIN' } as AggregationRule,
          { column: 'organizations__orgId', function: 'MAX' } as AggregationRule,
          { column: 'organizations__orgId', function: 'AVG' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      // Reading MIN/MAX off the dedup CTE measured a value the pre-join roll-up had already
      // collapsed, so MIN <= AVG <= MAX could fail against a sleeve-routed AVG.
      expect(s).toContain('MIN(_val) AS `organizations__orgId | MIN`');
      expect(s).toContain('MAX(_val) AS `organizations__orgId | MAX`');
      expect(s).toContain('AVG(_val) AS `organizations__orgId | AVG`');
      expect(s).not.toContain('MIN(organizations.organizations__orgId)');
      expect(s.match(/SELECT DISTINCT/g)).toHaveLength(1);
    });

    it('a main-native (non-blended) SUM stays on the normal aggregated path — no sleeve', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        columns: [...context.columns, 'revenue'],
        aggregations: [{ column: 'revenue', function: 'SUM' } as AggregationRule],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      expect(s).not.toContain('sleeve_revenue');
      expect(s).toContain('SUM(main.revenue) AS `revenue | SUM`');
    });

    it('a column carrying both a sleeve function (SUM) and a non-sleeve one (COUNT) emits both — no loss', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__orgId', function: 'COUNT' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      // SUM pulled from its sleeve:
      expect(s).toContain('sleeve_organizations__orgId AS (');
      expect(s).toContain(
        'ANY_VALUE(sleeve_organizations__orgId.`organizations__orgId | SUM`) ' +
          'AS `organizations__orgId | SUM`'
      );
      // COUNT still on the dedup branch, unaffected:
      expect(s).toContain(
        'COUNT(organizations.organizations__orgId) AS `organizations__orgId | COUNT`'
      );
    });

    it('two sleeve functions on the same column (SUM + AVG) merge into ONE sleeve CTE', () => {
      // Realistic case: a Totals report auto-requests SUM AND AVG for the same numeric
      // field. Before 1 this emitted TWO identically-shaped `SELECT DISTINCT`
      // dedup subqueries, disambiguated via a `_SUM`/`_AVG`-suffixed CTE name (the old
      // `cteNameOverride` collision hack). Now both aggregates read ONE shared dedup pass,
      // so there is no same-name collision left to disambiguate — the CTE keeps its
      // ordinary bare `sleeve_<col>` name.
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureEventsUsersOrgs();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__orgId', function: 'AVG' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      expect(s).toContain('sleeve_organizations__orgId AS (');
      expect(s.match(/sleeve_organizations__orgId AS \(/g)).toHaveLength(1);
      // ONE dedup pass, not two.
      expect(s.match(/SELECT DISTINCT/g)).toHaveLength(1);
      expect(s).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      expect(s).toContain('AVG(_val) AS `organizations__orgId | AVG`');
      expect(s).toContain(
        'ANY_VALUE(sleeve_organizations__orgId.`organizations__orgId | SUM`) ' +
          'AS `organizations__orgId | SUM`'
      );
      expect(s).toContain(
        'ANY_VALUE(sleeve_organizations__orgId.`organizations__orgId | AVG`) ' +
          'AS `organizations__orgId | AVG`'
      );
      // ONE join-back feeds both aggregates.
      expect(s.match(/LEFT JOIN sleeve_organizations__orgId ON/g)).toHaveLength(1);
    });
  });

  // merging same-owner/same-dims value sleeves into one dedup pass. The
  // SUM+AVG-one-column case is covered above (both here and in the post-join-aggregation
  // describe); these add the remaining Step-1 cases: different columns of the SAME owner
  // still merge, but a value sleeve never merges with a COUNT_DISTINCT sleeve.
  describe('value-sleeve merging', () => {
    // A SECOND blended field ('organizations__name') actually wired into the chain's own
    // `blendedFields` (unlike fixtureEventsUsersOrgs's fieldIndex-only second column) so
    // buildBlendedQuery's own `outputAliasToRoot` — built from the chain, not a
    // hand-rolled test map — resolves it as a real sleeve-eligible column.
    function fixtureOrgTwoFields(): { context: BlendedQueryContext } {
      const organizationsChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-organizations',
          targetAlias: 'organizations',
          joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'orgId' }],
        }),
        targetTableReference: 'organizations_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'orgId',
            outputAlias: 'organizations__orgId',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
          {
            targetFieldName: 'name',
            outputAlias: 'organizations__name',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
        ],
      });
      const usersChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-users',
          targetAlias: 'users',
          joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'userId' }],
        }),
        targetTableReference: 'users_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'country',
            outputAlias: 'users__country',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE',
          },
        ],
      });

      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'organizations__orgId',
            aliasPath: 'organizations',
            originalFieldName: 'orgId',
            type: 'FLOAT64',
          },
          {
            name: 'organizations__name',
            aliasPath: 'organizations',
            originalFieldName: 'name',
            type: 'FLOAT64',
          },
          {
            name: 'users__country',
            aliasPath: 'users',
            originalFieldName: 'country',
            type: 'STRING',
          },
        ],
        availableSources: [
          { aliasPath: 'organizations', isIncluded: true },
          { aliasPath: 'users', isIncluded: true },
        ],
      } as never);

      const context: BlendedQueryContext = {
        ...buildContext(
          [organizationsChain, usersChain],
          ['users__country', 'organizations__orgId', 'organizations__name']
        ),
        fieldIndex,
      };

      return { context };
    }

    it('keeps two SUM metrics on DIFFERENT columns of the SAME owner in SEPARATE dedup passes', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureOrgTwoFields();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__name', function: 'SUM' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      // DISTINCT spans the whole tuple, so two value columns in one pass let a difference in
      // either keep rows apart that the owner identity is meant to collapse.
      expect(s).toContain('sleeve_organizations__orgId AS (');
      expect(s).toContain('sleeve_organizations__name AS (');
      expect(s.match(/SELECT DISTINCT/g)).toHaveLength(2);
      expect(s).not.toContain('_val_0');
      expect(s).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      expect(s).toContain('SUM(_val) AS `organizations__name | SUM`');
      expect(
        s.match(/ANY_VALUE\(sleeve_organizations__orgId\.`organizations__orgId \| SUM`\)/g)
      ).toHaveLength(1);
      expect(
        s.match(/ANY_VALUE\(sleeve_organizations__name\.`organizations__name \| SUM`\)/g)
      ).toHaveLength(1);
    });

    // covers WHERE forwarding through the SINGLETON `buildSleeveCte` path (which
    // delegates to `buildValueSleeveGroupCte` with a one-metric group); this pins the SAME
    // forwarding for the MERGED multi-metric group path, exercised only via
    // `buildBlendedQuery` end-to-end (there is no direct unit-level call to
    // `buildValueSleeveGroupCte` with >1 metric elsewhere in this file).
    it('forwards a post-join filter into EVERY value sleeve, each with its own param prefix', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureOrgTwoFields();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__name', function: 'SUM' } as AggregationRule,
        ],
        filters: [
          { column: 'main_region', operator: 'eq', value: 'US', placement: 'post-join' },
        ] as FilterRule[],
      };

      const { sql, params } = builder.buildBlendedQuery(ctx);

      for (const [cteName, param] of [
        ['sleeve_organizations__orgId', '@slv0p0'],
        ['sleeve_organizations__name', '@slv1p0'],
      ]) {
        const sleeveBody = normalizeSql(extractCteBody(sql, cteName));
        expect(sleeveBody).toContain(`WHERE main.main_region = ${param}`);
        expect(sleeveBody.indexOf('WHERE')).toBeLessThan(sleeveBody.indexOf('_dedup'));
      }
      // A unique prefix per sleeve is what keeps positional (Athena) binding aligned.
      expect(params.slice(0, 2)).toEqual([
        { name: 'slv0p0', value: 'US' },
        { name: 'slv1p0', value: 'US' },
      ]);
    });

    it('does NOT merge a value sleeve with a COUNT_DISTINCT sleeve on the SAME owner (different dedup shapes)', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureOrgTwoFields();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__name', function: 'COUNT_DISTINCT' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      // Two SEPARATE sleeve CTEs, each keeping its own bare per-column name — never one
      // merged `sleeve_organizations_values` CTE.
      expect(s).toContain('sleeve_organizations__orgId AS (');
      expect(s).toContain('sleeve_organizations__name AS (');
      expect(s).not.toContain('sleeve_organizations_values');
      // Only the value sleeve's inner subquery uses SELECT DISTINCT — the COUNT_DISTINCT
      // sleeve counts distinct directly via COUNT(DISTINCT ...), a different dedup shape.
      expect(s.match(/SELECT DISTINCT/g)).toHaveLength(1);
      expect(s).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      expect(s).toContain(
        'COUNT(DISTINCT organizations_raw.name) AS `organizations__name | COUNTUNIQUE`'
      );
    });

    it('1 review (FIX 1): SUM + COUNT_DISTINCT on the SAME joined column emit TWO distinctly-named sleeve CTEs (no duplicate CTE name)', () => {
      // Governance's offered menu never lets a numeric column carry both COUNT_DISTINCT and
      // SUM/AVG, but OutputControlsValidatorService.buildAggregationGovernance applies a
      // blended field's `postJoinAggregations` override VERBATIM (no intersectWithSupported
      // clamp — unlike the Totals path), so a stale/crafted override can slip a
      // COUNT_DISTINCT onto a numeric joined column. The COUNT_DISTINCT sleeve and the SUM
      // value sleeve both want the bare `sleeve_<col>` name and do NOT merge (different
      // dedup shapes), so the cross-sleeve collision guard must rename one — otherwise the
      // WITH clause has a duplicate CTE name (invalid SQL every warehouse rejects).
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureOrgTwoFields();
      const ctx: BlendedQueryContext = {
        ...context,
        columns: ['organizations__orgId'], // dimensionless grand total → CROSS JOINs
        aggregations: [
          { column: 'organizations__orgId', function: 'SUM' } as AggregationRule,
          { column: 'organizations__orgId', function: 'COUNT_DISTINCT' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      // Two DISTINCTLY-named sleeve CTEs — the bare name kept by the first-planned sleeve
      // (COUNT_DISTINCT), the collision disambiguated for the second (SUM value sleeve).
      expect(s).toContain('sleeve_organizations__orgId AS (');
      expect(s).toContain('sleeve_organizations__orgId_2 AS (');
      // No duplicate CTE header in the WITH clause — the bare name appears EXACTLY once
      // (the regression: before the guard it appeared twice → duplicate CTE name).
      expect(s.match(/sleeve_organizations__orgId AS \(/g)).toHaveLength(1);
      expect(s.match(/sleeve_organizations__orgId_2 AS \(/g)).toHaveLength(1);
      // Each function lives in its OWN CTE, its own dedup shape.
      expect(s).toContain(
        'COUNT(DISTINCT organizations_raw.orgId) AS `organizations__orgId | COUNTUNIQUE`'
      );
      expect(s).toContain('SUM(_val) AS `organizations__orgId | SUM`');
      // Distinct join-backs, one per CTE (grand total → CROSS JOIN).
      expect(s.match(/CROSS JOIN sleeve_organizations__orgId(?![_a-z0-9])/gi)).toHaveLength(1);
      expect(s.match(/CROSS JOIN sleeve_organizations__orgId_2\b/g)).toHaveLength(1);
      // Both metric values are pulled, each from its OWN (distinct) CTE.
      expect(s).toContain(
        'ANY_VALUE(sleeve_organizations__orgId.`organizations__orgId | COUNTUNIQUE`)'
      );
      expect(s).toContain('ANY_VALUE(sleeve_organizations__orgId_2.`organizations__orgId | SUM`)');
    });
  });

  // (C3): a blended field whose OWN pre-join `aggregateFunction` is NON-identity
  // (anything but `ANY_VALUE` — e.g. the "funnel" shape: `COUNT(DISTINCT hitId)` per
  // session) must have its value sleeve carry the DEDUP CTE's ALREADY-aggregated column as
  // `_val`, keyed by the pre-join GROUP KEY as `_oid` — NOT the raw column keyed by the
  // raw-row `__owox_rid` surrogate (which sums/averages raw, pre-dedup ids: a type error on
  // STRING ids, a silently wrong number on numeric ones). Pre-R2, `buildValueSleeveGroupCte`
  // always used `sleeveRawRef`/`__owox_rid` here regardless of the field's own pre-join
  // aggregate — these tests FAIL against that code.
  describe('value sleeve — non-identity pre-join aggregate (, funnel)', () => {
    // main = sessions (session_id, campaign — campaign is a MAIN-native dimension). chain
    // 'hits' off main has pre-join aggregateFunction COUNT_DISTINCT, so its dedup CTE
    // `hits` computes `COUNT(DISTINCT hitId) AS hits__hitId` PER session_id (the join key —
    // one row per session). A report SUMs `hits__hitId` post-join, grouped by campaign:
    // the sum, across a campaign's sessions, of each session's OWN distinct-hit count.
    function fixtureSessionHitsFunnel(): {
      context: BlendedQueryContext;
      outputAliasToRoot: ReadonlyMap<string, string>;
    } {
      const hitsChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-hits',
          targetAlias: 'hits',
          joinConditions: [{ sourceFieldName: 'session_id', targetFieldName: 'session_id' }],
        }),
        targetTableReference: 'hits_table',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'hitId',
            outputAlias: 'hits__hitId',
            isHidden: false,
            aggregateFunction: 'COUNT_DISTINCT',
          },
        ],
      });

      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'hits__hitId', aliasPath: 'hits', originalFieldName: 'hitId', type: 'INT64' },
        ],
        availableSources: [{ aliasPath: 'hits', isIncluded: true }],
      } as never);

      const outputAliasToRoot = new Map([['hits__hitId', 'hits']]);

      const context: BlendedQueryContext = {
        ...buildContext([hitsChain], ['campaign', 'hits__hitId']),
        fieldIndex,
      };

      return { context, outputAliasToRoot };
    }

    it("SUM: carries the dedup CTE's aggregated column as _val keyed by the pre-join GROUP KEY, not the raw column keyed by __owox_rid", () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureSessionHitsFunnel();
      const metric = { column: 'hits__hitId', function: 'SUM' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['campaign'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      // _val reads the OWNER'S OWN dedup CTE column (`hits.hits__hitId`, the
      // `COUNT(DISTINCT hitId)` per session) — the defect (C3) this method fixes: it used
      // to read the RAW `hits_raw.hitId` column instead, summing raw ids.
      expect(sql).toContain('hits.hits__hitId AS _val');
      expect(sql).not.toContain('hits_raw');
      // Identity is the pre-join GROUP KEY (the column the owner's dedup CTE groups by),
      // NOT the raw-row `__owox_rid` surrogate.
      expect(sql).toContain('hits.session_id AS _oid');
      expect(sql).not.toContain('__owox_rid');
      // The owner's OWN dedup CTE is joined directly off `main` (a root chain) — the same
      // join shape a dimension/filter dedup join uses.
      expect(sql).toContain('LEFT JOIN hits ON main.session_id = hits.session_id');
      expect(sql).toContain('SUM(_val) AS `hits__hitId | SUM`');
      expect(sleeve.dimRefs).toEqual([
        { column: 'campaign', outer: 'main.campaign', sleeve: 'sleeve_hits__hitId._owox_dim_0' },
      ]);
    });

    it('AVG: same non-identity value/identity legs, wrapped by an outer AVG', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureSessionHitsFunnel();
      const metric = { column: 'hits__hitId', function: 'AVG' } as AggregationRule;

      const sleeve = builder
        .sleeves()
        .buildSleeveCte(metric, ['campaign'], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      expect(sql).toContain('hits.hits__hitId AS _val');
      expect(sql).toContain('hits.session_id AS _oid');
      expect(sql).not.toContain('hits_raw');
      expect(sql).not.toContain('__owox_rid');
      expect(sql).toContain('AVG(_val) AS `hits__hitId | AVG`');
    });

    it('grand-total (no dims): non-identity owner needs no raw ancestor join at all — only the owner dedup-CTE join', () => {
      const builder = new TestBlendedWithRenderer();
      const { context, outputAliasToRoot } = fixtureSessionHitsFunnel();
      const metric = { column: 'hits__hitId', function: 'SUM' } as AggregationRule;

      const sleeve = builder.sleeves().buildSleeveCte(metric, [], context, outputAliasToRoot);
      const sql = normalizeSql(sleeve.sql);

      expect(sql).toContain('SELECT DISTINCT hits.session_id AS _oid, hits.hits__hitId AS _val');
      expect(sql).toContain('LEFT JOIN hits ON main.session_id = hits.session_id');
      expect(sql).not.toContain('hits_raw');
      expect(sql).toContain('SUM(_val) AS `hits__hitId | SUM`');
      expect(sql).not.toMatch(/GROUP BY/);
      expect(sleeve.dimRefs).toEqual([]);
    });

    it('buildBlendedQuery end-to-end: routes a non-identity blended SUM through the value sleeve reading the dedup CTE column', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureSessionHitsFunnel();
      const ctx: BlendedQueryContext = {
        ...context,
        aggregations: [{ column: 'hits__hitId', function: 'SUM' } as AggregationRule],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      expect(s).toContain('sleeve_hits__hitId AS (');
      expect(s).toContain('hits.hits__hitId AS _val');
      expect(s).toContain('hits.session_id AS _oid');
      expect(s).toContain(
        'ANY_VALUE(sleeve_hits__hitId.`hits__hitId | SUM`) AS `hits__hitId | SUM`'
      );
      // The SLEEVE CTE's OWN body (not the whole query — `hits_raw` legitimately exists
      // elsewhere in the WITH clause, feeding the `hits` dedup CTE itself) must not
      // reference the raw path: the non-identity value/identity legs come entirely from
      // the OWNER's own already-aggregated dedup CTE.
      const sleeveBody = normalizeSql(extractCteBody(sql, 'sleeve_hits__hitId'));
      expect(sleeveBody).not.toContain('hits_raw');
    });

    // defensive split: an identity (ANY_VALUE) field and a non-identity field on
    // the SAME owner + dimensions must NOT merge into one sleeve CTE — merging would read
    // the non-identity value off the identity metric's per-raw-row-fanned row set,
    // multiplying it once per raw row. `groupValueSleeveMetrics` groups by (owner, dims)
    // alone, so this exercises `splitValueSleeveGroupsByIdentity` pulling them back apart.
    it('does NOT merge an identity field with a non-identity field on the SAME owner + dimensions', () => {
      const builder = new TestBlendedWithRenderer();
      const { context } = fixtureSessionHitsFunnel();
      const hitsChainWithNote = {
        ...context.chains[0],
        blendedFields: [
          ...context.chains[0].blendedFields,
          {
            targetFieldName: 'note',
            outputAlias: 'hits__note',
            isHidden: false,
            aggregateFunction: 'ANY_VALUE' as const,
          },
        ],
      };
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'hits__hitId', aliasPath: 'hits', originalFieldName: 'hitId', type: 'INT64' },
          { name: 'hits__note', aliasPath: 'hits', originalFieldName: 'note', type: 'STRING' },
        ],
        availableSources: [{ aliasPath: 'hits', isIncluded: true }],
      } as never);
      const ctx: BlendedQueryContext = {
        ...context,
        chains: [hitsChainWithNote],
        columns: ['campaign', 'hits__hitId', 'hits__note'],
        fieldIndex,
        aggregations: [
          { column: 'hits__hitId', function: 'SUM' } as AggregationRule,
          { column: 'hits__note', function: 'SUM' } as AggregationRule,
        ],
      };

      const { sql } = builder.buildBlendedQuery(ctx);
      const s = normalizeSql(sql);

      // Two SEPARATE sleeve CTEs (never one merged `sleeve_hits_values...`) — one per
      // identity classification.
      expect(s).toContain('sleeve_hits__hitId AS (');
      expect(s).toContain('sleeve_hits__note AS (');
      expect(s).not.toContain('sleeve_hits_values');
      expect(s.match(/SELECT DISTINCT/g)).toHaveLength(2);
      // The non-identity CTE reads the dedup CTE column; the identity CTE reads the raw
      // column keyed by `__owox_rid`.
      expect(s).toContain('hits.hits__hitId AS _val');
      expect(s).toContain('hits_raw.note AS _val');
      expect(s).toContain('hits_raw.__owox_rid AS _oid');
    });
  });
});
