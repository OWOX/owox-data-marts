import { AthenaQueryBuilder } from './athena-query.builder';
import { AthenaClauseRenderer } from './athena-clause-renderer';
import {
  isQueryBuildResult,
  QueryBuildResult,
} from '../../interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

function tableDefinition(fqn: string): DataMartDefinition {
  return { type: 'table', fullyQualifiedName: fqn } as unknown as DataMartDefinition;
}

function sqlOf(result: string | QueryBuildResult): string {
  return isQueryBuildResult(result) ? result.sql : result;
}

describe('AthenaQueryBuilder — aggregations', () => {
  let builder: AthenaQueryBuilder;

  beforeEach(() => {
    builder = new AthenaQueryBuilder(new AthenaClauseRenderer());
  });

  it('builds SELECT with aggregate + GROUP BY for a table definition', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
    });
    expect(sqlOf(result)).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM"\n' +
        'FROM "mydb"."schema"."tbl"\nGROUP BY\n  "channel"'
    );
  });

  it('renders COUNT_DISTINCT as COUNT(DISTINCT ...)', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['channel', 'sessionId'],
      aggregations: [{ column: 'sessionId', function: 'COUNT_DISTINCT' }],
    });
    expect(sqlOf(result)).toBe(
      'SELECT\n  "channel",\n  COUNT(DISTINCT "sessionId") AS "sessionId | COUNTUNIQUE"\n' +
        'FROM "mydb"."schema"."tbl"\nGROUP BY\n  "channel"'
    );
  });

  it('places GROUP BY before ORDER BY and LIMIT', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['day', 'sessionId'],
      aggregations: [{ column: 'sessionId', function: 'COUNT_DISTINCT' }],
      sort: [{ column: 'day', direction: 'desc' }],
      limit: 100,
    });
    expect(sqlOf(result)).toBe(
      'SELECT\n  "day",\n  COUNT(DISTINCT "sessionId") AS "sessionId | COUNTUNIQUE"\n' +
        'FROM "mydb"."schema"."tbl"\nGROUP BY\n  "day"\nORDER BY\n  "day" DESC\nLIMIT 100'
    );
  });

  it('ORDER BY on an aggregated metric references the suffixed output alias', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      sort: [{ column: 'revenue', direction: 'desc' }],
    });
    expect(sqlOf(result)).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM"\n' +
        'FROM "mydb"."schema"."tbl"\nGROUP BY\n  "channel"\nORDER BY\n  "revenue | SUM" DESC'
    );
  });

  it('combines WHERE with aggregation (filter then group)', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [{ column: 'channel', operator: 'eq', value: 'paid' }],
    });
    const sql = sqlOf(result);
    expect(sql).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM"\n' +
        'FROM "mydb"."schema"."tbl"\nWHERE "channel" = ?\nGROUP BY\n  "channel"'
    );
  });

  it('rowCount appends COUNT(*) AS "Row Count" as the last select item', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      rowCount: true,
    });
    expect(sqlOf(result)).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM",\n  COUNT(*) AS "Row Count"\n' +
        'FROM "mydb"."schema"."tbl"\nGROUP BY\n  "channel"'
    );
  });

  it('date-trunc bucket with a metric truncates the dimension and groups by it', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['date', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      dateTruncs: [{ column: 'date', unit: 'MONTH' }],
    });
    expect(sqlOf(result)).toBe(
      `SELECT\n  date_trunc('month', "date") AS "date",\n  SUM("revenue") AS "revenue | SUM"\n` +
        `FROM "mydb"."schema"."tbl"\nGROUP BY\n  date_trunc('month', "date")`
    );
  });

  it('date-trunc-only report (no metric) still takes the aggregated path', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['date'],
      dateTruncs: [{ column: 'date', unit: 'YEAR' }],
    });
    expect(sqlOf(result)).toBe(
      `SELECT\n  date_trunc('year', "date") AS "date"\n` +
        `FROM "mydb"."schema"."tbl"\nGROUP BY\n  date_trunc('year', "date")`
    );
  });

  it('emits HAVING after GROUP BY for an aggregated-metric filter (positional param)', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
    });
    const sql = sqlOf(result);
    expect(sql).toContain('GROUP BY\n  "channel"');
    expect(sql).toContain('HAVING SUM("revenue") > ?');
    // The only filter is post-aggregation → no WHERE; HAVING follows GROUP BY.
    expect(sql).not.toContain('WHERE');
    expect(sql.indexOf('GROUP BY')).toBeLessThan(sql.indexOf('HAVING'));
    // Athena binds positional `?` by order; the lone HAVING param uses the `h` prefix.
    expect(isQueryBuildResult(result) && result.params).toEqual([{ name: 'h0', value: 1000 }]);
  });

  it('routes a dimension filter to WHERE and a metric filter to HAVING (order + positional params)', () => {
    const result = builder.buildQuery(tableDefinition('mydb.schema.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [
        { column: 'channel', operator: 'eq', value: 'google' },
        { column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 },
      ],
    });
    const sql = sqlOf(result);
    expect(sql).toContain('WHERE "channel" = ?');
    expect(sql).toContain('HAVING SUM("revenue") > ?');
    // SQL clause order: WHERE < GROUP BY < HAVING.
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('GROUP BY'));
    expect(sql.indexOf('GROUP BY')).toBeLessThan(sql.indexOf('HAVING'));
    // Positional binding: WHERE param first (textual order), then the HAVING param.
    expect(isQueryBuildResult(result) && result.params).toEqual([
      { name: 'p0', value: 'google' },
      { name: 'h0', value: 1000 },
    ]);
  });
});
