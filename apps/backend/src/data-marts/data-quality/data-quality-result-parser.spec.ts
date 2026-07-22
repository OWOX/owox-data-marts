import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataQualityCanonicalType } from './data-quality-sql-dialect';
import { DataQualityCompiledCheck, DataQualityQueryPurpose } from './data-quality-check-compiler';
import {
  DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS,
  DataQualityQueryExecution,
  aggregateDataQualitySummary,
  createDataQualityResultParser,
} from './data-quality-result-parser';

describe('DataQualityResultParser', () => {
  const executablePlan = (
    overrides: Partial<Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }>> = {}
  ): Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }> => ({
    kind: 'EXECUTABLE',
    category: DataQualityCategory.NEGATIVE_VALUES,
    ruleKey: 'negative_values:field:amount',
    severity: DataQualitySeverity.WARNING,
    strategy: 'COUNT',
    queries: [
      { purpose: DataQualityQueryPurpose.MEASUREMENT, sql: 'SELECT violation_count' },
      { purpose: DataQualityQueryPurpose.EXAMPLES, sql: 'SELECT examples LIMIT 3' },
    ],
    reproductionSql: 'SELECT * FROM violations',
    ...overrides,
  });

  const execution = (
    purpose: DataQualityQueryPurpose,
    rows: Record<string, unknown>[],
    sql = `executed ${purpose}`
  ): DataQualityQueryExecution => ({ purpose, sql, rows });

  it('parses violation counts, keeps only executed SQL, and caps examples at three', async () => {
    const parser = createDataQualityResultParser();
    const result = await parser.parse(DataStorageType.GOOGLE_BIGQUERY, executablePlan(), [
      execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: '4', is_applicable: 1 }]),
      execution(DataQualityQueryPurpose.EXAMPLES, [
        { dq_value: -1, dq_pk_0: 'a' },
        { dq_value: -2, dq_pk_0: 'b' },
        { dq_value: -3, dq_pk_0: 'c' },
        { dq_value: -4, dq_pk_0: 'd' },
      ]),
    ]);

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.FAILED,
      violationCount: 4,
      reproductionSql: 'SELECT * FROM violations',
      executedSql: [
        `executed ${DataQualityQueryPurpose.MEASUREMENT}`,
        `executed ${DataQualityQueryPurpose.EXAMPLES}`,
      ],
    });
    expect(result.examples).toHaveLength(3);
    expect(result.examples[0]).toEqual({ values: { dq_value: -1, dq_pk_0: 'a' } });
  });

  it('maps dynamic empty-source applicability to NOT_APPLICABLE', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.AWS_ATHENA,
      executablePlan({ category: DataQualityCategory.NULL_RATE }),
      [execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: 0, is_applicable: 0 }])]
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.NOT_APPLICABLE,
      violationCount: 0,
      examples: [],
    });
  });

  it('reads unquoted Snowflake control aliases case-insensitively without changing example keys', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.SNOWFLAKE,
      executablePlan(),
      [
        execution(DataQualityQueryPurpose.MEASUREMENT, [{ VIOLATION_COUNT: 1, IS_APPLICABLE: 1 }]),
        execution(DataQualityQueryPurpose.EXAMPLES, [{ DQ_VALUE: -5, DQ_PK_0: 'id-1' }]),
      ]
    );

    expect(result.status).toBe(DataQualityCheckStatus.FAILED);
    expect(result.examples).toHaveLength(1);
    expect(result.examples[0]).toEqual({ values: { DQ_VALUE: -5, DQ_PK_0: 'id-1' } });
  });

  it('maps an execution failure without discarding SQL already executed', async () => {
    const executions: DataQualityQueryExecution[] = [
      execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: 2 }], 'first sql'),
      {
        purpose: DataQualityQueryPurpose.EXAMPLES,
        sql: 'second sql',
        error: { code: 'WAREHOUSE_TIMEOUT', message: 'query timed out', details: { retry: true } },
      },
    ];

    const result = await createDataQualityResultParser().parse(
      DataStorageType.AWS_REDSHIFT,
      executablePlan(),
      executions
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.ERROR,
      violationCount: 0,
      executedSql: ['first sql', 'second sql'],
      error: { code: 'WAREHOUSE_TIMEOUT', message: 'query timed out', details: { retry: true } },
    });
  });

  it.each([
    ['INT', DataQualityCheckStatus.PASSED, 0],
    ['VARCHAR(255)', DataQualityCheckStatus.FAILED, 1],
    ['UNKNOWN_WAREHOUSE_TYPE', DataQualityCheckStatus.FAILED, 1],
    [null, DataQualityCheckStatus.FAILED, 1],
  ])(
    'compares Snowflake runtime type %p to saved Output Schema aliases',
    async (actualType, status, violationCount) => {
      const plan = executablePlan({
        category: DataQualityCategory.TYPE_MISMATCH,
        strategy: 'TYPE_MISMATCH',
        expectedType: DataQualityCanonicalType.INTEGER,
        expectedNativeType: 'INTEGER',
        queries: [
          { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'introspect empty source' },
          { purpose: DataQualityQueryPurpose.EXAMPLES, sql: 'sample non-null LIMIT 3' },
        ],
      });
      const result = await createDataQualityResultParser().parse(DataStorageType.SNOWFLAKE, plan, [
        execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [{ actual_type: actualType }]),
        execution(DataQualityQueryPurpose.EXAMPLES, [{ dq_value: 7 }]),
      ]);

      expect(result).toMatchObject({ status, violationCount });
      expect(result.examples).toHaveLength(status === DataQualityCheckStatus.FAILED ? 1 : 0);
    }
  );

  it('matches Snowflake NUMBER(38,0) runtime metadata to saved NUMERIC Output Schema', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.SNOWFLAKE,
      executablePlan({
        category: DataQualityCategory.TYPE_MISMATCH,
        strategy: 'TYPE_MISMATCH',
        expectedType: DataQualityCanonicalType.DECIMAL,
        expectedNativeType: 'NUMERIC',
        queries: [
          { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'SYSTEM$TYPEOF query' },
        ],
      }),
      [
        execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [
          { ACTUAL_TYPE: 'NUMBER(38,0)[SB8]' },
        ]),
      ]
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.PASSED,
      violationCount: 0,
    });
  });

  it.each([
    ['NUMBER(38,0)[SB8]', DataQualityCheckStatus.PASSED],
    ['NUMBER(38,2)[SB8]', DataQualityCheckStatus.FAILED],
  ])(
    'matches Snowflake runtime %s against saved INTEGER without losing scale strictness',
    async (actualType, status) => {
      const result = await createDataQualityResultParser().parse(
        DataStorageType.SNOWFLAKE,
        executablePlan({
          category: DataQualityCategory.TYPE_MISMATCH,
          strategy: 'TYPE_MISMATCH',
          expectedType: DataQualityCanonicalType.INTEGER,
          expectedNativeType: 'INTEGER',
          queries: [
            { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'SYSTEM$TYPEOF query' },
          ],
        }),
        [execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [{ ACTUAL_TYPE: actualType }])]
      );

      expect(result.status).toBe(status);
    }
  );

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'BIGNUMERIC', 'NUMERIC', DataQualityCanonicalType.DECIMAL],
    [
      DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      'BIGNUMERIC',
      'NUMERIC',
      DataQualityCanonicalType.DECIMAL,
    ],
    [DataStorageType.AWS_ATHENA, 'BIGINT', 'SMALLINT', DataQualityCanonicalType.INTEGER],
    [DataStorageType.AWS_REDSHIFT, 'int8', 'SMALLINT', DataQualityCanonicalType.INTEGER],
    [DataStorageType.DATABRICKS, 'BIGINT', 'SMALLINT', DataQualityCanonicalType.INTEGER],
  ])(
    'fails strict empty-table type comparison for %s actual %s versus saved %s',
    async (storageType, actualType, expectedNativeType, expectedType) => {
      const result = await createDataQualityResultParser().parse(
        storageType,
        executablePlan({
          category: DataQualityCategory.TYPE_MISMATCH,
          strategy: 'TYPE_MISMATCH',
          expectedType,
          expectedNativeType,
          queries: [
            { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'typed empty projection' },
          ],
        }),
        [execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [{ actual_type: actualType }])]
      );

      expect(result).toMatchObject({
        status: DataQualityCheckStatus.FAILED,
        violationCount: 1,
      });
    }
  );

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'INT64', 'INTEGER', DataQualityCanonicalType.INTEGER],
    [DataStorageType.AWS_ATHENA, 'INT', 'INTEGER', DataQualityCanonicalType.INTEGER],
    [DataStorageType.AWS_ATHENA, 'VARCHAR', 'STRING', DataQualityCanonicalType.STRING],
    [DataStorageType.AWS_ATHENA, 'REAL', 'FLOAT', DataQualityCanonicalType.FLOAT],
    [DataStorageType.AWS_ATHENA, 'VARBINARY', 'BINARY', DataQualityCanonicalType.BYTES],
    [DataStorageType.AWS_ATHENA, 'ROW(id BIGINT)', 'STRUCT', DataQualityCanonicalType.COMPLEX],
    [DataStorageType.AWS_REDSHIFT, 'int8', 'BIGINT', DataQualityCanonicalType.INTEGER],
    [DataStorageType.AWS_REDSHIFT, 'VARCHAR', 'TEXT', DataQualityCanonicalType.STRING],
    [DataStorageType.DATABRICKS, 'INTEGER', 'INT', DataQualityCanonicalType.INTEGER],
    [
      DataStorageType.DATABRICKS,
      'interval hour to second',
      'INTERVAL',
      DataQualityCanonicalType.INTERVAL,
    ],
    [DataStorageType.SNOWFLAKE, 'NUMBER(38,0)[SB8]', 'INTEGER', DataQualityCanonicalType.INTEGER],
    [DataStorageType.SNOWFLAKE, 'TIMESTAMP_TZ', 'TIMESTAMP', DataQualityCanonicalType.TIMESTAMP],
  ])(
    'accepts provider alias %s actual %s for saved %s',
    async (storageType, actualType, expectedNativeType, expectedType) => {
      const result = await createDataQualityResultParser().parse(
        storageType,
        executablePlan({
          category: DataQualityCategory.TYPE_MISMATCH,
          strategy: 'TYPE_MISMATCH',
          expectedType,
          expectedNativeType,
          queries: [
            { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'typed empty projection' },
          ],
        }),
        [execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [{ actual_type: actualType }])]
      );

      expect(result.status).toBe(DataQualityCheckStatus.PASSED);
    }
  );

  it('matches BigQuery REPEATED mode to ARRAY runtime metadata and detects scalar/array drift', async () => {
    const repeatedPlan = {
      ...executablePlan({
        category: DataQualityCategory.TYPE_MISMATCH,
        strategy: 'TYPE_MISMATCH',
        expectedType: DataQualityCanonicalType.INTEGER,
        expectedNativeType: 'INTEGER',
        queries: [
          { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'typed empty projection' },
        ],
      }),
      expectedMode: 'REPEATED',
    } as Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }> & {
      expectedMode: string;
    };
    const parser = createDataQualityResultParser();

    await expect(
      parser.parse(DataStorageType.GOOGLE_BIGQUERY, repeatedPlan, [
        execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [{ actual_type: 'ARRAY<INT64>' }]),
      ])
    ).resolves.toMatchObject({ status: DataQualityCheckStatus.PASSED });
    await expect(
      parser.parse(DataStorageType.GOOGLE_BIGQUERY, repeatedPlan, [
        execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [{ actual_type: 'INT64' }]),
      ])
    ).resolves.toMatchObject({ status: DataQualityCheckStatus.FAILED });
  });

  it('treats BigQuery RECORD and STRUCT as aliases without hiding array shape', async () => {
    const recordPlan = executablePlan({
      category: DataQualityCategory.TYPE_MISMATCH,
      strategy: 'TYPE_MISMATCH',
      expectedType: DataQualityCanonicalType.COMPLEX,
      expectedNativeType: 'RECORD',
      queries: [
        { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'typed empty projection' },
      ],
    });
    const parser = createDataQualityResultParser();

    await expect(
      parser.parse(DataStorageType.GOOGLE_BIGQUERY, recordPlan, [
        execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [
          { actual_type: 'STRUCT<id INT64>' },
        ]),
      ])
    ).resolves.toMatchObject({ status: DataQualityCheckStatus.PASSED });
    await expect(
      parser.parse(DataStorageType.GOOGLE_BIGQUERY, recordPlan, [
        execution(DataQualityQueryPurpose.TYPE_INTROSPECTION, [
          { actual_type: 'ARRAY<STRUCT<id INT64>>' },
        ]),
      ])
    ).resolves.toMatchObject({ status: DataQualityCheckStatus.FAILED });
  });

  it('maps type introspection failures to ERROR rather than mismatch findings', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      executablePlan({
        category: DataQualityCategory.TYPE_MISMATCH,
        strategy: 'TYPE_MISMATCH',
        expectedType: DataQualityCanonicalType.INTEGER,
        expectedNativeType: 'BIGINT',
        queries: [{ purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'typeof query' }],
      }),
      [
        {
          purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION,
          sql: 'typeof query',
          error: { code: null, message: 'introspection denied', details: null },
        },
      ]
    );

    expect(result.status).toBe(DataQualityCheckStatus.ERROR);
  });

  it('reads Redshift actual type from zero-row warehouse column metadata', async () => {
    const result = await createDataQualityResultParser().parse(
      DataStorageType.AWS_REDSHIFT,
      executablePlan({
        category: DataQualityCategory.TYPE_MISMATCH,
        strategy: 'TYPE_MISMATCH',
        expectedType: DataQualityCanonicalType.INTEGER,
        expectedNativeType: 'BIGINT',
        queries: [
          { purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION, sql: 'zero row projection' },
        ],
      }),
      [
        {
          purpose: DataQualityQueryPurpose.TYPE_INTROSPECTION,
          sql: 'zero row projection',
          rows: [],
          columnMetadata: [{ name: 'dq_value', label: 'dq_value', typeName: 'int8' }],
        },
      ]
    );

    expect(result).toMatchObject({
      status: DataQualityCheckStatus.PASSED,
      violationCount: 0,
    });
  });

  it('safely serializes BigInt, Date, undefined, and circular example values', async () => {
    const circular: Record<string, unknown> = { id: 1n };
    circular.self = circular;
    const result = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      executablePlan(),
      [
        execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: 1 }]),
        execution(DataQualityQueryPurpose.EXAMPLES, [
          {
            bigint: 9n,
            date: new Date('2026-07-15T00:00:00.000Z'),
            missing: undefined,
            circular,
          },
        ]),
      ]
    );

    expect(result.examples[0]).toEqual({
      values: {
        bigint: '9',
        date: '2026-07-15T00:00:00.000Z',
        missing: null,
        circular: { id: '1', self: '[Circular]' },
      },
    });
  });

  it('bounds deeply nested and high-cardinality example values with explicit markers', async () => {
    let nested: Record<string, unknown> = { leaf: 'value' };
    for (let depth = 0; depth < DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxDepth + 3; depth++) {
      nested = { child: nested };
    }
    const result = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      executablePlan(),
      [
        execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: 1 }]),
        execution(DataQualityQueryPurpose.EXAMPLES, [
          {
            nested,
            items: Array.from(
              { length: DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxCollectionItems + 10 },
              (_, index) => index
            ),
          },
        ]),
      ]
    );

    const serialized = JSON.stringify(result.examples[0].values);
    expect(serialized).toContain('[Truncated: max depth');
    expect(serialized).toContain('[Truncated 10 items]');
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(
      DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxTotalBytes
    );
  });

  it('truncates UTF-8 strings and binary values deterministically without invalid text', async () => {
    const unicode = '🙂'.repeat(DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxStringBytes);
    const binary = Buffer.alloc(
      DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxBinaryBytes + 10,
      0xab
    );
    const executions = [
      execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: 1 }]),
      execution(DataQualityQueryPurpose.EXAMPLES, [{ unicode, binary }]),
    ];

    const first = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      executablePlan(),
      executions
    );
    const second = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      executablePlan(),
      executions
    );
    const serialized = JSON.stringify(first.examples[0].values);

    expect(serialized).toBe(JSON.stringify(second.examples[0].values));
    expect(serialized).toContain('[Truncated');
    expect(serialized).toContain('[Binary base64:');
    expect(serialized).not.toContain('�');
  });

  it('canonicalizes object keys and caps the total serialized row size', async () => {
    const fields = Array.from(
      { length: 50 },
      (_, index) =>
        [
          `field_${String(index).padStart(2, '0')}`,
          'x'.repeat(DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxStringBytes),
        ] as const
    );
    const ascending = Object.fromEntries(fields);
    const descending = Object.fromEntries([...fields].reverse());
    const parse = (row: Record<string, unknown>) =>
      createDataQualityResultParser().parse(DataStorageType.DATABRICKS, executablePlan(), [
        execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: 1 }]),
        execution(DataQualityQueryPurpose.EXAMPLES, [row]),
      ]);

    const first = await parse(ascending);
    const second = await parse(descending);
    const serialized = JSON.stringify(first.examples[0].values);

    expect(serialized).toBe(JSON.stringify(second.examples[0].values));
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(
      DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxTotalBytes
    );
    expect(serialized).toContain('[Truncated: row exceeded');
  });

  it('replaces rows whose properties cannot be enumerated', async () => {
    const hostileRow = new Proxy<Record<string, unknown>>(
      {},
      {
        ownKeys: () => {
          throw new Error('provider row cannot be enumerated');
        },
      }
    );
    const result = await createDataQualityResultParser().parse(
      DataStorageType.DATABRICKS,
      executablePlan(),
      [
        execution(DataQualityQueryPurpose.MEASUREMENT, [{ violation_count: 1 }]),
        execution(DataQualityQueryPurpose.EXAMPLES, [hostileRow]),
      ]
    );

    expect(result.examples[0]).toEqual({ values: { value: '[Unserializable object]' } });
  });

  it('returns a persisted NOT_APPLICABLE result for a compile-time unsupported check', async () => {
    const plan: DataQualityCompiledCheck = {
      kind: 'NOT_APPLICABLE',
      category: DataQualityCategory.PK_UNIQUENESS,
      ruleKey: 'pk_uniqueness:data_mart',
      severity: DataQualitySeverity.ERROR,
      reason: 'No primary key',
      queries: [],
      reproductionSql: null,
    };

    await expect(
      createDataQualityResultParser().parse(DataStorageType.GOOGLE_BIGQUERY, plan, [])
    ).resolves.toMatchObject({
      status: DataQualityCheckStatus.NOT_APPLICABLE,
      description: 'No primary key',
      executedSql: [],
      reproductionSql: null,
    });
  });
});

describe('aggregateDataQualitySummary', () => {
  const result = (
    severity: DataQualitySeverity,
    status: DataQualityCheckStatus,
    violationCount = 0
  ) => ({
    category: DataQualityCategory.EMPTY_TABLE,
    ruleKey: `rule-${severity}-${status}`,
    severity,
    status,
    violationCount,
    description: '',
    examples: [],
    executedSql: [],
    reproductionSql: null,
    error: null,
  });

  it('counts failed rules by all three severities and sums violations independently', () => {
    const summary = aggregateDataQualitySummary(
      [
        result(DataQualitySeverity.NOTICE, DataQualityCheckStatus.FAILED, 4),
        result(DataQualitySeverity.WARNING, DataQualityCheckStatus.FAILED, 2),
        result(DataQualitySeverity.ERROR, DataQualityCheckStatus.FAILED, 1),
        result(DataQualitySeverity.ERROR, DataQualityCheckStatus.PASSED),
        result(DataQualitySeverity.WARNING, DataQualityCheckStatus.NOT_APPLICABLE),
      ],
      7
    );

    expect(summary).toEqual({
      state: DataQualitySummaryState.ISSUES,
      totalChecks: 5,
      enabledChecks: 7,
      passedChecks: 1,
      failedChecks: 3,
      notApplicableChecks: 1,
      errorChecks: 0,
      noticeFindings: 1,
      warningFindings: 1,
      errorFindings: 1,
      violationCount: 7,
      highestSeverity: DataQualitySeverity.ERROR,
    });
  });

  it('uses EXECUTION_FAILED for any check error and ALL_DISABLED for no results', () => {
    expect(
      aggregateDataQualitySummary([
        result(DataQualitySeverity.WARNING, DataQualityCheckStatus.ERROR),
      ]).state
    ).toBe(DataQualitySummaryState.EXECUTION_FAILED);
    expect(aggregateDataQualitySummary([]).state).toBe(DataQualitySummaryState.ALL_DISABLED);
  });

  it('uses PASSED when every executable check passes or is not applicable', () => {
    expect(
      aggregateDataQualitySummary([
        result(DataQualitySeverity.WARNING, DataQualityCheckStatus.PASSED),
        result(DataQualitySeverity.ERROR, DataQualityCheckStatus.NOT_APPLICABLE),
      ])
    ).toMatchObject({ state: DataQualitySummaryState.PASSED, highestSeverity: null });
  });

  it('keeps the aggregate violation count JSON-safe when individual BIGINT counts add up', () => {
    const summary = aggregateDataQualitySummary([
      result(DataQualitySeverity.ERROR, DataQualityCheckStatus.FAILED, Number.MAX_SAFE_INTEGER),
      result(DataQualitySeverity.WARNING, DataQualityCheckStatus.FAILED, 1),
    ]);

    expect(summary.violationCount).toBe(Number.MAX_SAFE_INTEGER);
  });
});
