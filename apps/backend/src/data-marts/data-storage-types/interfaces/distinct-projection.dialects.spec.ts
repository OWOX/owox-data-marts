/**
 * `SELECT DISTINCT` on the plain (ungrouped) query branch, through the REAL builder of every
 * storage.
 *
 * Each builder repeats two things by hand: the gate that routes a distinct-only report onto the
 * output-controls branch at all, and the `{ distinct }` it forwards to `composeSelectFromClause`.
 * The shared helper is covered on its own, and BigQuery is covered end to end by an e2e — so
 * dropping either line from any of the other five leaves every suite green and ships a report that
 * silently returns its duplicates.
 *
 * Shape only: nothing here executes SQL.
 */
import { AthenaClauseRenderer } from '../athena/services/athena-clause-renderer';
import { AthenaQueryBuilder } from '../athena/services/athena-query.builder';
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';
import { BigQueryQueryBuilder } from '../bigquery/services/bigquery-query.builder';
import { LegacyBigQueryQueryBuilder } from '../bigquery/services/legacy/legacy-bigquery-query.builder';
import type { LegacyBigQuerySqlPreprocessor } from '../bigquery/services/legacy/legacy-bigquery-sql-preprocessor';
import { DatabricksClauseRenderer } from '../databricks/services/databricks-clause-renderer';
import { DatabricksQueryBuilder } from '../databricks/services/databricks-query.builder';
import { RedshiftClauseRenderer } from '../redshift/services/redshift-clause-renderer';
import { RedshiftQueryBuilder } from '../redshift/services/redshift-query.builder';
import { SnowflakeClauseRenderer } from '../snowflake/services/snowflake-clause-renderer';
import { SnowflakeQueryBuilder } from '../snowflake/services/snowflake-query.builder';
import type { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import type { DataMartQueryOptions } from './data-mart-query-builder.interface';

const tableDef = {
  type: 'table',
  fullyQualifiedName: 'db.events',
} as unknown as DataMartDefinition;

const bigQueryTableDef = {
  type: 'table',
  fullyQualifiedName: 'proj.ds.events',
} as unknown as DataMartDefinition;

// The legacy builder's non-output-controls path preprocesses legacy SQL and rejects a table
// definition outright, so this dialect is exercised through the definition it actually serves.
const legacySqlDef = {
  sqlQuery: 'SELECT landing_page FROM legacy_table',
} as unknown as DataMartDefinition;

type BuildSql = (definition: DataMartDefinition, options: DataMartQueryOptions) => Promise<string>;

// A SQL-defined mart reaches the output-controls branch only through a materialised view, which
// the builder refuses to invent for itself.
const LEGACY_EXTRA: DataMartQueryOptions = {
  mainTableReference: '`proj`.`ds`.`view_x`',
} as unknown as DataMartQueryOptions;

const legacyPreprocessor = {
  prepare: jest.fn().mockResolvedValue('SELECT landing_page FROM parsed_table'),
} as unknown as LegacyBigQuerySqlPreprocessor;

const asSql = async (built: unknown): Promise<string> =>
  typeof built === 'string' ? built : ((built as { sql: string }).sql ?? '');

const DIALECTS: { name: string; definition: DataMartDefinition; build: BuildSql }[] = [
  {
    name: 'Athena',
    definition: tableDef,
    build: async (definition, options) =>
      asSql(new AthenaQueryBuilder(new AthenaClauseRenderer()).buildQuery(definition, options)),
  },
  {
    name: 'BigQuery',
    definition: bigQueryTableDef,
    build: async (definition, options) =>
      asSql(
        await new BigQueryQueryBuilder(new BigQueryClauseRenderer()).buildQuery(definition, options)
      ),
  },
  {
    name: 'Legacy BigQuery',
    definition: legacySqlDef,
    build: async (definition, options) =>
      asSql(
        await new LegacyBigQueryQueryBuilder(
          legacyPreprocessor,
          new BigQueryClauseRenderer()
        ).buildQuery(definition, { ...LEGACY_EXTRA, ...options })
      ),
  },
  {
    name: 'Databricks',
    definition: tableDef,
    build: async (definition, options) =>
      asSql(
        new DatabricksQueryBuilder(new DatabricksClauseRenderer()).buildQuery(definition, options)
      ),
  },
  {
    name: 'Redshift',
    definition: tableDef,
    build: async (definition, options) =>
      asSql(new RedshiftQueryBuilder(new RedshiftClauseRenderer()).buildQuery(definition, options)),
  },
  {
    name: 'Snowflake',
    definition: tableDef,
    build: async (definition, options) =>
      asSql(
        new SnowflakeQueryBuilder(new SnowflakeClauseRenderer()).buildQuery(definition, options)
      ),
  },
];

describe.each(DIALECTS)('SELECT DISTINCT on $name', ({ definition, build }) => {
  it('emits DISTINCT for a distinct-only report, which carries no other output control', async () => {
    const sql = await build(definition, { columns: ['landing_page'], distinct: true });
    expect(sql).toContain('SELECT DISTINCT');
  });

  it('emits no DISTINCT for the same projection without it', async () => {
    const sql = await build(definition, { columns: ['landing_page'] });
    expect(sql).not.toContain('DISTINCT');
  });

  it('keeps DISTINCT beside the other output controls rather than replacing them', async () => {
    const sql = await build(definition, {
      columns: ['landing_page'],
      distinct: true,
      limit: 50,
    });
    expect(sql).toContain('SELECT DISTINCT');
    expect(sql).toContain('50');
  });
});
