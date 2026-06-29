import { RedshiftQueryBuilder } from './redshift-query.builder';
import { RedshiftClauseRenderer } from './redshift-clause-renderer';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

function tableDefinition(fqn: string): DataMartDefinition {
  return { type: 'table', fullyQualifiedName: fqn } as unknown as DataMartDefinition;
}

describe('RedshiftQueryBuilder — aggregations', () => {
  let builder: RedshiftQueryBuilder;

  beforeEach(() => {
    builder = new RedshiftQueryBuilder(new RedshiftClauseRenderer());
  });

  it('builds SELECT with aggregate + GROUP BY for a table definition', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
    });
    expect(sql).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM"\n' +
        'FROM "db"."tbl"\nGROUP BY\n  "channel"'
    );
  });

  it('renders COUNT_DISTINCT as COUNT(DISTINCT ...)', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['channel', 'sessionId'],
      aggregations: [{ column: 'sessionId', function: 'COUNT_DISTINCT' }],
    });
    expect(sql).toBe(
      'SELECT\n  "channel",\n  COUNT(DISTINCT "sessionId") AS "sessionId | COUNTUNIQUE"\n' +
        'FROM "db"."tbl"\nGROUP BY\n  "channel"'
    );
  });

  it('places GROUP BY before ORDER BY and LIMIT', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['day', 'sessionId'],
      aggregations: [{ column: 'sessionId', function: 'COUNT_DISTINCT' }],
      sort: [{ column: 'day', direction: 'desc' }],
      limit: 100,
    });
    expect(sql).toBe(
      'SELECT\n  "day",\n  COUNT(DISTINCT "sessionId") AS "sessionId | COUNTUNIQUE"\n' +
        'FROM "db"."tbl"\nGROUP BY\n  "day"\nORDER BY\n  "day" DESC\nLIMIT 100'
    );
  });

  it('ORDER BY on an aggregated metric references the suffixed output alias', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      sort: [{ column: 'revenue', direction: 'desc' }],
    });
    expect(sql).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM"\nFROM "db"."tbl"' +
        '\nGROUP BY\n  "channel"\nORDER BY\n  "revenue | SUM" DESC'
    );
  });

  it('combines WHERE with aggregation (filter then group)', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [{ column: 'channel', operator: 'eq', value: 'paid' }],
    });
    expect(sql).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM"\nFROM "db"."tbl"' +
        '\nWHERE "channel" = \'paid\'\nGROUP BY\n  "channel"'
    );
  });

  it('rowCount appends COUNT(*) AS "Row Count" as the last select item', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      rowCount: true,
    });
    expect(sql).toBe(
      'SELECT\n  "channel",\n  SUM("revenue") AS "revenue | SUM",\n  COUNT(*) AS "Row Count"\n' +
        'FROM "db"."tbl"\nGROUP BY\n  "channel"'
    );
  });

  it('date-trunc bucket with a metric truncates the dimension and groups by it', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['date', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      dateTruncs: [{ column: 'date', unit: 'MONTH' }],
    });
    expect(sql).toBe(
      `SELECT\n  DATE_TRUNC('month', "date") AS "date",\n  SUM("revenue") AS "revenue | SUM"\n` +
        `FROM "db"."tbl"\nGROUP BY\n  DATE_TRUNC('month', "date")`
    );
  });

  it('date-trunc-only report (no metric) still takes the aggregated path', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['date'],
      dateTruncs: [{ column: 'date', unit: 'YEAR' }],
    });
    expect(sql).toBe(
      `SELECT\n  DATE_TRUNC('year', "date") AS "date"\nFROM "db"."tbl"` +
        `\nGROUP BY\n  DATE_TRUNC('year', "date")`
    );
  });

  it('emits HAVING after GROUP BY for an aggregated-metric filter (inlined literal)', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
    });
    expect(sql).toContain('GROUP BY\n  "channel"');
    // Redshift inlines the literal (zero bound params); no WHERE since the lone filter
    // is post-aggregation.
    expect(sql).toContain('HAVING SUM("revenue") > 1000');
    expect(sql).not.toContain('WHERE');
    expect(sql.indexOf('GROUP BY')).toBeLessThan(sql.indexOf('HAVING'));
  });

  it('routes a dimension filter to WHERE and a metric filter to HAVING (order + inlined literals)', () => {
    const sql = builder.buildQuery(tableDefinition('db.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [
        { column: 'channel', operator: 'eq', value: 'google' },
        { column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 },
      ],
    });
    expect(sql).toContain('WHERE "channel" = \'google\'');
    expect(sql).toContain('HAVING SUM("revenue") > 1000');
    // SQL clause order: WHERE < GROUP BY < HAVING.
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('GROUP BY'));
    expect(sql.indexOf('GROUP BY')).toBeLessThan(sql.indexOf('HAVING'));
  });
});
