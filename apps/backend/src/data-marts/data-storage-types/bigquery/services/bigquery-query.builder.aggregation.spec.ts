import { Test, TestingModule } from '@nestjs/testing';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import {
  isQueryBuildResult,
  QueryBuildResult,
} from '../../interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

function tableDefinition(fqn: string): DataMartDefinition {
  return { type: 'table', fullyQualifiedName: fqn } as unknown as DataMartDefinition;
}

async function sqlOf(result: string | QueryBuildResult): Promise<string> {
  return isQueryBuildResult(result) ? result.sql : result;
}

describe('BigQueryQueryBuilder — aggregations', () => {
  let builder: BigQueryQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BigQueryQueryBuilder, BigQueryClauseRenderer],
    }).compile();
    builder = module.get(BigQueryQueryBuilder);
  });

  it('builds SELECT with aggregate + GROUP BY for a table definition', async () => {
    const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
    });
    expect(await sqlOf(result)).toBe(
      'SELECT\n' +
        '  `channel`,\n' +
        '  SUM(`revenue`) AS `revenue | SUM`\n' +
        'FROM `proj`.`dataset`.`tbl` AS src\n' +
        'GROUP BY\n' +
        '  `channel`'
    );
  });

  it('places GROUP BY before ORDER BY and LIMIT', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['day', 'sessionId'],
      aggregations: [{ column: 'sessionId', function: 'COUNT_DISTINCT' }],
      sort: [{ column: 'day', direction: 'desc' }],
      limit: 100,
    });
    expect(await sqlOf(result)).toBe(
      'SELECT\n' +
        '  `day`,\n' +
        '  COUNT(DISTINCT `sessionId`) AS `sessionId | COUNTUNIQUE`\n' +
        'FROM `p`.`d`.`t` AS src\n' +
        'GROUP BY\n' +
        '  `day`\n' +
        'ORDER BY\n' +
        '  `day` DESC\n' +
        'LIMIT 100'
    );
  });

  it('ORDER BY on an aggregated metric references the suffixed output alias', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      sort: [{ column: 'revenue', direction: 'desc' }],
    });
    expect(await sqlOf(result)).toBe(
      'SELECT\n' +
        '  `channel`,\n' +
        '  SUM(`revenue`) AS `revenue | SUM`\n' +
        'FROM `p`.`d`.`t` AS src\n' +
        'GROUP BY\n' +
        '  `channel`\n' +
        'ORDER BY\n' +
        '  `revenue | SUM` DESC'
    );
  });

  it('combines WHERE with aggregation (filter then group)', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [{ column: 'channel', operator: 'eq', value: 'paid' }],
    });
    const sql = await sqlOf(result);
    expect(sql).toBe(
      'SELECT\n' +
        '  `channel`,\n' +
        '  SUM(`revenue`) AS `revenue | SUM`\n' +
        'FROM `p`.`d`.`t` AS src\n' +
        'WHERE src.`channel` = @p0\n' +
        'GROUP BY\n' +
        '  `channel`'
    );
  });

  it('date-trunc bucket with a metric truncates the dimension and groups by it', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['date', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      dateTruncs: [{ column: 'date', unit: 'MONTH' }],
    });
    expect(await sqlOf(result)).toBe(
      'SELECT\n' +
        '  DATE_TRUNC(DATE(`date`), MONTH) AS `date`,\n' +
        '  SUM(`revenue`) AS `revenue | SUM`\n' +
        'FROM `p`.`d`.`t` AS src\n' +
        'GROUP BY\n' +
        '  DATE_TRUNC(DATE(`date`), MONTH)'
    );
  });

  it('date-trunc-only report (no metric) still takes the aggregated path', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['date'],
      dateTruncs: [{ column: 'date', unit: 'YEAR' }],
    });
    expect(await sqlOf(result)).toBe(
      'SELECT\n' +
        '  DATE_TRUNC(DATE(`date`), YEAR) AS `date`\n' +
        'FROM `p`.`d`.`t` AS src\n' +
        'GROUP BY\n' +
        '  DATE_TRUNC(DATE(`date`), YEAR)'
    );
  });

  it('rowCount appends COUNT(*) AS `Row Count` and takes the aggregated path with no metrics', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['channel'],
      rowCount: true,
    });
    expect(await sqlOf(result)).toBe(
      'SELECT\n' +
        '  `channel`,\n' +
        '  COUNT(*) AS `Row Count`\n' +
        'FROM `p`.`d`.`t` AS src\n' +
        'GROUP BY\n' +
        '  `channel`'
    );
  });

  it('rowCount with a metric appends Row Count after the suffixed metric alias', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      rowCount: true,
    });
    expect(await sqlOf(result)).toBe(
      'SELECT\n' +
        '  `channel`,\n' +
        '  SUM(`revenue`) AS `revenue | SUM`,\n' +
        '  COUNT(*) AS `Row Count`\n' +
        'FROM `p`.`d`.`t` AS src\n' +
        'GROUP BY\n' +
        '  `channel`'
    );
  });

  it('emits HAVING after GROUP BY for an aggregated-metric filter (function set)', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }],
    });
    const sql = await sqlOf(result);
    expect(sql).toContain('GROUP BY\n  `channel`');
    expect(sql).toContain('HAVING SUM(src.`revenue`) > @h0');
    // The only filter is post-aggregation → no WHERE; HAVING follows GROUP BY.
    expect(sql).not.toContain('WHERE');
    expect(sql.indexOf('GROUP BY')).toBeLessThan(sql.indexOf('HAVING'));
    expect(isQueryBuildResult(result) && result.params).toEqual([{ name: 'h0', value: 1000 }]);
  });

  it('routes a dimension filter to WHERE and a metric filter to HAVING (order + params)', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['channel', 'revenue'],
      aggregations: [{ column: 'revenue', function: 'SUM' }],
      filters: [
        { column: 'channel', operator: 'eq', value: 'google' },
        { column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 },
      ],
    });
    const sql = await sqlOf(result);
    expect(sql).toContain('WHERE src.`channel` = @p0');
    expect(sql).toContain('HAVING SUM(src.`revenue`) > @h0');
    // SQL clause order: WHERE < GROUP BY < HAVING.
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('GROUP BY'));
    expect(sql.indexOf('GROUP BY')).toBeLessThan(sql.indexOf('HAVING'));
    expect(isQueryBuildResult(result) && result.params).toEqual([
      { name: 'p0', value: 'google' },
      { name: 'h0', value: 1000 },
    ]);
  });

  // The HAVING value is cast to the AGGREGATE's effective type, not the raw column type.
  // COUNT_DISTINCT(date) returns an integer, so the value compares as an integer (bare
  // param). Verified on real BigQuery — the old raw-DATE cast errored (integer vs date).
  it('HAVING on COUNT_DISTINCT(date) compares as integer (no DATE cast on the value)', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['order_date'],
      aggregations: [{ column: 'order_date', function: 'COUNT_DISTINCT' }],
      filters: [{ column: 'order_date', function: 'COUNT_DISTINCT', operator: 'gte', value: 5 }],
      columnTypes: new Map([['order_date', 'DATE']]),
    });
    const sql = await sqlOf(result);
    expect(sql).toContain('HAVING COUNT(DISTINCT src.`order_date`) >= @h0');
    expect(sql).not.toContain('CAST(@h0 AS DATE)');
  });

  it('HAVING on MIN(date) keeps the DATE cast (effective type equals the original type)', async () => {
    const result = await builder.buildQuery(tableDefinition('p.d.t'), {
      columns: ['channel', 'order_date'],
      aggregations: [{ column: 'order_date', function: 'MIN' }],
      filters: [{ column: 'order_date', function: 'MIN', operator: 'gte', value: '2024-01-01' }],
      columnTypes: new Map([['order_date', 'DATE']]),
    });
    const sql = await sqlOf(result);
    expect(sql).toContain('HAVING MIN(src.`order_date`) >= CAST(@h0 AS DATE)');
  });
});
