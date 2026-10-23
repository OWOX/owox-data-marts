import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  createProductionDuckDbInstance,
  readSerializedRows,
} from '../data-storage-types/duckdb/__fixtures__/production-duckdb-instance';
import { parseDuckDbFieldType } from '../data-storage-types/duckdb/schemas/duckdb-data-mart-schema.schema';
import { DuckDbClauseRenderer } from '../data-storage-types/duckdb/services/duckdb-clause-renderer';
import { DuckDbQueryBuilder } from '../data-storage-types/duckdb/services/duckdb-query.builder';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { EffectiveDataQualityRuleConfig } from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import {
  DataQualityCompileInput,
  createDataQualityCheckCompiler,
} from './data-quality-check-compiler';
import { createDataQualityResultParser } from './data-quality-result-parser';

const COLUMNS: Record<string, string> = {
  c_varchar: 'VARCHAR',
  c_bigint: 'BIGINT',
  c_integer: 'INTEGER',
  c_decimal: 'DECIMAL(10,2)',
  c_double: 'DOUBLE',
  c_boolean: 'BOOLEAN',
  c_date: 'DATE',
  c_timestamp: 'TIMESTAMP',
  c_timestamptz: 'TIMESTAMPTZ',
  c_struct: 'STRUCT(a INTEGER, b VARCHAR)',
};
const COLUMN_NAMES = Object.keys(COLUMNS);

const ROW_VALUES = [
  `'1', 't', 'a', 1, 1, 1.50, 1.5, TRUE, DATE '2024-01-01', TIMESTAMP '2024-01-01 10:00:00', TIMESTAMPTZ '2024-01-01 10:00:00+00', {'a': 1, 'b': 'x'}`,
  `'2', 't', 'b', -2, -2, -2.50, -2.5, FALSE, DATE '2024-01-02', TIMESTAMP '2024-01-02 10:00:00', TIMESTAMPTZ '2024-01-02 10:00:00+00', {'a': 2, 'b': 'y'}`,
  `'2', 't', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL`,
  `'3', 't', 'a', 1, 1, 1.50, 1.5, TRUE, DATE '2024-01-01', TIMESTAMP '2024-01-01 10:00:00', TIMESTAMPTZ '2024-01-01 10:00:00+00', {'a': 1, 'b': 'x'}`,
  `'3', 't', 'a', 1, 1, 1.50, 1.5, TRUE, DATE '2024-01-01', TIMESTAMP '2024-01-01 10:00:00', TIMESTAMPTZ '2024-01-01 10:00:00+00', {'a': 1, 'b': 'x'}`,
];

const FIELD_CATEGORIES = [
  DataQualityCategory.NULL_RATE,
  DataQualityCategory.COLUMN_UNIQUENESS,
  DataQualityCategory.CONSTANT_COLUMN,
  DataQualityCategory.TYPE_MISMATCH,
  DataQualityCategory.DATA_FRESHNESS,
  DataQualityCategory.NEGATIVE_VALUES,
];
const TABLE_CATEGORIES = [
  DataQualityCategory.EMPTY_TABLE,
  DataQualityCategory.PK_UNIQUENESS,
  DataQualityCategory.DUPLICATE_ROWS,
];
const RELATIONSHIP_CATEGORIES = [
  DataQualityCategory.RELATIONSHIP_INTEGRITY,
  DataQualityCategory.REVERSE_RELATIONSHIP,
];

const NUMERIC_COLUMNS = ['c_bigint', 'c_integer', 'c_decimal', 'c_double'];

// Not applicable where the compiler skips the type. Schema refresh declares INTEGER as BIGINT,
// DECIMAL as DOUBLE and the struct as VARCHAR, and the type check accepts each of them.
function expectedFieldStatus(category: DataQualityCategory, column: string) {
  const { PASSED, FAILED, NOT_APPLICABLE } = DataQualityCheckStatus;
  switch (category) {
    case DataQualityCategory.CONSTANT_COLUMN:
    case DataQualityCategory.TYPE_MISMATCH:
      return PASSED;
    case DataQualityCategory.DATA_FRESHNESS:
      return column === 'c_timestamptz' ? FAILED : NOT_APPLICABLE;
    case DataQualityCategory.NEGATIVE_VALUES:
      return NUMERIC_COLUMNS.includes(column) ? FAILED : NOT_APPLICABLE;
    default:
      return FAILED;
  }
}

function rule(
  category: DataQualityCategory,
  scope: EffectiveDataQualityRuleConfig['scope'],
  suffix: string
): EffectiveDataQualityRuleConfig {
  const parameters =
    category === DataQualityCategory.NULL_RATE
      ? { thresholdPercent: 5 }
      : category === DataQualityCategory.DATA_FRESHNESS
        ? { thresholdHours: 24 }
        : {};
  return {
    key: `${category}:${suffix}`,
    category,
    scope,
    severity: DataQualitySeverity.WARNING,
    enabled: true,
    isApplicable: true,
    parameters,
  };
}

// The SQL runs on real DuckDB with production options; the parser must read what DuckDB returns.
describe('Data Quality SQL compiled for DuckDB runs on DuckDB', () => {
  const compiler = createDataQualityCheckCompiler();
  const parser = createDataQualityResultParser();
  const queryBuilder = new DuckDbQueryBuilder(new DuckDbClauseRenderer());
  let instance: any;
  let connection: any;
  let schema: DataMartSchema;
  let targetSchema: DataMartSchema;

  // Built the way a schema refresh builds it: from information_schema through the type parser.
  async function schemaOf(table: string): Promise<DataMartSchema> {
    const reader = await connection.runAndReadAll(
      `SELECT column_name, data_type FROM information_schema.columns ` +
        `WHERE table_name = '${table}' ORDER BY ordinal_position`
    );
    const fields = reader
      .getRowObjects()
      .map(({ column_name, data_type }: Record<string, string>) => ({
        name: column_name,
        type: parseDuckDbFieldType(data_type),
        status: DataMartSchemaFieldStatus.CONNECTED,
        isPrimaryKey: column_name === 'id' || column_name === 'tenant_id',
        isHiddenForReporting: false,
      }));
    return { type: 'duckdb-data-mart-schema', fields } as DataMartSchema;
  }

  function sourceQuery(table: string) {
    return async (columns?: string[]) => {
      const built = queryBuilder.buildQuery({ fullyQualifiedName: `main.${table}` }, { columns });
      return isQueryBuildResult(built) ? built.sql : built;
    };
  }

  async function compileRunAndParse(input: Omit<DataQualityCompileInput, 'storageType'>) {
    const plan = await compiler.compile({ ...input, storageType: DataStorageType.DUCKDB });
    const execution =
      plan.kind === 'EXECUTABLE'
        ? { sql: plan.sql, rows: await readSerializedRows(connection, plan.sql) }
        : null;
    const parsed = await parser.parse(DataStorageType.DUCKDB, plan, execution);
    expect(parsed.error).toBeNull();
    return parsed.status;
  }

  beforeAll(async () => {
    instance = await createProductionDuckDbInstance();
    connection = await instance.connect();
    const columns = COLUMN_NAMES.map(name => `${name} ${COLUMNS[name]}`).join(', ');
    await connection.run(`CREATE TABLE main.dq_source (id VARCHAR, tenant_id VARCHAR, ${columns})`);
    await connection.run(
      `INSERT INTO main.dq_source VALUES ${ROW_VALUES.map(row => `(${row})`).join(', ')}`
    );
    await connection.run(
      `CREATE TABLE main.dq_target AS SELECT * FROM main.dq_source WHERE id = '2'`
    );
    schema = await schemaOf('dq_source');
    targetSchema = await schemaOf('dq_target');
  });

  afterAll(() => {
    connection?.closeSync();
    instance?.closeSync();
  });

  it.each(TABLE_CATEGORIES)('runs %s', async category => {
    const status = await compileRunAndParse({
      resolveSourceQuery: sourceQuery('dq_source'),
      schema,
      rule: rule(category, { type: DataQualityScope.DATA_MART }, 'data_mart'),
    });
    expect(status).toBe(
      category === DataQualityCategory.EMPTY_TABLE
        ? DataQualityCheckStatus.PASSED
        : DataQualityCheckStatus.FAILED
    );
  });

  it.each(FIELD_CATEGORIES.flatMap(category => COLUMN_NAMES.map(column => [category, column])))(
    'runs %s on %s',
    async (category, column) => {
      const status = await compileRunAndParse({
        resolveSourceQuery: sourceQuery('dq_source'),
        schema,
        rule: rule(
          category as DataQualityCategory,
          { type: DataQualityScope.FIELD, fieldPath: [column] },
          `field:["${column}"]`
        ),
      });
      expect(status).toBe(expectedFieldStatus(category as DataQualityCategory, column));
    }
  );

  it.each([
    ['c_varchar', 'BIGINT'],
    ['c_integer', 'VARCHAR'],
    ['c_struct', 'DOUBLE'],
  ])('fails the type check when %s is declared %s', async (column, declaredType) => {
    const fields = (schema as unknown as { fields: Array<Record<string, unknown>> }).fields;
    const mismatched = {
      ...schema,
      fields: fields.map(f => (f.name === column ? { ...f, type: declaredType } : f)),
    } as DataMartSchema;
    const status = await compileRunAndParse({
      resolveSourceQuery: sourceQuery('dq_source'),
      schema: mismatched,
      rule: rule(
        DataQualityCategory.TYPE_MISMATCH,
        { type: DataQualityScope.FIELD, fieldPath: [column] },
        `field:["${column}"]`
      ),
    });
    expect(status).toBe(DataQualityCheckStatus.FAILED);
  });

  it.each(
    RELATIONSHIP_CATEGORIES.flatMap(category => COLUMN_NAMES.map(column => [category, column]))
  )('runs %s joined on %s', async (category, column) => {
    const snapshot: DataQualityRelationshipSnapshot = {
      id: 'rel-1',
      sourceDataMartId: 'source-dm',
      targetDataMartId: 'target-dm',
      targetAlias: 'target',
      joinConditions: [
        { sourceFieldName: 'tenant_id', targetFieldName: 'tenant_id' },
        { sourceFieldName: column, targetFieldName: column },
      ],
    };
    const status = await compileRunAndParse({
      resolveSourceQuery: sourceQuery('dq_source'),
      schema,
      rule: rule(
        category as DataQualityCategory,
        { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' },
        'relationship:rel-1'
      ),
      relationship: {
        snapshot,
        resolveTargetSourceQuery: sourceQuery('dq_target'),
        targetSchema,
        targetStorageType: DataStorageType.DUCKDB,
        sourceConnectionId: 'connection-1',
        targetConnectionId: 'connection-1',
      },
    });
    // The target holds only the 'b' rows, so source rows with other values have no match.
    expect(status).toBe(
      category === DataQualityCategory.RELATIONSHIP_INTEGRITY
        ? DataQualityCheckStatus.FAILED
        : DataQualityCheckStatus.PASSED
    );
  });
});
