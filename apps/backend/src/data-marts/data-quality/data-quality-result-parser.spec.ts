import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataQualityCompiledCheck } from './data-quality-check-compiler';
import {
  DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS,
  DataQualityQueryExecution,
  aggregateDataQualitySummary,
  createDataQualityResultParser,
} from './data-quality-result-parser';
import { DataQualityCanonicalType } from './data-quality-sql-dialect';

describe('DataQualityResultParser', () => {
  const executablePlan = (
    overrides: Partial<Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }>> = {}
  ): Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }> => ({
    kind: 'EXECUTABLE',
    category: DataQualityCategory.NEGATIVE_VALUES,
    ruleKey: 'negative_values:field:["amount"]',
    severity: DataQualitySeverity.WARNING,
    strategy: 'COUNT',
    sql: 'SELECT one unified result',
    resultShape: {
      exampleMarkerColumn: 'example_available',
      exampleColumns: ['negative_value', 'primary_key_value_1'],
    },
    ...overrides,
  });

  const execution = (
    rows: Record<string, unknown>[],
    sql = 'SELECT one unified result'
  ): DataQualityQueryExecution => ({ sql, rows });

  const resultRows = (
    summary: Record<string, unknown>,
    examples: Record<string, unknown>[] = []
  ): Record<string, unknown>[] =>
    examples.length > 0
      ? examples.map(example => ({ ...summary, example_available: 1, ...example }))
      : [{ ...summary, example_available: null }];

  it('parses a full count and at most three examples from one result set', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.GOOGLE_BIGQUERY,
      executablePlan(),
      execution(
        resultRows({ violation_count: '7', is_applicable: 1 }, [
          { negative_value: -1, primary_key_value_1: 'a' },
          { negative_value: -2, primary_key_value_1: 'b' },
          { negative_value: -3, primary_key_value_1: 'c' },
          { negative_value: -4, primary_key_value_1: 'd' },
        ])
      )
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.FAILED,
      violationCount: 7,
      sql: 'SELECT one unified result',
    });
    expect(result.examples).toEqual([
      { values: { negative_value: -1, primary_key_value_1: 'a' } },
      { values: { negative_value: -2, primary_key_value_1: 'b' } },
      { values: { negative_value: -3, primary_key_value_1: 'c' } },
    ]);
  });

  it.each([
    DataQualityCategory.PK_UNIQUENESS,
    DataQualityCategory.DUPLICATE_ROWS,
    DataQualityCategory.NULL_RATE,
    DataQualityCategory.COLUMN_UNIQUENESS,
    DataQualityCategory.CONSTANT_COLUMN,
    DataQualityCategory.DATA_FRESHNESS,
    DataQualityCategory.NEGATIVE_VALUES,
    DataQualityCategory.RELATIONSHIP_INTEGRITY,
    DataQualityCategory.REVERSE_RELATIONSHIP,
  ])(
    'deduplicates examples and never stores more examples than violations for %s',
    async category => {
      const result = await createDataQualityResultParser().parse(
        DataStorageType.GOOGLE_BIGQUERY,
        executablePlan({ category }),
        execution(
          resultRows({ violation_count: 2, is_applicable: 1 }, [
            { negative_value: -1, primary_key_value_1: 'a' },
            { negative_value: -1, primary_key_value_1: 'a' },
            { negative_value: -2, primary_key_value_1: 'b' },
            { negative_value: -3, primary_key_value_1: 'c' },
          ])
        )
      );

      expect(result.examples).toEqual([
        { values: { negative_value: -1, primary_key_value_1: 'a' } },
        { values: { negative_value: -2, primary_key_value_1: 'b' } },
      ]);
    }
  );

  it('stores one sample for a single type-mismatch violation', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.GOOGLE_BIGQUERY,
      executablePlan({
        category: DataQualityCategory.TYPE_MISMATCH,
        strategy: 'TYPE_MISMATCH',
        expectedType: DataQualityCanonicalType.INTEGER,
        expectedNativeType: 'INTEGER',
        resultShape: {
          exampleMarkerColumn: 'example_available',
          exampleColumns: ['sample_value'],
          actualTypeColumn: 'actual_type',
        },
      }),
      execution(
        resultRows({ actual_type: 'STRING', is_applicable: 1 }, [
          { sample_value: 'first' },
          { sample_value: 'second' },
          { sample_value: 'third' },
        ])
      )
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.FAILED,
      violationCount: 1,
      examples: [{ values: { sample_value: 'first' } }],
    });
  });

  it('maps empty-source applicability to NOT_APPLICABLE', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.AWS_ATHENA,
      executablePlan({ category: DataQualityCategory.NULL_RATE }),
      execution(resultRows({ violation_count: 0, is_applicable: 0 }))
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.NOT_APPLICABLE,
      violationCount: 0,
      examples: [],
    });
  });

  it('uses the marker rather than example values so a NULL finding is retained', async () => {
    const plan = executablePlan({
      category: DataQualityCategory.NULL_RATE,
      resultShape: {
        exampleMarkerColumn: 'example_available',
        exampleColumns: ['null_value', 'primary_key_value_1'],
      },
    });
    const result = await createDataQualityResultParser().parse(
      DataStorageType.GOOGLE_BIGQUERY,
      plan,
      execution([
        {
          is_applicable: 1,
          violation_count: 1,
          example_available: 1,
          null_value: null,
          primary_key_value_1: 'row-1',
        },
      ])
    );

    expect(result.examples).toEqual([
      { values: { null_value: null, primary_key_value_1: 'row-1' } },
    ]);
  });

  it('reads Snowflake aliases case-insensitively and stores compile-time aliases', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.SNOWFLAKE,
      executablePlan(),
      execution([
        {
          VIOLATION_COUNT: 1,
          IS_APPLICABLE: 1,
          EXAMPLE_AVAILABLE: 1,
          NEGATIVE_VALUE: -5,
          PRIMARY_KEY_VALUE_1: 'id-1',
        },
      ])
    );

    expect(result.status).toBe(DataQualityCheckStatus.FAILED);
    expect(result.examples).toEqual([
      { values: { negative_value: -5, primary_key_value_1: 'id-1' } },
    ]);
  });

  it('maps a warehouse failure and keeps the exact unified SQL', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.AWS_REDSHIFT,
      executablePlan(),
      {
        sql: 'SELECT failed unified result',
        error: {
          code: 'WAREHOUSE_TIMEOUT',
          message: 'query timed out',
          details: { retry: true },
        },
      }
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.ERROR,
      violationCount: 0,
      sql: 'SELECT failed unified result',
      error: { code: 'WAREHOUSE_TIMEOUT', message: 'query timed out' },
    });
  });

  it.each([
    [
      DataStorageType.GOOGLE_BIGQUERY,
      'INT64',
      'INTEGER',
      DataQualityCanonicalType.INTEGER,
      DataQualityCheckStatus.PASSED,
    ],
    [
      DataStorageType.AWS_ATHENA,
      'BIGINT',
      'BIGINT',
      DataQualityCanonicalType.INTEGER,
      DataQualityCheckStatus.PASSED,
    ],
    [
      DataStorageType.SNOWFLAKE,
      'NUMBER(38,2)[SB8]',
      'INTEGER',
      DataQualityCanonicalType.INTEGER,
      DataQualityCheckStatus.FAILED,
    ],
    [
      DataStorageType.DATABRICKS,
      'STRING',
      'BIGINT',
      DataQualityCanonicalType.INTEGER,
      DataQualityCheckStatus.FAILED,
    ],
  ])(
    'strictly compares the single-query runtime type for %s',
    async (storageType, actualType, expectedNativeType, expectedType, status) => {
      const plan = executablePlan({
        category: DataQualityCategory.TYPE_MISMATCH,
        strategy: 'TYPE_MISMATCH',
        expectedType,
        expectedNativeType,
        resultShape: {
          exampleMarkerColumn: 'example_available',
          exampleColumns: ['sample_value'],
          actualTypeColumn: 'actual_type',
          actualTypeMetadataColumn: 'sample_value',
        },
      });
      const result = await createDataQualityResultParser().parse(
        storageType,
        plan,
        execution([
          {
            actual_type: actualType,
            example_available: 1,
            sample_value: 7,
          },
        ])
      );

      expect(result.status).toBe(status);
      expect(result.violationCount).toBe(status === DataQualityCheckStatus.FAILED ? 1 : 0);
      expect(result.examples).toHaveLength(status === DataQualityCheckStatus.FAILED ? 1 : 0);
    }
  );

  it('preserves BigQuery repeated-mode strictness', async () => {
    const plan = executablePlan({
      category: DataQualityCategory.TYPE_MISMATCH,
      strategy: 'TYPE_MISMATCH',
      expectedType: DataQualityCanonicalType.INTEGER,
      expectedNativeType: 'INTEGER',
      expectedMode: 'REPEATED',
      resultShape: {
        exampleMarkerColumn: 'example_available',
        exampleColumns: ['sample_value'],
        actualTypeColumn: 'actual_type',
      },
    });
    const parser = createDataQualityResultParser();

    await expect(
      parser.parse(
        DataStorageType.GOOGLE_BIGQUERY,
        plan,
        execution(resultRows({ actual_type: 'ARRAY<INT64>' }))
      )
    ).resolves.toMatchObject({ status: DataQualityCheckStatus.PASSED });
    await expect(
      parser.parse(
        DataStorageType.GOOGLE_BIGQUERY,
        plan,
        execution(resultRows({ actual_type: 'INT64' }))
      )
    ).resolves.toMatchObject({ status: DataQualityCheckStatus.FAILED });
  });

  it('reads Redshift actual type from metadata of the unified sample column on an empty source', async () => {
    const plan = executablePlan({
      category: DataQualityCategory.TYPE_MISMATCH,
      strategy: 'TYPE_MISMATCH',
      expectedType: DataQualityCanonicalType.INTEGER,
      expectedNativeType: 'BIGINT',
      resultShape: {
        exampleMarkerColumn: 'example_available',
        exampleColumns: ['sample_value'],
        actualTypeColumn: 'actual_type',
        actualTypeMetadataColumn: 'sample_value',
      },
    });
    const result = await createDataQualityResultParser().parse(DataStorageType.AWS_REDSHIFT, plan, {
      ...execution(resultRows({ actual_type: null })),
      columnMetadata: [{ name: 'sample_value', label: 'SAMPLE_VALUE', typeName: 'int8' }],
    });

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.PASSED,
      violationCount: 0,
    });
  });

  it('unwraps provider scalar wrappers before storing examples', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.GOOGLE_BIGQUERY,
      executablePlan({
        resultShape: {
          exampleMarkerColumn: 'example_available',
          exampleColumns: ['negative_value'],
        },
      }),
      execution([
        {
          is_applicable: 1,
          violation_count: 1,
          example_available: 1,
          negative_value: { value: '2026-07-24T13:17:22.432114Z' },
        },
      ])
    );

    expect(result.examples[0]).toEqual({
      values: { negative_value: '2026-07-24T13:17:22.432114Z' },
    });
  });

  it('serializes BigQuery NUMERIC wrappers as decimal strings', async () => {
    class Big {
      readonly s = 1;
      readonly e = 29;
      readonly c = [1, 2, 3];

      toString() {
        return '12345678901234567890.123456789';
      }
    }

    const result = await createDataQualityResultParser().parse(
      DataStorageType.GOOGLE_BIGQUERY,
      executablePlan({
        resultShape: {
          exampleMarkerColumn: 'example_available',
          exampleColumns: ['negative_value'],
        },
      }),
      execution([
        {
          is_applicable: 1,
          violation_count: 1,
          example_available: 1,
          negative_value: new Big(),
        },
      ])
    );

    expect(result.examples[0]).toEqual({
      values: { negative_value: '12345678901234567890.123456789' },
    });
  });

  it('safely serializes BigInt, Date, binary, and circular values', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const plan = executablePlan({
      resultShape: {
        exampleMarkerColumn: 'example_available',
        exampleColumns: ['value'],
      },
    });
    const result = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      plan,
      execution([
        {
          is_applicable: 1,
          violation_count: 1,
          example_available: 1,
          value: {
            bigint: 42n,
            date: new Date('2026-07-24T00:00:00.000Z'),
            binary: Uint8Array.from([1, 2, 3]),
            circular,
          },
        },
      ])
    );

    expect(result.examples[0].values).toEqual({
      value: {
        bigint: '42',
        binary: '[Binary base64:AQID]',
        circular: { self: '[Circular]' },
        date: '2026-07-24T00:00:00.000Z',
      },
    });
  });

  it('bounds long UTF-8 strings and large collections', async () => {
    const plan = executablePlan({
      resultShape: {
        exampleMarkerColumn: 'example_available',
        exampleColumns: ['value'],
      },
    });
    const result = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      plan,
      execution([
        {
          is_applicable: 1,
          violation_count: 1,
          example_available: 1,
          value: {
            unicode: '🙂'.repeat(DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxStringBytes),
            list: Array.from(
              { length: DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxCollectionItems + 5 },
              (_, index) => index
            ),
          },
        },
      ])
    );

    const value = result.examples[0].values.value as {
      unicode: string;
      list: unknown[];
    };
    expect(value.unicode).toContain('[Truncated');
    expect(value.list.at(-1)).toBe('[Truncated 5 items]');
  });

  it('returns a persisted NOT_APPLICABLE result for a compile-time unsupported check', async () => {
    const plan: DataQualityCompiledCheck = {
      kind: 'NOT_APPLICABLE',
      category: DataQualityCategory.DUPLICATE_ROWS,
      ruleKey: 'duplicate_rows:data_mart',
      severity: DataQualitySeverity.ERROR,
      reason: 'Unsupported complex type',
      sql: null,
    };

    await expect(
      createDataQualityResultParser().parse(DataStorageType.GOOGLE_BIGQUERY, plan, null)
    ).resolves.toMatchObject({
      status: DataQualityCheckStatus.NOT_APPLICABLE,
      violationCount: 0,
      sql: null,
      description: 'Unsupported complex type',
    });
  });

  it('counts failed rules by severity and sums violations independently', () => {
    const summary = aggregateDataQualitySummary(
      [
        {
          status: DataQualityCheckStatus.FAILED,
          severity: DataQualitySeverity.ERROR,
          violationCount: 7,
        },
        {
          status: DataQualityCheckStatus.FAILED,
          severity: DataQualitySeverity.WARNING,
          violationCount: 3,
        },
        {
          status: DataQualityCheckStatus.FAILED,
          severity: DataQualitySeverity.NOTICE,
          violationCount: 1,
        },
        {
          status: DataQualityCheckStatus.PASSED,
          severity: DataQualitySeverity.ERROR,
          violationCount: 0,
        },
      ],
      5
    );

    expect(summary).toMatchObject({
      state: DataQualitySummaryState.ISSUES,
      enabledChecks: 5,
      totalChecks: 4,
      failedChecks: 3,
      errorFindings: 1,
      warningFindings: 1,
      noticeFindings: 1,
      violationCount: 11,
      highestSeverity: DataQualitySeverity.ERROR,
    });
  });

  it('uses EXECUTION_FAILED for any check error and ALL_DISABLED for no results', () => {
    expect(
      aggregateDataQualitySummary([
        {
          status: DataQualityCheckStatus.ERROR,
          severity: DataQualitySeverity.NOTICE,
          violationCount: 0,
        },
      ]).state
    ).toBe(DataQualitySummaryState.EXECUTION_FAILED);
    expect(aggregateDataQualitySummary([]).state).toBe(DataQualitySummaryState.ALL_DISABLED);
  });

  it('uses PASSED when every check passed or was not applicable', () => {
    expect(
      aggregateDataQualitySummary([
        {
          status: DataQualityCheckStatus.PASSED,
          severity: DataQualitySeverity.ERROR,
          violationCount: 0,
        },
        {
          status: DataQualityCheckStatus.NOT_APPLICABLE,
          severity: DataQualitySeverity.WARNING,
          violationCount: 0,
        },
      ]).state
    ).toBe(DataQualitySummaryState.PASSED);
  });

  it('keeps aggregate violation counts JSON-safe', () => {
    expect(
      aggregateDataQualitySummary([
        {
          status: DataQualityCheckStatus.FAILED,
          severity: DataQualitySeverity.ERROR,
          violationCount: Number.MAX_SAFE_INTEGER,
        },
        {
          status: DataQualityCheckStatus.FAILED,
          severity: DataQualitySeverity.ERROR,
          violationCount: 1,
        },
      ]).violationCount
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});
