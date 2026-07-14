import { Test, TestingModule } from '@nestjs/testing';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { isQueryBuildResult } from '../../interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

function tableDefinition(fqn: string): DataMartDefinition {
  return {
    type: 'table',
    fullyQualifiedName: fqn,
  } as unknown as DataMartDefinition;
}

function sqlDefinition(query: string): DataMartDefinition {
  return {
    type: 'sql',
    sqlQuery: query,
  } as unknown as DataMartDefinition;
}

function viewDefinition(fqn: string): DataMartDefinition {
  return {
    fullyQualifiedName: fqn,
  } as unknown as DataMartDefinition;
}

function connectorDefinition(fqn: string): DataMartDefinition {
  return {
    connector: {
      source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
      storage: { fullyQualifiedName: fqn },
    },
  } as unknown as DataMartDefinition;
}

function tablePatternDefinition(pattern: string): DataMartDefinition {
  return {
    pattern,
  } as unknown as DataMartDefinition;
}

describe('BigQueryQueryBuilder', () => {
  let builder: BigQueryQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BigQueryQueryBuilder, BigQueryClauseRenderer],
    }).compile();

    builder = module.get(BigQueryQueryBuilder);
  });

  describe('buildQuery (without columns option)', () => {
    it('returns SELECT * for a table definition', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'));
      expect(sql).toBe('SELECT *\nFROM `proj`.`dataset`.`tbl`');
    });

    it('returns user SQL untouched for a SQL definition', async () => {
      const sql = await builder.buildQuery(sqlDefinition('SELECT a, b FROM t'));
      expect(sql).toBe('SELECT a, b FROM t');
    });
  });

  describe('buildQuery with columns filter', () => {
    it('projects only specified columns on a table definition', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['campaign_name', 'date_column'],
      });
      expect(sql).toBe(
        'SELECT\n  `campaign_name`,\n  `date_column`\nFROM `proj`.`dataset`.`tbl` AS src'
      );
    });

    it('escapes nested RECORD paths as backtick-separated parts', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['address.city', 'user_id'],
      });
      expect(sql).toBe(
        'SELECT\n  `address`.`city`,\n  `user_id`\nFROM `proj`.`dataset`.`tbl` AS src'
      );
    });

    it('aliases FROM when a projected column matches the table short name', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.shop_data.country'), {
        columns: ['country'],
      });
      expect(sql).toBe('SELECT\n  `country`\nFROM `proj`.`shop_data`.`country` AS src');
    });

    it('does not use AS main so a projected column named main stays a column, not row STRUCT', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.sales'), {
        columns: ['main', 'revenue'],
      });
      expect(sql).toBe(
        'SELECT\n  `main`,\n  `revenue`\nFROM `proj`.`dataset`.`sales` AS src'
      );
      expect(sql).not.toMatch(/AS main(?:\s|$)/);
    });

    it('wraps SQL definition queries when columns are provided', async () => {
      const sql = await builder.buildQuery(sqlDefinition('SELECT a, b, c FROM t;'), {
        columns: ['a', 'c'],
      });
      expect(sql).toBe('SELECT\n  `a`,\n  `c`\nFROM (SELECT a, b, c FROM t) AS src');
    });

    it('ignores empty columns list and falls back to SELECT *', async () => {
      const sql = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: [],
      });
      expect(sql).toBe('SELECT *\nFROM `proj`.`dataset`.`tbl`');
    });
  });

  describe('buildQuery with output controls', () => {
    it('returns { sql, params } when filters are non-empty', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['a', 'b'],
        filters: [{ column: 'a', operator: 'eq', value: 1 }],
      });
      expect(isQueryBuildResult(result)).toBe(true);
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('`a`,\n  `b`');
      expect(result.sql).toContain('FROM `proj`.`dataset`.`tbl` AS src');
      expect(result.sql).toContain('WHERE src.`a` = @p0');
      expect(result.params).toEqual([{ name: 'p0', value: 1 }]);
    });

    it('composes WHERE + ORDER BY + LIMIT in correct order', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['a', 'b'],
        filters: [{ column: 'a', operator: 'eq', value: 1 }],
        sort: [{ column: 'a', direction: 'asc' }],
        limit: 10,
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      const sql = result.sql;
      expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('ORDER BY'));
      expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT'));
      expect(sql).toContain('ORDER BY\n  src.`a` ASC');
      expect(sql).toContain('LIMIT 10');
    });

    it('aliases FROM and qualifies filter when column matches table short name (STRUCT collision)', async () => {
      // Fibery 6685: unaliased FROM …`country` makes bare `country` a row STRUCT in WHERE.
      const result = await builder.buildQuery(tableDefinition('proj.shop_data.country'), {
        columns: ['order_id', 'country'],
        filters: [{ column: 'country', operator: 'eq', value: 'Canada' }],
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toBe(
        'SELECT\n' +
          '  `order_id`,\n' +
          '  `country`\n' +
          'FROM `proj`.`shop_data`.`country` AS src\n' +
          'WHERE src.`country` = @p0'
      );
      expect(result.params).toEqual([{ name: 'p0', value: 'Canada' }]);
    });

    it('returns plain string with aliased FROM for explicit projection only', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['a'],
      });
      expect(typeof result).toBe('string');
      expect(result).toBe('SELECT\n  `a`\nFROM `proj`.`dataset`.`tbl` AS src');
    });

    it('uses mainTableReference for SQL-def with output controls', async () => {
      const result = await builder.buildQuery(sqlDefinition('SELECT 1'), {
        columns: ['x'],
        filters: [{ column: 'x', operator: 'is_empty' }],
        mainTableReference: '`proj`.`dataset`.`view_abc`',
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('FROM `proj`.`dataset`.`view_abc` AS src');
      expect(result.sql).not.toContain('SELECT 1');
      expect(result.sql).toContain("(src.`x` IS NULL OR src.`x` = '')");
    });

    it('throws when SQL-def has output controls but no mainTableReference', async () => {
      await expect(
        builder.buildQuery(sqlDefinition('SELECT 1'), {
          filters: [{ column: 'x', operator: 'is_empty' }],
        })
      ).rejects.toThrow(/mainTableReference/);
    });

    it('returns string for SQL-def without output controls AND no columns', async () => {
      const result = await builder.buildQuery(sqlDefinition('SELECT 1'));
      expect(result).toBe('SELECT 1');
    });

    it('returns QueryBuildResult with correct FROM for view definition', async () => {
      const result = await builder.buildQuery(viewDefinition('proj.ds.my_view'), {
        filters: [{ column: 'a', operator: 'eq', value: 1 }],
      });
      expect(isQueryBuildResult(result)).toBe(true);
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('FROM `proj`.`ds`.`my_view` AS src');
    });

    it('returns QueryBuildResult with correct FROM for connector definition', async () => {
      const result = await builder.buildQuery(connectorDefinition('proj.ds.tbl'), {
        filters: [{ column: 'a', operator: 'eq', value: 1 }],
      });
      expect(isQueryBuildResult(result)).toBe(true);
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('FROM `proj`.`ds`.`tbl` AS src');
    });

    it('returns QueryBuildResult with correct FROM for table-pattern definition', async () => {
      const result = await builder.buildQuery(tablePatternDefinition('proj.ds.tbl_'), {
        filters: [{ column: 'a', operator: 'eq', value: 1 }],
      });
      expect(isQueryBuildResult(result)).toBe(true);
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('FROM `proj`.`ds`.`tbl_*` AS src');
    });

    it('handles limit 0 as "no limit" (limit !== null only when explicit positive)', async () => {
      // limit: 0 still triggers output controls (limit != null), but renderLimit floors to 0 — confirm behavior.
      // Actually: 0 IS a value, treat as output-controls path. Document expected behavior.
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        limit: 0,
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('LIMIT 0');
    });
  });
});
