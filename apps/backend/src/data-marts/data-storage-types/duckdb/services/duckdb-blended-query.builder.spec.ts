import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { Test, TestingModule } from '@nestjs/testing';
import type { RoutedFilterRule } from '../../../dto/domain/filter-clause';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import type { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import {
  createBuildContext,
  makeChain,
  makeRelationship,
} from '../../interfaces/__fixtures__/blended-query-builder-fixtures';
import { buildBlendedFieldIndex } from '../../../services/blended-field-index';
import { buildFormulaOwnerPlan } from '../../../calculated-fields/formula-owner-plan';
import { createFormulaFunctionDialectRegistry } from '../../../calculated-fields/formula-function-dialect';
import { DuckDbBlendedQueryBuilder } from './duckdb-blended-query.builder';
import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import {
  createProductionDuckDbInstance,
  readSerializedRows,
} from '../__fixtures__/production-duckdb-instance';

const buildContext = createBuildContext('"mydb"."customers"');

describe('DuckDbBlendedQueryBuilder', () => {
  let builder: DuckDbBlendedQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DuckDbBlendedQueryBuilder, DuckDbClauseRenderer],
    }).compile();

    builder = module.get(DuckDbBlendedQueryBuilder);
  });

  it('should have type DUCKDB', () => {
    expect(builder.type).toBe(DataStorageType.DUCKDB);
  });

  it('uses an ordered string_agg for STRING_AGG aggregation, and joins both mart references via CTE + JOIN', () => {
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
      "string_agg(CAST(order_name AS VARCHAR), ', ' ORDER BY CAST(order_name AS VARCHAR)) AS order_names"
    );
    expect(sql).not.toContain('ARRAY_JOIN');
    expect(sql).not.toContain('ARRAY_AGG');
    expect(sql).not.toContain('LISTAGG');
    expect(sql).not.toContain('COLLECT_LIST');

    // Single-connection CTE + JOIN referencing both the main mart and the subsidiary mart.
    // (Simple identifiers like `orders` match the unquoted fast-path in quoteIdentifier,
    // so only identifiers needing escaping — covered by the dedicated quoting test below —
    // actually surface the `"` quote char here.)
    expect(sql).toContain('WITH');
    expect(sql).toContain('"mydb"."customers"'); // main mart reference
    expect(sql).toContain('"mydb"."orders"'); // subsidiary mart reference
    expect(sql).toContain('LEFT JOIN orders ON main.id = orders.customer_id');
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

  it('rolls the joined orders up per customer when DuckDB runs the SQL', async () => {
    const instance = await createProductionDuckDbInstance();
    const connection = await instance.connect();
    try {
      await connection.run(
        `CREATE TABLE main.customers AS SELECT * FROM (VALUES (1, 'Ann'), (2, 'Bob'), (3, 'Cy')) AS v(id, name)`
      );
      await connection.run(
        `CREATE TABLE main.orders AS SELECT * FROM (VALUES ` +
          `(1, 'b', 10.0), (1, 'a', 5.0), (2, 'c', 7.0)) AS v(customer_id, order_name, amount)`
      );
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: '"main"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'order_name',
            outputAlias: 'order_names',
            isHidden: false,
            aggregateFunction: 'STRING_AGG',
          },
          {
            targetFieldName: 'amount',
            outputAlias: 'total_amount',
            isHidden: false,
            aggregateFunction: 'SUM',
          },
        ],
      });
      const { sql } = builder.buildBlendedQuery(
        createBuildContext('"main"."customers"')(
          [chain],
          ['id', 'name', 'order_names', 'total_amount']
        )
      );

      const rows = await readSerializedRows(connection, `${sql}\nORDER BY main.id`);
      expect(rows).toEqual([
        { id: 1, name: 'Ann', order_names: 'a, b', total_amount: 15 },
        { id: 2, name: 'Bob', order_names: 'c', total_amount: 7 },
        { id: 3, name: 'Cy', order_names: null, total_amount: null },
      ]);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });

  it('computes a row-level and a joined aggregate calculated field when DuckDB runs the SQL', async () => {
    const instance = await createProductionDuckDbInstance();
    const connection = await instance.connect();
    try {
      await connection.run(
        `CREATE TABLE main.customers AS SELECT * FROM (VALUES ` +
          `(1, 'A', 10.0, 4.0), (2, 'A', 10.0, 4.0), (3, 'B', 5.0, 1.0)) AS v(id, segment, revenue, cost)`
      );
      await connection.run(
        `CREATE TABLE main.orders AS SELECT * FROM (VALUES ` +
          `(1, 10.0), (1, 5.0), (2, 7.0), (3, 1.0)) AS v(customer_id, amount)`
      );
      const chain = makeChain({
        relationship: makeRelationship(),
        targetTableReference: '"main"."orders"',
        parentAlias: 'main',
        blendedFields: [
          {
            targetFieldName: 'amount',
            outputAlias: 'orders__amount',
            isHidden: false,
            aggregateFunction: 'SUM',
          },
        ],
      });
      const roiFormula = 'SUM({{ref path="orders" field="amount"}}) * 2';
      const dialect = await createFormulaFunctionDialectRegistry().resolve(DataStorageType.DUCKDB);
      const { sql } = builder.buildBlendedQuery({
        ...createBuildContext('"main"."customers"')([chain], ['segment']),
        fieldIndex: buildBlendedFieldIndex({
          blendedFields: [
            {
              name: 'orders__amount',
              aliasPath: 'orders',
              originalFieldName: 'amount',
              type: 'DOUBLE',
            },
          ],
          availableSources: [{ aliasPath: 'orders', isIncluded: true }],
        } as never),
        calculatedFields: [
          {
            outputName: 'margin',
            type: 'DOUBLE',
            formula: '{{ref field="revenue"}} - {{ref field="cost"}}',
            level: 'column',
          },
          {
            outputName: 'roi',
            type: 'DOUBLE',
            formula: roiFormula,
            level: 'metric',
            formulaOwnership: buildFormulaOwnerPlan(roiFormula, n =>
              dialect.isAggregateFunction(n)
            ),
          },
        ],
      });

      expect(sql).toContain('sleeve_fx_roi_0');
      const rows = await readSerializedRows(connection, sql);
      expect(rows.sort((a, b) => String(a.segment).localeCompare(String(b.segment)))).toEqual([
        { segment: 'A', margin: 6, roi: 44 },
        { segment: 'B', margin: 4, roi: 2 },
      ]);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });

  // DuckDB has native ANY_VALUE support, so the base AbstractBlendedQueryBuilder default
  // must be inherited as-is (unlike Athena/Trino, which overrides it to arbitrary()).
  it('uses the inherited ANY_VALUE(field) default for ANY_VALUE leaf aggregation (no override)', () => {
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

    expect(sql).toContain('ANY_VALUE(order_name) AS sample_name');
    expect(sql).not.toContain('arbitrary');
  });

  describe('metric filters at a separate grouping, on DuckDB', () => {
    let instance: DuckDBInstance;
    let connection: DuckDBConnection;

    beforeEach(async () => {
      instance = await createProductionDuckDbInstance();
      connection = await instance.connect();
      await connection.run(
        `CREATE TABLE main.customers AS SELECT * FROM (VALUES ` +
          `(1, 'A', 'EU', 60.0), (2, 'A', 'US', 70.0), (3, 'B', 'EU', 50.0), (4, 'B', 'US', 20.0)` +
          `) AS v(id, segment, region, revenue)`
      );
      await connection.run(
        `CREATE TABLE main.orders AS SELECT * FROM (VALUES ` +
          `(1, 'o1', 10.0, 'web'), (1, 'o2', 5.0, 'web'), (2, 'o3', 7.0, 'shop'), ` +
          `(3, 'o4', 100.0, 'shop'), (4, 'o5', 1.0, 'web')` +
          `) AS v(customerId, orderId, amount, channel)`
      );
    });

    afterEach(() => {
      connection.closeSync();
      instance.closeSync();
    });

    const sumRevenueAbove100: RoutedFilterRule = {
      column: 'revenue',
      function: 'SUM',
      operator: 'gt',
      value: 100,
      clause: 'having',
    };
    const ordersChain = makeChain({
      relationship: makeRelationship({
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customerId' }],
      }),
      targetTableReference: '"main"."orders"',
      parentAlias: 'main',
      blendedFields: [
        {
          targetFieldName: 'amount',
          outputAlias: 'orders__amount',
          isHidden: false,
          aggregateFunction: 'SUM',
        },
        {
          targetFieldName: 'orderId',
          outputAlias: 'orders__orderId',
          isHidden: false,
          aggregateFunction: 'ANY_VALUE',
        },
        {
          targetFieldName: 'channel',
          outputAlias: 'orders__channel',
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
        {
          name: 'orders__orderId',
          aliasPath: 'orders',
          originalFieldName: 'orderId',
          type: 'VARCHAR',
        },
        {
          name: 'orders__channel',
          aliasPath: 'orders',
          originalFieldName: 'channel',
          type: 'VARCHAR',
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
    } as never);

    // Segment A (60 + 70) passes and segment B (50 + 20) fails, so only customers 1 and 2 are read.
    const readByRegion = (columns: string[], controls: Partial<BlendedQueryContext>) => {
      const { sql } = builder.buildBlendedQuery({
        ...createBuildContext('"main"."customers"')([ordersChain], columns),
        fieldIndex,
        sort: [{ column: 'region', direction: 'asc' }],
        groupRestriction: { dimensions: ['segment'], having: [sumRevenueAbove100] },
        ...controls,
      });
      return readSerializedRows(connection, sql);
    };

    it('computes a native and a joined SUM over the kept rows only', async () => {
      const rows = await readByRegion(['region', 'revenue', 'orders__amount'], {
        aggregations: [
          { column: 'revenue', function: 'SUM' },
          { column: 'orders__amount', function: 'SUM' },
        ],
      });
      expect(rows).toEqual([
        { region: 'EU', 'revenue | SUM': 60, 'orders__amount | SUM': 15 },
        { region: 'US', 'revenue | SUM': 70, 'orders__amount | SUM': 7 },
      ]);
    });

    it('counts distinct joined values over the kept rows only', async () => {
      const rows = await readByRegion(['region', 'orders__orderId'], {
        aggregations: [{ column: 'orders__orderId', function: 'COUNT_DISTINCT' }],
      });
      expect(rows).toEqual([
        { region: 'EU', 'orders__orderId | COUNTUNIQUE': 2 },
        { region: 'US', 'orders__orderId | COUNTUNIQUE': 1 },
      ]);
    });

    it('counts the joined Unique Count over the kept rows only', async () => {
      const rows = await readByRegion(['region'], {
        uniqueCountSources: [
          {
            aliasPath: 'orders',
            cteName: 'orders',
            pkColumns: ['orderId'],
            outputLabel: 'orders__unique_count',
          },
        ],
      });
      expect(rows).toEqual([
        { region: 'EU', orders__unique_count: 2 },
        { region: 'US', orders__unique_count: 1 },
      ]);
    });

    // Per customer the channel is web for 1 and 4 (80, fails) and shop for 2 and 3 (120, passes).
    it('checks the metric filter at a joined grouping key', async () => {
      const rows = await readByRegion(['region', 'revenue'], {
        aggregations: [{ column: 'revenue', function: 'SUM' }],
        groupRestriction: { dimensions: ['orders__channel'], having: [sumRevenueAbove100] },
      });
      expect(rows).toEqual([
        { region: 'EU', 'revenue | SUM': 50 },
        { region: 'US', 'revenue | SUM': 70 },
      ]);
    });

    it('returns one row without grouping keys, with NULL metrics and a zero COUNT when no group passes', async () => {
      const scorecard = (value: number) =>
        readByRegion(['revenue', 'id', 'orders__amount'], {
          aggregations: [
            { column: 'revenue', function: 'SUM' },
            { column: 'id', function: 'COUNT' },
            { column: 'orders__amount', function: 'SUM' },
          ],
          sort: [],
          groupRestriction: {
            dimensions: ['segment'],
            having: [{ ...sumRevenueAbove100, value }],
          },
        });
      expect(await scorecard(100)).toEqual([
        { 'revenue | SUM': 130, 'id | COUNT': 2, 'orders__amount | SUM': 22 },
      ]);
      expect(await scorecard(1000)).toEqual([
        { 'revenue | SUM': null, 'id | COUNT': 0, 'orders__amount | SUM': null },
      ]);
    });

    it('refuses a restriction on a query that does not aggregate', () => {
      expect(() =>
        builder.buildBlendedQuery({
          ...createBuildContext('"main"."customers"')([ordersChain], ['region']),
          fieldIndex,
          groupRestriction: { dimensions: ['segment'], having: [sumRevenueAbove100] },
        })
      ).toThrow(/buildBlendedQuery ungrouped query: \[revenue\] are routed to HAVING/);
    });
  });
});
