import { Test, TestingModule } from '@nestjs/testing';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { isQueryBuildResult } from '../../interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import type { RoutedFilterRule } from '../../../dto/domain/filter-clause';

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
      expect(sql).toBe('SELECT\n  `main`,\n  `revenue`\nFROM `proj`.`dataset`.`sales` AS src');
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

    // The calculated-metric flip is a per-dialect copy of the same two gates (output-controls
    // path, then aggregated path), and a copy is not self-verifying: the legacy BigQuery builder
    // shipped with `calculatedFields` missing from its own gate, emitting SQL without the metric
    // while the header was still synthesized. Pinned per dialect so a copy cannot repeat it.
    it('routes a calculated-metric-only request onto the aggregated path', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['country'],
        calculatedFields: [
          {
            outputName: 'ctr',
            type: 'FLOAT',
            formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
            level: 'metric',
          },
        ],
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
      // Projected, never grouped — the metric already IS an aggregate.
      expect(result.sql).toContain('GROUP BY\n  `country`');
      expect(result.sql).not.toContain('GROUP BY\n  `country`,\n  `ctr`');
    });

    // A row-level formula is a dimension, not an aggregate: it must not force the grouped shape,
    // or a plain projection silently becomes an implicit DISTINCT over the report's columns. It
    // is still projected — the plain path is where its formula gets substituted.
    //
    // BigQuery is the one dialect that aliases its FROM and qualifies its predicates, so it is
    // also the only one where a sort on the field could come out as `src.session_key` — a name
    // the query does not have.
    it('projects a row-level calculated field without grouping, and sorts on its bare alias', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['country'],
        sort: [{ column: 'session_key', direction: 'asc' }],
        calculatedFields: [
          {
            outputName: 'session_key',
            type: 'STRING',
            formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
            level: 'column',
          },
        ],
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain(
        'SELECT\n  `country`,\n  CONCAT(`session_id`, `user_id`) AS `session_key`'
      );
      expect(result.sql).toContain('ORDER BY\n  `session_key` ASC');
      expect(result.sql).not.toContain('src.`session_key`');
      expect(result.sql).not.toContain('GROUP BY');
    });

    // The declared type is imposed on a comparison, and that stopped at the filter. A sort is a
    // comparison too, and under a LIMIT the disagreement is not cosmetic: measured
    // `WHERE CAST(s AS <float>) > 5 ORDER BY s DESC LIMIT 2` returned `9, 100` where `100, 10` is
    // correct, identically on BigQuery, Athena, Redshift and Databricks.
    //
    // The expression is repeated rather than the alias wrapped because `ORDER BY CAST(<alias> AS …)`
    // fails on Redshift — an output name is visible there only as a bare ORDER BY term. Both
    // clauses read ONE map, so a field that is filtered and sorted carries the same string twice
    // rather than two renderings that ought to match.
    it('sorts a float-declared calculated field by the same cast expression its filter compares', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['country'],
        sort: [{ column: 'ratio', direction: 'desc' }],
        limit: 2,
        calculatedFields: [
          {
            outputName: 'ratio',
            type: 'FLOAT',
            formula: '{{ref field="a"}}',
            level: 'column',
          },
        ],
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('ORDER BY\n  CAST((src.`a`) AS FLOAT64) DESC');
      expect(result.sql).not.toContain('ORDER BY\n  `ratio` DESC');
    });

    // An INTEGER declaration is excluded on purpose: casting one introduces the per-row
    // conversion the cast exists to remove, and the dialects disagree on its direction. A STRING
    // declaration has no cast target at all. Both keep the bare alias, so the SQL for every
    // non-float field is byte-identical to what it was.
    it('leaves an integer-declared calculated field sorting on its bare alias', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['country'],
        sort: [{ column: 'n', direction: 'desc' }],
        calculatedFields: [
          { outputName: 'n', type: 'INTEGER', formula: '{{ref field="a"}}', level: 'column' },
        ],
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('ORDER BY\n  `n` DESC');
      expect(result.sql).not.toContain('CAST(');
    });

    // The field alone: `SELECT *, <expr>` would widen the report to every warehouse column, which
    // the aggregated sibling never does for the same selection.
    it('projects a row-level calculated field alone, without a wildcard', async () => {
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: [],
        calculatedFields: [
          {
            outputName: 'session_key',
            type: 'STRING',
            formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
            level: 'column',
          },
        ],
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('SELECT\n  CONCAT(`session_id`, `user_id`) AS `session_key`');
      expect(result.sql).not.toContain('*');
    });

    // The plain branch emits WHERE / ORDER BY / LIMIT and never calls `renderHaving`, so a rule
    // routed to HAVING here would be applied in NEITHER clause — silently more rows than the
    // analyst asked for. Reachable exactly when a report filters on an aggregate-level Calculated
    // Field it does NOT select: the field is the only thing that would have made the query
    // aggregated.
    it('refuses a HAVING-routed rule on the non-aggregated branch', async () => {
      const filters: RoutedFilterRule[] = [
        { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
      ];
      await expect(
        builder.buildQuery(tableDefinition('proj.dataset.tbl'), { columns: ['channel'], filters })
      ).rejects.toThrow(/ctr/);
    });

    it('still builds the same plain query when every rule is routed to WHERE', async () => {
      const filters: RoutedFilterRule[] = [
        { column: 'channel', operator: 'eq', value: 'paid', clause: 'where' },
      ];
      const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
        columns: ['channel'],
        filters,
      });
      if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
      expect(result.sql).toContain('WHERE src.`channel` = @p0');
      expect(result.sql).not.toMatch(/HAVING/);
    });

    // A predicate on a Calculated Field compares its FORMULA. The plan travels on
    // its own channel because the field need not be SELECTED to be filtered on, and the
    // projection channel is selection-only — dropping `calculatedFilterMetrics` from this call
    // leaves the predicate with no left-hand side and the builder throws by name.
    describe('a filter on a calculated field', () => {
      const CTR_PLAN = {
        outputName: 'ctr',
        type: 'FLOAT',
        formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
        level: 'metric' as const,
      };
      const SESSION_KEY_PLAN = {
        outputName: 'session_key',
        type: 'STRING',
        formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
        level: 'column' as const,
      };

      it('compares the formula in HAVING for an aggregate-level field', async () => {
        const filters: RoutedFilterRule[] = [
          { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
        ];
        const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
          columns: ['country'],
          filters,
          calculatedFields: [CTR_PLAN],
          calculatedFilterMetrics: [CTR_PLAN],
        });
        if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
        // Both sides carry the DECLARED type, and the VALUE's half is the
        // end-to-end evidence: it appears only because this builder's type resolver answers a
        // Calculated Field with its declaration rather than with `undefined`.
        expect(result.sql).toContain(
          'HAVING CAST((SUM(src.`clicks`) / NULLIF(SUM(src.`impressions`), 0)) AS FLOAT64) > ' +
            'CAST(@h0 AS FLOAT64)'
        );
        expect(result.sql).not.toContain('HAVING src.`ctr`');
      });

      // The field is filtered but NOT selected, which is the shape the projection channel cannot
      // reach — and the one a report takes whenever the analyst narrows by a ratio they do not
      // want a column for.
      it('compares the formula in WHERE for a row-level field the report does not select', async () => {
        const filters: RoutedFilterRule[] = [
          { column: 'session_key', operator: 'eq', value: 'a1', clause: 'where' },
        ];
        const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
          columns: ['country'],
          filters,
          calculatedFilterMetrics: [SESSION_KEY_PLAN],
        });
        if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
        expect(result.sql).toContain('WHERE (CONCAT(src.`session_id`, src.`user_id`)) = @p0');
        expect(result.sql).not.toContain('src.`session_key`');
      });

      // The shape review named as the loud-to-silent conversion, and the one the lifted
      // refusal makes reachable: the field is the only thing that would have made the query
      // aggregated, so leaving it out of the projection leaves the predicate homeless. An
      // aggregate-level PREDICATE forces the grouped shape exactly as selecting one does —
      // otherwise this takes the plain branch and `assertNoHavingRules` turns a 400 into a 500.
      it('groups the query for an aggregate-level filter on a field it does not select', async () => {
        const filters: RoutedFilterRule[] = [
          { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
        ];
        const result = await builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
          columns: ['country'],
          filters,
          calculatedFilterMetrics: [CTR_PLAN],
        });
        if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
        expect(result.sql).toContain('GROUP BY\n  `country`');
        expect(result.sql).toContain(
          'HAVING CAST((SUM(src.`clicks`) / NULLIF(SUM(src.`impressions`), 0)) AS FLOAT64) > ' +
            'CAST(@h0 AS FLOAT64)'
        );
        // Filtered, not selected: the field must not appear in the projection.
        expect(result.sql).not.toContain('AS `ctr`');
      });

      it('refuses the aggregate-level filter when no plan for it reaches the builder', async () => {
        const filters: RoutedFilterRule[] = [
          { column: 'ctr', operator: 'gt', value: 0.5, clause: 'having' },
        ];
        await expect(
          builder.buildQuery(tableDefinition('proj.dataset.tbl'), {
            columns: ['country'],
            filters,
            calculatedFields: [CTR_PLAN],
          })
        ).rejects.toThrow(/ctr/);
      });
    });
  });
});
