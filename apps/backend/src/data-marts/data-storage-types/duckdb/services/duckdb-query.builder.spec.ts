import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { DuckDbQueryBuilder } from './duckdb-query.builder';
import type { RoutedFilterRule } from '../../../dto/domain/filter-clause';
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
