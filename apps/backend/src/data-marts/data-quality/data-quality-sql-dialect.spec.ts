import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { MAX_DATA_QUALITY_THRESHOLD_HOURS } from '../dto/schemas/data-quality/data-quality-config.schema';
import {
  DataQualityCanonicalType,
  createDataQualitySqlDialectRegistry,
} from './data-quality-sql-dialect';

function normalizeSql(value: string | null): string | null {
  return value?.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim() ?? null;
}

describe('DataQualitySqlDialect registry', () => {
  const allStorageTypes = Object.values(DataStorageType);

  it.each(allStorageTypes)('registers a complete dialect for %s', async storageType => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

    expect(dialect.type).toBe(storageType);
    expect(dialect.quoteIdentifierPath(['unsafe`".field'])).not.toContain(';');
    expect(dialect.subtractHours('dq_value', 24)).toContain('dq_value');
    expect(dialect.safePercent('null_count', 'row_count')).toContain('100');
    expect(dialect.nullSafeEquals('left_value', 'right_value')).toContain('left_value');
    expect(dialect.nullSafeEquals('left_value', 'right_value')).toContain('right_value');
    expect(dialect.limit('SELECT * FROM dq_violations', 3)).toMatch(/3\s*$/);
  });

  it('uses provider-native identifier quotes and escapes embedded quote characters', async () => {
    const registry = createDataQualitySqlDialectRegistry();

    expect(
      (await registry.resolve(DataStorageType.GOOGLE_BIGQUERY)).quoteIdentifierPath(['a`b'])
    ).toBe('`a\\`b`');
    expect(
      (await registry.resolve(DataStorageType.LEGACY_GOOGLE_BIGQUERY)).quoteIdentifierPath(['a`b'])
    ).toBe('`a\\`b`');
    expect((await registry.resolve(DataStorageType.DATABRICKS)).quoteIdentifierPath(['a`b'])).toBe(
      '`a``b`'
    );
    expect((await registry.resolve(DataStorageType.AWS_ATHENA)).quoteIdentifierPath(['a"b'])).toBe(
      '"a""b"'
    );
    expect((await registry.resolve(DataStorageType.SNOWFLAKE)).quoteIdentifierPath(['a"b'])).toBe(
      '"a""b"'
    );
    expect(
      (await registry.resolve(DataStorageType.AWS_REDSHIFT)).quoteIdentifierPath(['a"b'])
    ).toBe('"a""b"');
  });

  it.each([DataStorageType.GOOGLE_BIGQUERY, DataStorageType.LEGACY_GOOGLE_BIGQUERY])(
    'backslash-escapes BigQuery identifier backslashes for %s',
    async storageType => {
      const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

      expect(dialect.quoteIdentifierPath(['amount\\'])).toBe('`amount\\\\`');
      expect(dialect.quoteIdentifierPath(['path\\segment`value'])).toBe(
        '`path\\\\segment\\`value`'
      );
    }
  );

  it.each(allStorageTypes)(
    'keeps literal dotted and segmented field paths distinct for %s',
    async storageType => {
      const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);
      const literal = dialect.quoteIdentifierPath(['payload.customer id']);
      const segmented = dialect.quoteIdentifierPath(['payload', 'customer id']);

      expect(literal).toMatch(/^[`"]payload\.customer id[`"]$/);
      expect(segmented).toMatch(/^[`"]payload[`"]\.[`"]customer id[`"]$/);
      expect(literal).not.toBe(segmented);
    }
  );

  it.each(allStorageTypes)('quotes every nested field path segment for %s', async storageType => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);
    const quoted = dialect.quoteIdentifierPath(['payload', 'customer id']);

    expect(quoted).not.toContain('payload.customer id');
    expect(quoted).toMatch(/payload[`"]\.[`"]customer id/);
  });

  it('preserves Snowflake one-character, dotted literal, and segmented field paths', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(DataStorageType.SNOWFLAKE);

    expect(dialect.quoteIdentifierPath(['x'])).toBe('"x"');
    expect(dialect.quoteIdentifierPath(['payload.CustomerId'])).toBe('"payload.CustomerId"');
    expect(dialect.quoteIdentifierPath(['payload', 'CustomerId'])).toBe('"payload"."CustomerId"');
  });

  it('uses executable Redshift null-safe equality without IS NOT DISTINCT FROM', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.AWS_REDSHIFT
    );

    expect(normalizeSql(dialect.nullSafeEquals('left_value', 'right_value'))).toBe(
      '(left_value = right_value OR (left_value IS NULL AND right_value IS NULL))'
    );
  });

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'TIMESTAMP', 'CURRENT_TIMESTAMP()', 'dq_value'],
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY, 'TIMESTAMP', 'CURRENT_TIMESTAMP()', 'dq_value'],
    [DataStorageType.AWS_ATHENA, 'TIMESTAMP WITH TIME ZONE', 'current_timestamp', 'dq_value'],
    [
      DataStorageType.AWS_REDSHIFT,
      'TIMESTAMPTZ',
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE())",
      "TIMEZONE('UTC', dq_value)",
    ],
    [DataStorageType.DATABRICKS, 'TIMESTAMP', 'current_timestamp()', 'dq_value'],
  ])(
    'provides instant-only freshness expressions for %s %s',
    async (storageType, nativeType, expectedCurrent, expectedValue) => {
      const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

      expect(normalizeSql(dialect.freshnessCurrent(nativeType))).toBe(expectedCurrent);
      expect(normalizeSql(dialect.freshnessTimestamp('dq_value', nativeType))).toBe(expectedValue);
    }
  );

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'DATE'],
    [DataStorageType.AWS_ATHENA, 'TIMESTAMP'],
    [DataStorageType.SNOWFLAKE, 'TIMESTAMP_TZ'],
    [DataStorageType.AWS_REDSHIFT, 'TIMESTAMP'],
    [DataStorageType.DATABRICKS, 'TIMESTAMP_NTZ'],
  ])('does not provide freshness expressions for unsupported %s %s', async (storageType, type) => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

    expect(dialect.freshnessCurrent(type)).toBeNull();
    expect(dialect.freshnessTimestamp('dq_value', type)).toBeNull();
  });

  it('delegates Redshift type introspection to unified result metadata', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.AWS_REDSHIFT
    );
    expect(dialect.typeIntrospectionExpression('"amount"')).toBeNull();
  });

  it.each([
    [DataStorageType.GOOGLE_BIGQUERY, 'INT64', DataQualityCanonicalType.INTEGER],
    [DataStorageType.LEGACY_GOOGLE_BIGQUERY, 'BOOL', DataQualityCanonicalType.BOOLEAN],
    [DataStorageType.AWS_ATHENA, 'decimal(18, 2)', DataQualityCanonicalType.DECIMAL],
    [DataStorageType.SNOWFLAKE, 'timestamp_ntz', DataQualityCanonicalType.TIMESTAMP],
    [DataStorageType.AWS_REDSHIFT, 'character varying(255)', DataQualityCanonicalType.STRING],
    [DataStorageType.DATABRICKS, 'long', DataQualityCanonicalType.INTEGER],
  ])('normalizes %s alias %s to %s', async (storageType, nativeType, expected) => {
    expect(
      (await createDataQualitySqlDialectRegistry().resolve(storageType)).normalizeType(nativeType)
    ).toBe(expected);
  });

  it.each([DataStorageType.AWS_ATHENA, DataStorageType.AWS_REDSHIFT, DataStorageType.DATABRICKS])(
    'does not match two unknown storage types for %s',
    async storageType => {
      const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

      expect(dialect.matchesExpectedType('UNKNOWN_ACTUAL', 'UNKNOWN_EXPECTED')).toBe(false);
    }
  );

  it.each(allStorageTypes)('classifies scalar and complex values for %s', async storageType => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

    expect(dialect.canonicalizeForGrouping('dq_value', DataQualityCanonicalType.STRING)).toBe(
      'dq_value'
    );
    const complex = dialect.canonicalizeForGrouping('dq_value', DataQualityCanonicalType.COMPLEX);
    expect(complex).toBeTruthy();
  });

  it.each(allStorageTypes)(
    'never emits a raw GEOGRAPHY/GEOMETRY grouping expression for %s',
    async storageType => {
      const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

      expect(
        dialect.canonicalizeForGrouping('dq_spatial_value', DataQualityCanonicalType.GEOGRAPHY)
      ).toBeNull();
    }
  );

  it('tags BigQuery complex values so SQL NULL and JSON null are distinct groups', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.GOOGLE_BIGQUERY
    );
    const expression = dialect.canonicalizeForGrouping(
      '`payload`',
      DataQualityCanonicalType.COMPLEX
    );

    expect(expression).toContain('CASE WHEN `payload` IS NULL');
    expect(expression).toContain('TO_JSON_STRING(`payload`)');
    expect(expression).toContain('sql:null');
    expect(expression).toContain('json:');
  });

  it.each(allStorageTypes)('rejects interval conversion overflow for %s', async storageType => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

    expect(() => dialect.subtractHours('dq_value', 1e308)).toThrow(/safe|finite|hours/i);
  });

  it('uses a Redshift-safe interval for a 30-day freshness threshold', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.AWS_REDSHIFT
    );

    expect(normalizeSql(dialect.subtractHours('dq_value', 24 * 30))).toBe(
      'DATEADD(day, -30, dq_value)'
    );
  });

  it('keeps every Redshift DATEADD interval within INT4 at the maximum threshold', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.AWS_REDSHIFT
    );
    const sql = dialect.subtractHours('dq_value', MAX_DATA_QUALITY_THRESHOLD_HOURS);
    const intervals = Array.from(sql.matchAll(/DATEADD\(\s*\w+,\s*(-?\d+)/g), match =>
      Number(match[1])
    );

    expect(intervals).toHaveLength(2);
    expect(intervals.every(value => Number.isInteger(value))).toBe(true);
    expect(intervals.every(value => value >= -2147483648 && value <= 2147483647)).toBe(true);
    expect(normalizeSql(sql)).toBe('DATEADD(second, -28800, DATEADD(day, -104249991, dq_value))');
  });
});
