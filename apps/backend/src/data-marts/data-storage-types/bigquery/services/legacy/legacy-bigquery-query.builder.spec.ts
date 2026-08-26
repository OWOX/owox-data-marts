import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { BigQueryClauseRenderer } from '../bigquery-clause-renderer';
import { LegacyBigQueryQueryBuilder } from './legacy-bigquery-query.builder';
import { LegacyBigQuerySqlPreprocessor } from './legacy-bigquery-sql-preprocessor.service';
import { isQueryBuildResult } from '../../../interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

const sqlDefinition = {
  definitionType: 'SQL',
  sqlQuery: 'SELECT id, created_at FROM source_table',
} as unknown as DataMartDefinition;

const tableDefinition = {
  definitionType: 'TABLE',
  fullyQualifiedName: 'proj.ds.table',
} as unknown as DataMartDefinition;

const viewRef = '`proj`.`ds`.`view_x`';

function makeBuilder(prepared = 'SELECT id, created_at FROM parsed_table') {
  const preprocessor = {
    prepare: jest.fn().mockResolvedValue(prepared),
  } as unknown as LegacyBigQuerySqlPreprocessor;
  const builder = new LegacyBigQueryQueryBuilder(preprocessor, new BigQueryClauseRenderer());
  return { builder, preprocessor };
}

describe('LegacyBigQueryQueryBuilder', () => {
  it('has type LEGACY_GOOGLE_BIGQUERY', () => {
    const { builder } = makeBuilder();
    expect(builder.type).toBe(DataStorageType.LEGACY_GOOGLE_BIGQUERY);
  });

  it('returns preprocessed raw SQL when no output controls are present', async () => {
    const { builder, preprocessor } = makeBuilder();
    const result = await builder.buildQuery(sqlDefinition, {});
    expect(result).toBe('SELECT id, created_at FROM parsed_table');
    expect(preprocessor.prepare).toHaveBeenCalledWith('SELECT id, created_at FROM source_table');
  });

  it('delegates to the BigQuery output-controls path (wraps the view) when filters are present', async () => {
    const { builder, preprocessor } = makeBuilder();
    const result = await builder.buildQuery(sqlDefinition, {
      filters: [{ column: 'created_at', operator: 'gte', value: '2024-01-01' }],
      mainTableReference: viewRef,
      columnTypes: new Map([['created_at', 'TIMESTAMP']]),
    });
    expect(isQueryBuildResult(result)).toBe(true);
    if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
    expect(result.sql).toContain(viewRef);
    expect(result.sql).toContain('CAST(@p0 AS TIMESTAMP)');
    expect(result.params).toEqual([{ name: 'p0', value: '2024-01-01' }]);
    expect(preprocessor.prepare).not.toHaveBeenCalled();
  });

  it('delegates to the output-controls path for a sort-only report', async () => {
    const { builder, preprocessor } = makeBuilder();
    const result = await builder.buildQuery(sqlDefinition, {
      sort: [{ column: 'created_at', direction: 'desc' }],
      mainTableReference: viewRef,
    });
    expect(isQueryBuildResult(result)).toBe(true);
    if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
    expect(result.sql).toContain(viewRef);
    expect(result.sql).toContain('ORDER BY');
    expect(preprocessor.prepare).not.toHaveBeenCalled();
  });

  it('delegates to the output-controls path for a limit-only report', async () => {
    const { builder, preprocessor } = makeBuilder();
    const result = await builder.buildQuery(sqlDefinition, {
      limit: 100,
      mainTableReference: viewRef,
    });
    expect(isQueryBuildResult(result)).toBe(true);
    if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
    expect(result.sql).toContain(viewRef);
    expect(result.sql).toContain('LIMIT 100');
    expect(preprocessor.prepare).not.toHaveBeenCalled();
  });

  // A calculated field is an output control like any other: the parent builder renders it into
  // the SELECT from `calculatedFields`, and this gate is the only thing that routes the request
  // there. Missed here, the legacy path emits SQL WITHOUT the metric while the reader still
  // synthesizes its header — a permanently `null` column on every surface, on every run.
  it('delegates to the output-controls path for a calculated-metric-only report', async () => {
    const { builder, preprocessor } = makeBuilder();
    const result = await builder.buildQuery(sqlDefinition, {
      columns: ['id'],
      mainTableReference: viewRef,
      calculatedFields: [
        {
          outputName: 'ctr',
          type: 'FLOAT',
          formula: 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)',
          level: 'metric',
        },
      ],
    });
    expect(isQueryBuildResult(result)).toBe(true);
    if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
    expect(result.sql).toContain(viewRef);
    expect(result.sql).toContain('SUM(`clicks`) / NULLIF(SUM(`impressions`), 0) AS `ctr`');
    // The metric is projected, never grouped — it already IS an aggregate.
    expect(result.sql).toContain('GROUP BY\n  `id`');
    expect(preprocessor.prepare).not.toHaveBeenCalled();
  });

  // This gate is the parent's `hasOutputControls`, NOT its aggregated flip: a row-level formula
  // is a dimension and does not group, but it still needs the substitution channel that lives
  // beyond this gate. Narrowing it to aggregating formulas would send the report down the
  // preprocessor path and bring the permanently `null` column above straight back.
  it('delegates to the output-controls path for a ROW-LEVEL-only calculated field too', async () => {
    const { builder, preprocessor } = makeBuilder();
    const result = await builder.buildQuery(sqlDefinition, {
      columns: ['id'],
      mainTableReference: viewRef,
      calculatedFields: [
        {
          outputName: 'session_key',
          type: 'STRING',
          formula: 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})',
          level: 'column',
        },
      ],
    });
    expect(isQueryBuildResult(result)).toBe(true);
    if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');
    expect(result.sql).toContain(viewRef);
    expect(preprocessor.prepare).not.toHaveBeenCalled();
  });

  it('projects a column subset over the preprocessed SQL when no output controls are present', async () => {
    const { builder, preprocessor } = makeBuilder();
    const result = await builder.buildQuery(sqlDefinition, { columns: ['id', 'created_at'] });
    expect(result).toBe(
      'SELECT\n  `id`,\n  `created_at`\nFROM (SELECT id, created_at FROM parsed_table)'
    );
    expect(preprocessor.prepare).toHaveBeenCalledWith('SELECT id, created_at FROM source_table');
  });

  it('throws for a non-SQL definition with no output controls (legacy marts are SQL-only)', async () => {
    const { builder, preprocessor } = makeBuilder();
    await expect(builder.buildQuery(tableDefinition, {})).rejects.toThrow(
      'Invalid data mart definition'
    );
    expect(preprocessor.prepare).not.toHaveBeenCalled();
  });
});
