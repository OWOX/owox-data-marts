import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { DuckDbQueryBuilder } from './duckdb-query.builder';
import type { RoutedFilterRule } from '../../../dto/domain/filter-clause';
import type { AggregationRule } from '../../../dto/schemas/aggregation-config.schema';
import type { SortRule } from '../../../dto/schemas/sort-config.schema';
import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import {
  isQueryBuildResult,
  QueryBuildResult,
} from '../../interfaces/data-mart-query-builder.interface';
import {
  createProductionDuckDbInstance,
  readSerializedRows,
} from '../__fixtures__/production-duckdb-instance';

const qb = () => new DuckDbQueryBuilder(new DuckDbClauseRenderer());

describe('DuckDbQueryBuilder', () => {
  it('plain SELECT from a connector definition target', () => {
    const def = {
      definitionType: 'CONNECTOR',
      connector: {
        storage: { fullyQualifiedName: 'main.orders' },
        source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
      },
    } as never;
    const sql = qb().buildQuery(def, { columns: ['id', 'name'] });
    const s = typeof sql === 'string' ? sql : sql.sql;
    expect(s).toMatch(/SELECT/i);
    expect(s).toMatch(/"id"/);
    expect(s).toMatch(/FROM\s+"main"\."orders"|"main.orders"/i);
  });

  it('applies LIMIT via the clause renderer', () => {
    const def = {
      definitionType: 'CONNECTOR',
      connector: {
        storage: { fullyQualifiedName: 'main.orders' },
        source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
      },
    } as never;
    const sql = qb().buildQuery(def, { columns: ['id'], limit: 10 });
    const s = typeof sql === 'string' ? sql : sql.sql;
    expect(s).toMatch(/LIMIT 10/);
  });
});

function sqlOf(result: string | QueryBuildResult): string {
  return isQueryBuildResult(result) ? result.sql : result;
}

describe('DuckDbQueryBuilder — additional coverage', () => {
  const tableDef = { fullyQualifiedName: 'main.events' } as never;

  it('plain SELECT for a table definition (no output controls) returns a bare string', () => {
    const out = qb().buildQuery(tableDef, { columns: ['id'] });
    expect(typeof out).toBe('string');
    expect(out).toBe('SELECT\n  "id"\nFROM "main"."events"');
  });

  it('emits inlined WHERE/ORDER BY/LIMIT for output controls (DuckDB has no bound-param channel)', () => {
    const out = qb().buildQuery(tableDef, {
      filters: [{ column: 'status', operator: 'eq', value: 'paid' }],
      sort: [{ column: 'created_at', direction: 'desc' }],
      limit: 50,
    });
    expect(isQueryBuildResult(out)).toBe(true);
    expect(sqlOf(out)).toContain(`WHERE "status" = 'paid'`);
    expect(sqlOf(out)).toContain('ORDER BY\n  "created_at" DESC');
    expect(sqlOf(out)).toContain('LIMIT 50');
    expect(isQueryBuildResult(out) ? out.params : undefined).toEqual([]);
  });

  it('throws for table pattern definitions (not supported in DuckDB)', () => {
    const patternDef = { pattern: 'events_*' } as never;
    expect(() => qb().buildQuery(patternDef, { columns: ['id'] })).toThrow(
      /not supported in DuckDB/
    );
  });

  it('wraps a sql definition when columns are provided; returns the bare (trimmed) query otherwise', () => {
    const sqlDefWithSemicolon = { sqlQuery: 'SELECT a, b FROM t;' } as never;
    expect(qb().buildQuery(sqlDefWithSemicolon, { columns: ['a'] })).toBe(
      'SELECT\n  "a"\nFROM (SELECT a, b FROM t)'
    );
    const sqlDef = { sqlQuery: 'SELECT a, b FROM t' } as never;
    expect(qb().buildQuery(sqlDef)).toBe('SELECT a, b FROM t');
  });

  it('refuses a SQL definition with an unresolved Data Mart reference on every path', () => {
    const sqlDef = {
      sqlQuery: `SELECT * FROM t WHERE p LIKE '%\\_x' ESCAPE '\\' UNION ALL SELECT * FROM [Archive](dm:0b5d4c3a-9e1f-4a6b-8c9d-0e1f2a3b4c5d)`,
    } as never;
    expect(() => qb().buildQuery(sqlDef)).toThrow();
    expect(() => qb().buildQuery(sqlDef, { columns: ['a'] })).toThrow();
    expect(() => qb().buildQuery(sqlDef, { limit: 5 })).toThrow();
  });

  it('a dateTrunc timeZone is threaded through to the renderer as a double AT TIME ZONE shift', () => {
    const withoutTz = qb().buildQuery(tableDef, {
      columns: ['date', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      dateTruncs: [{ column: 'date', unit: 'MONTH' }],
    });
    const withTz = qb().buildQuery(tableDef, {
      columns: ['date', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      dateTruncs: [{ column: 'date', unit: 'MONTH', timeZone: 'America/New_York' }],
    });
    expect(sqlOf(withoutTz)).not.toContain('AT TIME ZONE');
    expect(sqlOf(withTz)).toBe(
      `SELECT\n  date_trunc('month', (("date") AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York') AS "date",\n  SUM("revenue") AS "revenue | SUM"\n` +
        `FROM "main"."events"\nGROUP BY\n  date_trunc('month', (("date") AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')`
    );
    expect(sqlOf(withTz)).not.toBe(sqlOf(withoutTz));
  });
});

describe('DuckDbQueryBuilder — output controls run on DuckDB', () => {
  it('filters, buckets by the Kyiv day, aggregates and sorts', async () => {
    const instance = await createProductionDuckDbInstance();
    const connection = await instance.connect();
    try {
      await connection.run(
        `CREATE TABLE main.events AS SELECT * FROM (VALUES ` +
          `('UA', 10.0, TIMESTAMPTZ '2024-03-01 23:30:00+00'), ` +
          `('UA', 5.0, TIMESTAMPTZ '2024-03-02 10:00:00+00'), ` +
          `('UA', -1.0, TIMESTAMPTZ '2024-03-02 11:00:00+00'), ` +
          `('US', 7.0, TIMESTAMPTZ '2024-03-01 12:00:00+00')` +
          `) AS v(country, amount, ts)`
      );
      const out = qb().buildQuery({ fullyQualifiedName: 'main.events' } as never, {
        columns: ['country', 'ts', 'amount'],
        filters: [{ column: 'amount', operator: 'gt', value: 0 }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
        dateTruncs: [{ column: 'ts', unit: 'DAY', timeZone: 'Europe/Kyiv' }],
        sort: [
          { column: 'ts', direction: 'asc' },
          { column: 'country', direction: 'asc' },
        ],
        columnTypes: new Map([
          ['country', 'VARCHAR'],
          ['amount', 'DOUBLE'],
          ['ts', 'TIMESTAMPTZ'],
        ]),
      });

      const rows = await readSerializedRows(connection, sqlOf(out));
      expect(rows).toEqual([
        { country: 'US', ts: '2024-03-01 00:00:00', 'amount | SUM': 7 },
        { country: 'UA', ts: '2024-03-02 00:00:00', 'amount | SUM': 15 },
      ]);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });
});

describe('DuckDbQueryBuilder — calculated fields', () => {
  const tableDef = { fullyQualifiedName: 'main.holidays' } as never;
  const holidayCount = {
    outputName: 'holiday_count',
    type: 'BIGINT',
    formula: 'COUNT(DISTINCT {{ref field="id"}})',
    level: 'metric' as const,
  };
  const monthsAboveOne: RoutedFilterRule = {
    column: 'holiday_count',
    operator: 'gt',
    value: 1,
    clause: 'having',
  };
  const upperName = {
    outputName: 'upper_name',
    type: 'VARCHAR',
    formula: 'upper({{ref field="name"}})',
    level: 'column' as const,
  };
  const probe = {
    outputName: 'probe',
    type: 'DOUBLE',
    formula: '{{ref field="n_prefix"}} || {{ref field="n_suffix"}}',
    level: 'column' as const,
  };

  it('routes a calculated-metric-only request onto the aggregated path', () => {
    const sql = sqlOf(
      qb().buildQuery(tableDef, { columns: ['country'], calculatedFields: [holidayCount] })
    );
    expect(sql).toBe(
      'SELECT\n  "country",\n  COUNT(DISTINCT "id") AS "holiday_count"\nFROM "main"."holidays"\nGROUP BY\n  "country"'
    );
  });

  it('projects a row-level calculated field without grouping, sorted by its alias', () => {
    const sql = sqlOf(
      qb().buildQuery(tableDef, {
        columns: ['id'],
        sort: [{ column: 'upper_name', direction: 'asc' }],
        calculatedFields: [upperName],
      })
    );
    expect(sql).toBe(
      'SELECT\n  "id",\n  upper("name") AS "upper_name"\nFROM "main"."holidays"\nORDER BY\n  "upper_name" ASC'
    );
  });

  it('projects a row-level calculated field alone, without a wildcard', () => {
    const sql = sqlOf(qb().buildQuery(tableDef, { columns: [], calculatedFields: [upperName] }));
    expect(sql).toBe('SELECT\n  upper("name") AS "upper_name"\nFROM "main"."holidays"');
  });

  it('casts both sides of a filter on a DOUBLE-declared field, and sorts by the same cast', () => {
    const sql = sqlOf(
      qb().buildQuery(tableDef, {
        columns: [],
        filters: [{ column: 'probe', operator: 'gt', value: 5 }],
        sort: [{ column: 'probe', direction: 'desc' }],
        calculatedFields: [probe],
        calculatedFilterMetrics: [probe],
      })
    );
    expect(sql).toContain('WHERE CAST(("n_prefix" || "n_suffix") AS DOUBLE) > CAST(5 AS DOUBLE)');
    expect(sql).toContain('ORDER BY\n  CAST(("n_prefix" || "n_suffix") AS DOUBLE) DESC');
  });

  it('puts a filter on an aggregate field in HAVING and groups even when it is not selected', () => {
    const sql = sqlOf(
      qb().buildQuery(tableDef, {
        columns: ['country'],
        filters: [monthsAboveOne],
        calculatedFilterMetrics: [holidayCount],
      })
    );
    expect(sql).toBe(
      'SELECT\n  "country"\nFROM "main"."holidays"\nGROUP BY\n  "country"\nHAVING (COUNT(DISTINCT "id")) > 1'
    );
  });

  it('collapses a distinct-only request with SELECT DISTINCT', () => {
    expect(sqlOf(qb().buildQuery(tableDef, { columns: ['country'], distinct: true }))).toBe(
      'SELECT DISTINCT\n  "country"\nFROM "main"."holidays"'
    );
  });

  describe('on DuckDB', () => {
    let instance: DuckDBInstance;
    let connection: DuckDBConnection;

    beforeEach(async () => {
      instance = await createProductionDuckDbInstance();
      connection = await instance.connect();
      await connection.run(
        `CREATE TABLE main.holidays AS SELECT * FROM (VALUES ` +
          `(1, DATE '2026-01-01', 'New Year', '9', ''), ` +
          `(2, DATE '2026-01-02', 'Berchtold', '1', '0'), ` +
          `(3, DATE '2026-04-03', 'Good Friday', '10', '0'), ` +
          `(4, DATE '2026-04-06', 'Easter Monday', '3', ''), ` +
          `(5, DATE '2026-04-06', 'Easter Monday', '4', ''), ` +
          `(6, DATE '2026-05-14', 'Ascension', '2', '')` +
          `) AS v(id, date, name, n_prefix, n_suffix)`
      );
    });

    afterEach(() => {
      connection.closeSync();
      instance.closeSync();
    });

    const run = (options: Parameters<DuckDbQueryBuilder['buildQuery']>[1]) =>
      readSerializedRows(connection, sqlOf(qb().buildQuery(tableDef, options)));

    it('returns a row-level field filtered and sorted by its value', async () => {
      const rows = await run({
        columns: ['id'],
        filters: [{ column: 'upper_name', operator: 'contains', value: 'MONDAY' }],
        sort: [
          { column: 'upper_name', direction: 'desc' },
          { column: 'id', direction: 'desc' },
        ],
        calculatedFields: [upperName],
        calculatedFilterMetrics: [upperName],
        columnTypes: new Map([['id', 'BIGINT']]),
      });
      expect(rows).toEqual([
        { id: 5, upper_name: 'EASTER MONDAY' },
        { id: 4, upper_name: 'EASTER MONDAY' },
      ]);
    });

    it('counts distinct ids per month, keeps months above one and sorts by the count', async () => {
      const rows = await run({
        columns: ['date'],
        dateTruncs: [{ column: 'date', unit: 'MONTH' }],
        filters: [monthsAboveOne],
        sort: [{ column: 'holiday_count', direction: 'desc' }],
        calculatedFields: [holidayCount],
        calculatedFilterMetrics: [holidayCount],
        columnTypes: new Map([['date', 'DATE']]),
      });
      expect(rows).toEqual([
        { date: '2026-04-01', holiday_count: 3 },
        { date: '2026-01-01', holiday_count: 2 },
      ]);
    });

    it('buckets a DATE column into a DATE', async () => {
      const sql = sqlOf(
        qb().buildQuery(tableDef, {
          columns: ['date'],
          dateTruncs: [{ column: 'date', unit: 'MONTH' }],
          columnTypes: new Map([['date', 'DATE']]),
        })
      );
      const rows = await readSerializedRows(
        connection,
        `SELECT typeof("date") AS type, "date" FROM (${sql}) ORDER BY "date"`
      );
      expect(rows).toEqual([
        { type: 'DATE', date: '2026-01-01' },
        { type: 'DATE', date: '2026-04-01' },
        { type: 'DATE', date: '2026-05-01' },
      ]);
    });

    it('compares and sorts a DOUBLE-declared text formula as numbers', async () => {
      const rows = await run({
        columns: [],
        filters: [{ column: 'probe', operator: 'gt', value: 5 }],
        sort: [{ column: 'probe', direction: 'desc' }],
        limit: 2,
        calculatedFields: [probe],
        calculatedFilterMetrics: [probe],
      });
      expect(rows).toEqual([{ probe: '100' }, { probe: '10' }]);
    });

    it('restricts Totals to the months the report keeps', async () => {
      const rows = await run({
        columns: [],
        calculatedFields: [holidayCount],
        calculatedFilterMetrics: [holidayCount],
        groupRestriction: {
          dimensions: ['date'],
          dateTruncs: [{ column: 'date', unit: 'MONTH' }],
          having: [monthsAboveOne],
        },
        columnTypes: new Map([['date', 'DATE']]),
      });
      expect(rows).toEqual([{ holiday_count: 5 }]);
    });

    it('returns each distinct value once', async () => {
      const rows = await run({
        columns: ['name'],
        distinct: true,
        sort: [{ column: 'name', direction: 'asc' }],
      });
      expect(rows.map(r => r.name)).toEqual([
        'Ascension',
        'Berchtold',
        'Easter Monday',
        'Good Friday',
        'New Year',
      ]);
    });
  });
});

describe('DuckDbQueryBuilder — metric filters at a separate grouping', () => {
  const tableDef = { fullyQualifiedName: 'main.orders' } as never;
  const columnTypes = new Map([
    ['status', 'VARCHAR'],
    ['region', 'VARCHAR'],
    ['day', 'DATE'],
    ['revenue', 'DOUBLE'],
  ]);
  const sumRevenue: AggregationRule[] = [{ column: 'revenue', function: 'SUM' }];
  const sumRevenueAbove = (value: number): RoutedFilterRule => ({
    column: 'revenue',
    function: 'SUM',
    operator: 'gt',
    value,
    clause: 'having',
  });
  const byDay: SortRule[] = [{ column: 'day', direction: 'asc' }];
  let instance: DuckDBInstance;
  let connection: DuckDBConnection;

  beforeEach(async () => {
    instance = await createProductionDuckDbInstance();
    connection = await instance.connect();
  });

  afterEach(() => {
    connection.closeSync();
    instance.closeSync();
  });

  // Each case adds only its own rows, so its expected values read from the four base rows.
  const seed = async (...addedRows: string[]) => {
    await connection.run(
      'CREATE TABLE main.orders (status VARCHAR, region VARCHAR, day DATE, revenue DOUBLE)'
    );
    await connection.run(
      `INSERT INTO main.orders VALUES ` +
        [
          `('paid', 'EU', DATE '2026-01-01', 60)`,
          `('paid', 'US', DATE '2026-01-02', 70)`,
          `('refunded', 'EU', DATE '2026-01-01', 50)`,
          `('refunded', 'US', DATE '2026-01-02', 20)`,
          ...addedRows,
        ].join(', ')
    );
  };

  const run = (options: Parameters<DuckDbQueryBuilder['buildQuery']>[1]) =>
    readSerializedRows(connection, sqlOf(qb().buildQuery(tableDef, { columnTypes, ...options })));

  it('keeps the kept groups when a restriction is the only control', async () => {
    await seed(`('refunded', 'EU', DATE '2026-01-03', 5)`);
    const total = {
      outputName: 'total',
      type: 'DOUBLE',
      formula: 'SUM({{ref field="revenue"}})',
      level: 'metric' as const,
    };
    const totalAbove100: RoutedFilterRule = {
      column: 'total',
      operator: 'gt',
      value: 100,
      clause: 'having',
    };
    const options = {
      columns: ['day'],
      filters: [],
      calculatedFilterMetrics: [total],
      groupRestriction: { dimensions: ['status'], having: [totalAbove100] },
    };

    const sql = sqlOf(qb().buildQuery(tableDef, { columnTypes, ...options }));
    expect(sql).toContain('GROUP BY\n  "day"');
    expect(sql).toMatch(/\nJOIN \([\s\S]+\) AS "_kept_groups" ON /);
    const rows = await run(options);
    expect(rows.sort((a, b) => String(a.day).localeCompare(String(b.day)))).toEqual([
      { day: '2026-01-01' },
      { day: '2026-01-02' },
    ]);
  });

  it('groups the kept rows by its own columns', async () => {
    await seed();
    const rows = await run({
      columns: ['day', 'revenue'],
      aggregations: sumRevenue,
      sort: byDay,
      groupRestriction: { dimensions: ['status'], having: [sumRevenueAbove(100)] },
    });
    expect(rows).toEqual([
      { day: '2026-01-01', 'revenue | SUM': 60 },
      { day: '2026-01-02', 'revenue | SUM': 70 },
    ]);
  });

  it('returns one row without grouping keys, with a NULL metric when no group passes', async () => {
    await seed();
    const scorecard = (value: number) =>
      run({
        columns: ['revenue', 'status'],
        aggregations: [...sumRevenue, { column: 'status', function: 'COUNT' }],
        groupRestriction: { dimensions: ['status'], having: [sumRevenueAbove(value)] },
      });
    expect(await scorecard(100)).toEqual([{ 'revenue | SUM': 130, 'status | COUNT': 2 }]);
    expect(await scorecard(1000)).toEqual([{ 'revenue | SUM': null, 'status | COUNT': 0 }]);
  });

  it('checks the metric filter on the total when the grouping has no keys', async () => {
    await seed();
    const byDayAbove = (value: number) =>
      run({
        columns: ['day', 'revenue'],
        aggregations: sumRevenue,
        sort: byDay,
        groupRestriction: { dimensions: [], having: [sumRevenueAbove(value)] },
      });
    expect(await byDayAbove(100)).toEqual([
      { day: '2026-01-01', 'revenue | SUM': 110 },
      { day: '2026-01-02', 'revenue | SUM': 90 },
    ]);
    expect(await byDayAbove(1000)).toEqual([]);
  });

  // A key missing from the grain gives EU 110 and US 90; swapped keys match no group.
  it('pairs a row-level Calculated Field key listed before a native key', async () => {
    await seed();
    const statusUpper = {
      outputName: 'status_upper',
      type: 'VARCHAR',
      formula: 'upper({{ref field="status"}})',
      level: 'column' as const,
    };
    const rows = await run({
      columns: ['region', 'revenue'],
      aggregations: sumRevenue,
      sort: [{ column: 'region', direction: 'asc' }],
      groupRestriction: {
        dimensions: ['status_upper', 'region'],
        calculatedDimensions: [statusUpper],
        having: [sumRevenueAbove(55)],
      },
    });
    expect(rows).toEqual([
      { region: 'EU', 'revenue | SUM': 60 },
      { region: 'US', 'revenue | SUM': 70 },
    ]);
  });

  // 90 needs both groups kept and both rows of the day read, so the limit cut neither.
  it('sorts and limits the read only', async () => {
    await seed();
    const rows = await run({
      columns: ['day', 'revenue'],
      aggregations: sumRevenue,
      sort: [{ column: 'day', direction: 'desc' }],
      limit: 1,
      groupRestriction: { dimensions: ['status'], having: [sumRevenueAbove(65)] },
    });
    expect(rows).toEqual([{ day: '2026-01-02', 'revenue | SUM': 90 }]);
  });

  it('refuses a restriction on a query that does not aggregate', () => {
    expect(() =>
      qb().buildQuery(tableDef, {
        columns: ['day'],
        groupRestriction: { dimensions: ['status'], having: [sumRevenueAbove(100)] },
      })
    ).toThrow(/DuckDbQueryBuilder plain query: \[revenue\] are routed to HAVING/);
  });

  it('keeps the rows of a NULL group that passes', async () => {
    await seed(`(NULL, 'EU', DATE '2026-01-01', 200)`);
    const rows = await run({
      columns: ['day', 'revenue'],
      aggregations: sumRevenue,
      sort: byDay,
      groupRestriction: { dimensions: ['status'], having: [sumRevenueAbove(100)] },
    });
    expect(rows).toEqual([
      { day: '2026-01-01', 'revenue | SUM': 260 },
      { day: '2026-01-02', 'revenue | SUM': 70 },
    ]);
  });

  it('checks the metric filter at a two-key grouping', async () => {
    await seed();
    const rows = await run({
      columns: ['region', 'revenue'],
      aggregations: sumRevenue,
      sort: [{ column: 'region', direction: 'asc' }],
      groupRestriction: { dimensions: ['status', 'region'], having: [sumRevenueAbove(55)] },
    });
    expect(rows).toEqual([
      { region: 'EU', 'revenue | SUM': 60 },
      { region: 'US', 'revenue | SUM': 70 },
    ]);
  });

  // 110 on the first day means the grain check missed WHERE; 70 means the read missed it.
  it('applies a WHERE filter in the grain check and in the read', async () => {
    await seed(`('paid', 'EU', DATE '2026-01-01', 10)`);
    const revenueAbove25: RoutedFilterRule = {
      column: 'revenue',
      operator: 'gt',
      value: 25,
      clause: 'where',
    };
    const rows = await run({
      columns: ['day', 'revenue'],
      aggregations: sumRevenue,
      sort: byDay,
      filters: [revenueAbove25],
      groupRestriction: { dimensions: ['status'], having: [sumRevenueAbove(60)] },
    });
    expect(rows).toEqual([
      { day: '2026-01-01', 'revenue | SUM': 60 },
      { day: '2026-01-02', 'revenue | SUM': 70 },
    ]);
  });

  it('checks the metric filter at a month grain and reads at a day grain', async () => {
    await seed(`('refunded', 'EU', DATE '2026-02-01', 30)`);
    const rows = await run({
      columns: ['status', 'day', 'revenue'],
      aggregations: sumRevenue,
      dateTruncs: [{ column: 'day', unit: 'DAY' }],
      sort: [{ column: 'status', direction: 'asc' }, ...byDay],
      groupRestriction: {
        dimensions: ['day'],
        dateTruncs: [{ column: 'day', unit: 'MONTH' }],
        having: [sumRevenueAbove(150)],
      },
    });
    expect(rows).toEqual([
      { status: 'paid', day: '2026-01-01', 'revenue | SUM': 60 },
      { status: 'paid', day: '2026-01-02', 'revenue | SUM': 70 },
      { status: 'refunded', day: '2026-01-01', 'revenue | SUM': 50 },
      { status: 'refunded', day: '2026-01-02', 'revenue | SUM': 20 },
    ]);
  });
});
