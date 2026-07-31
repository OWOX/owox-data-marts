import {
  DataQualityCompileInput,
  createDataQualityCheckCompiler,
} from 'src/data-marts/data-quality/data-quality-check-compiler';
import {
  DataQualityQueryExecution,
  createDataQualityResultParser,
} from 'src/data-marts/data-quality/data-quality-result-parser';
import { DataMartSchema } from 'src/data-marts/data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from 'src/data-marts/data-storage-types/enums/data-mart-schema-field-status.enum';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import {
  EffectiveDataQualityRuleConfig,
  buildDataQualityRuleKey,
} from 'src/data-marts/dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRelationshipSnapshot } from 'src/data-marts/dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityCategory } from 'src/data-marts/enums/data-quality-category.enum';
import { DataQualityCheckStatus } from 'src/data-marts/enums/data-quality-check-status.enum';
import { DataQualityScope } from 'src/data-marts/enums/data-quality-scope.enum';
import { DataQualitySeverity } from 'src/data-marts/enums/data-quality-severity.enum';

interface DataQualityNativeTypes {
  integer: string;
  string: string;
  timestamp?: string;
}

interface DataQualitySqlExpressions {
  integer: (value: number | null) => string;
  string: (value: string | null) => string;
  currentTimestamp?: string;
  staleTimestamp?: string;
}

export interface RealDataQualitySuiteOptions {
  storageType: DataStorageType;
  schemaType: DataMartSchema['type'];
  nativeTypes: DataQualityNativeTypes;
  expressions: DataQualitySqlExpressions;
  execute: (sql: string) => Promise<DataQualityQueryExecution>;
  fieldMode?: string;
  sourceIdentifier?: (identifier: string) => string;
  timeout?: number;
}

interface DataQualityScenario {
  category: DataQualityCategory;
  passing: DataQualityCompileInput;
  finding: DataQualityCompileInput;
}

interface SchemaFieldInput {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
}

type SqlRow = Record<string, string>;

const relationshipSnapshot: DataQualityRelationshipSnapshot = {
  id: 'real-dq-relationship',
  sourceDataMartId: 'real-dq-source',
  targetDataMartId: 'real-dq-target',
  targetAlias: 'target_records',
  joinConditions: [{ sourceFieldName: 'relationship_id', targetFieldName: 'id' }],
};

export function registerRealDataQualitySuite(options: RealDataQualitySuiteOptions): void {
  const compiler = createDataQualityCheckCompiler();
  const parser = createDataQualityResultParser();
  const scenarios = buildScenarios(options);
  const timeout = options.timeout ?? 120000;

  it.each(scenarios)(
    '$category passes against the real storage',
    async scenario => {
      const result = await compileExecuteAndParse(scenario.passing, options, compiler, parser);

      expect(result.status).toBe(DataQualityCheckStatus.PASSED);
      expect(result.violationCount).toBe(0);
      expect(result.examples).toEqual([]);
    },
    timeout
  );

  it.each(scenarios)(
    '$category detects a finding against the real storage',
    async scenario => {
      const result = await compileExecuteAndParse(scenario.finding, options, compiler, parser);

      expect(result.status).toBe(DataQualityCheckStatus.FAILED);
      expect(result.violationCount).toBeGreaterThan(0);
      if (scenario.category === DataQualityCategory.EMPTY_TABLE) {
        expect(result.examples).toEqual([]);
      } else {
        expect(result.examples.length).toBeGreaterThan(0);
        expect(result.examples.length).toBeLessThanOrEqual(3);
      }
    },
    timeout
  );

  if (!supportsFreshness(options)) {
    it('marks data freshness as not applicable for the storage', async () => {
      const input = fieldInput(
        options,
        DataQualityCategory.DATA_FRESHNESS,
        'updated_at',
        [{ name: 'updated_at', type: 'TIMESTAMP_TZ' }],
        selectRows([{ updated_at: options.expressions.string('not-an-instant') }]),
        { thresholdHours: 24 }
      );

      const plan = await compiler.compile(input);

      expect(plan.kind).toBe('NOT_APPLICABLE');
      if (plan.kind === 'NOT_APPLICABLE') {
        expect(plan.reason).toContain('instant timestamp');
      }
    });
  }
}

async function compileExecuteAndParse(
  input: DataQualityCompileInput,
  options: RealDataQualitySuiteOptions,
  compiler: ReturnType<typeof createDataQualityCheckCompiler>,
  parser: ReturnType<typeof createDataQualityResultParser>
) {
  const plan = await compiler.compile(input);
  expect(plan.kind).toBe('EXECUTABLE');
  if (plan.kind !== 'EXECUTABLE') {
    throw new Error(`${plan.category} was not executable: ${plan.reason}`);
  }

  const execution = await options.execute(plan.sql);
  expect(execution.error).toBeUndefined();
  expect(execution.rows?.length).toBeGreaterThan(0);
  return parser.parse(options.storageType, plan, execution);
}

function buildScenarios(options: RealDataQualitySuiteOptions): DataQualityScenario[] {
  const { integer, string } = options.expressions;
  const scenarios: DataQualityScenario[] = [
    {
      category: DataQualityCategory.EMPTY_TABLE,
      passing: tableInput(
        options,
        DataQualityCategory.EMPTY_TABLE,
        [{ name: 'id', type: options.nativeTypes.integer }],
        selectRows([{ id: integer(1) }])
      ),
      finding: tableInput(
        options,
        DataQualityCategory.EMPTY_TABLE,
        [{ name: 'id', type: options.nativeTypes.integer }],
        selectEmptyRow({ id: integer(1) })
      ),
    },
    {
      category: DataQualityCategory.PK_UNIQUENESS,
      passing: tableInput(
        options,
        DataQualityCategory.PK_UNIQUENESS,
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('first') },
          { id: integer(2), value: string('second') },
        ])
      ),
      finding: tableInput(
        options,
        DataQualityCategory.PK_UNIQUENESS,
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('first') },
          { id: integer(1), value: string('second') },
        ])
      ),
    },
    {
      category: DataQualityCategory.DUPLICATE_ROWS,
      passing: tableInput(
        options,
        DataQualityCategory.DUPLICATE_ROWS,
        [
          { name: 'id', type: options.nativeTypes.integer },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('first') },
          { id: integer(2), value: string('second') },
        ])
      ),
      finding: tableInput(
        options,
        DataQualityCategory.DUPLICATE_ROWS,
        [
          { name: 'id', type: options.nativeTypes.integer },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('duplicate') },
          { id: integer(1), value: string('duplicate') },
        ])
      ),
    },
    {
      category: DataQualityCategory.NULL_RATE,
      passing: fieldInput(
        options,
        DataQualityCategory.NULL_RATE,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([{ id: integer(1), value: string('present') }]),
        { thresholdPercent: 0 }
      ),
      finding: fieldInput(
        options,
        DataQualityCategory.NULL_RATE,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('present') },
          { id: integer(2), value: string(null) },
        ]),
        { thresholdPercent: 0 }
      ),
    },
    {
      category: DataQualityCategory.COLUMN_UNIQUENESS,
      passing: fieldInput(
        options,
        DataQualityCategory.COLUMN_UNIQUENESS,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('first') },
          { id: integer(2), value: string('second') },
        ])
      ),
      finding: fieldInput(
        options,
        DataQualityCategory.COLUMN_UNIQUENESS,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('duplicate') },
          { id: integer(2), value: string('duplicate') },
        ])
      ),
    },
    {
      category: DataQualityCategory.CONSTANT_COLUMN,
      passing: fieldInput(
        options,
        DataQualityCategory.CONSTANT_COLUMN,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('first') },
          { id: integer(2), value: string('second') },
        ])
      ),
      finding: fieldInput(
        options,
        DataQualityCategory.CONSTANT_COLUMN,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.string },
        ],
        selectRows([
          { id: integer(1), value: string('constant') },
          { id: integer(2), value: string('constant') },
        ])
      ),
    },
    {
      category: DataQualityCategory.TYPE_MISMATCH,
      passing: fieldInput(
        options,
        DataQualityCategory.TYPE_MISMATCH,
        'value',
        [{ name: 'value', type: options.nativeTypes.string }],
        selectRows([{ value: string('matching') }])
      ),
      finding: fieldInput(
        options,
        DataQualityCategory.TYPE_MISMATCH,
        'value',
        [{ name: 'value', type: options.nativeTypes.integer }],
        selectRows([{ value: string('mismatched') }])
      ),
    },
    {
      category: DataQualityCategory.NEGATIVE_VALUES,
      passing: fieldInput(
        options,
        DataQualityCategory.NEGATIVE_VALUES,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.integer },
        ],
        selectRows([
          { id: integer(1), value: integer(0) },
          { id: integer(2), value: integer(1) },
        ])
      ),
      finding: fieldInput(
        options,
        DataQualityCategory.NEGATIVE_VALUES,
        'value',
        [
          { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
          { name: 'value', type: options.nativeTypes.integer },
        ],
        selectRows([
          { id: integer(1), value: integer(-1) },
          { id: integer(2), value: integer(1) },
        ])
      ),
    },
    relationshipScenario(options, false),
    relationshipScenario(options, true),
  ];

  if (supportsFreshness(options)) {
    scenarios.splice(7, 0, freshnessScenario(options));
  }

  return scenarios;
}

function freshnessScenario(options: RealDataQualitySuiteOptions): DataQualityScenario {
  const timestampType = options.nativeTypes.timestamp!;
  const currentTimestamp = options.expressions.currentTimestamp!;
  const staleTimestamp = options.expressions.staleTimestamp!;
  const fields = [
    { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
    { name: 'updated_at', type: timestampType },
  ];
  return {
    category: DataQualityCategory.DATA_FRESHNESS,
    passing: fieldInput(
      options,
      DataQualityCategory.DATA_FRESHNESS,
      'updated_at',
      fields,
      selectRows([{ id: options.expressions.integer(1), updated_at: currentTimestamp }]),
      { thresholdHours: 24 }
    ),
    finding: fieldInput(
      options,
      DataQualityCategory.DATA_FRESHNESS,
      'updated_at',
      fields,
      selectRows([{ id: options.expressions.integer(1), updated_at: staleTimestamp }]),
      { thresholdHours: 24 }
    ),
  };
}

function relationshipScenario(
  options: RealDataQualitySuiteOptions,
  reverse: boolean
): DataQualityScenario {
  const category = reverse
    ? DataQualityCategory.REVERSE_RELATIONSHIP
    : DataQualityCategory.RELATIONSHIP_INTEGRITY;
  const sourceFields = [
    { name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true },
    { name: 'relationship_id', type: options.nativeTypes.integer },
  ];
  const targetFields = [{ name: 'id', type: options.nativeTypes.integer, isPrimaryKey: true }];
  const targetRows = selectRows([
    { id: options.expressions.integer(1) },
    { id: options.expressions.integer(2) },
  ]);
  const passingSource = selectRows([
    { id: options.expressions.integer(10), relationship_id: options.expressions.integer(1) },
    { id: options.expressions.integer(20), relationship_id: options.expressions.integer(2) },
  ]);
  const findingSource = reverse
    ? selectRows([
        { id: options.expressions.integer(10), relationship_id: options.expressions.integer(1) },
      ])
    : selectRows([
        { id: options.expressions.integer(10), relationship_id: options.expressions.integer(1) },
        { id: options.expressions.integer(30), relationship_id: options.expressions.integer(3) },
      ]);
  return {
    category,
    passing: relationshipInput(
      options,
      category,
      sourceFields,
      targetFields,
      passingSource,
      targetRows
    ),
    finding: relationshipInput(
      options,
      category,
      sourceFields,
      targetFields,
      findingSource,
      targetRows
    ),
  };
}

function tableInput(
  options: RealDataQualitySuiteOptions,
  category: DataQualityCategory,
  fields: SchemaFieldInput[],
  sourceQuery: string
): DataQualityCompileInput {
  return {
    storageType: options.storageType,
    sourceQuery: renderSourceQuery(options, sourceQuery),
    schema: buildSchema(options, fields),
    rule: rule(category, { type: DataQualityScope.DATA_MART }),
  };
}

function fieldInput(
  options: RealDataQualitySuiteOptions,
  category: DataQualityCategory,
  fieldName: string,
  fields: SchemaFieldInput[],
  sourceQuery: string,
  parameters: EffectiveDataQualityRuleConfig['parameters'] = {}
): DataQualityCompileInput {
  return {
    storageType: options.storageType,
    sourceQuery: renderSourceQuery(options, sourceQuery),
    schema: buildSchema(options, fields),
    rule: rule(category, { type: DataQualityScope.FIELD, fieldPath: [fieldName] }, parameters),
  };
}

function relationshipInput(
  options: RealDataQualitySuiteOptions,
  category: DataQualityCategory,
  sourceFields: SchemaFieldInput[],
  targetFields: SchemaFieldInput[],
  sourceQuery: string,
  targetSourceQuery: string
): DataQualityCompileInput {
  return {
    storageType: options.storageType,
    sourceQuery: renderSourceQuery(options, sourceQuery),
    schema: buildSchema(options, sourceFields),
    rule: rule(category, {
      type: DataQualityScope.RELATIONSHIP,
      relationshipId: relationshipSnapshot.id,
    }),
    relationship: {
      snapshot: relationshipSnapshot,
      targetSourceQuery: renderSourceQuery(options, targetSourceQuery),
      targetSchema: buildSchema(options, targetFields),
      targetStorageType: options.storageType,
      sourceConnectionId: 'real-dq-connection',
      targetConnectionId: 'real-dq-connection',
    },
  };
}

function rule(
  category: DataQualityCategory,
  scope:
    | { type: DataQualityScope.DATA_MART }
    | { type: DataQualityScope.FIELD; fieldPath: string[] }
    | { type: DataQualityScope.RELATIONSHIP; relationshipId: string },
  parameters: EffectiveDataQualityRuleConfig['parameters'] = {}
): EffectiveDataQualityRuleConfig {
  return {
    key: buildDataQualityRuleKey(category, scope),
    category,
    scope,
    severity: DataQualitySeverity.WARNING,
    enabled: true,
    isApplicable: true,
    parameters,
  };
}

function buildSchema(
  options: RealDataQualitySuiteOptions,
  fields: SchemaFieldInput[]
): DataMartSchema {
  return {
    type: options.schemaType,
    ...(options.schemaType === 'databricks-data-mart-schema' ? { table: 'dq_source' } : {}),
    fields: fields.map(field => ({
      name: field.name,
      type: field.type,
      status: DataMartSchemaFieldStatus.CONNECTED,
      isPrimaryKey: field.isPrimaryKey ?? false,
      isHiddenForReporting: false,
      ...(options.fieldMode ? { mode: options.fieldMode } : {}),
    })),
  } as DataMartSchema;
}

function renderSourceQuery(options: RealDataQualitySuiteOptions, sql: string): string {
  const sourceIdentifier = options.sourceIdentifier;
  if (!sourceIdentifier) return sql;
  return sql.replace(
    / AS ([a-z_][a-z0-9_]*)(,?)(?=\n|$)/gi,
    (_match, identifier: string, suffix: string) => ` AS ${sourceIdentifier(identifier)}${suffix}`
  );
}

function selectRows(rows: SqlRow[]): string {
  if (rows.length === 0) throw new Error('Data Quality fixture query requires at least one row');
  return rows.map(selectRow).join('\nUNION ALL\n');
}

function selectEmptyRow(row: SqlRow): string {
  return ['SELECT *', 'FROM (', selectRow(row), ') AS dq_empty_seed', 'WHERE 1 = 0'].join('\n');
}

function selectRow(row: SqlRow): string {
  return [
    'SELECT',
    Object.entries(row)
      .map(([column, expression], index, values) => {
        const suffix = index < values.length - 1 ? ',' : '';
        return `  ${expression} AS ${column}${suffix}`;
      })
      .join('\n'),
  ].join('\n');
}

function supportsFreshness(options: RealDataQualitySuiteOptions): boolean {
  return Boolean(
    options.nativeTypes.timestamp &&
    options.expressions.currentTimestamp &&
    options.expressions.staleTimestamp
  );
}
