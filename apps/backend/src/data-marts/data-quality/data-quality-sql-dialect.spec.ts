import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  DataQualityCanonicalType,
  createDataQualitySqlDialectRegistry,
} from './data-quality-sql-dialect';

describe('DataQualitySqlDialect registry', () => {
  const allStorageTypes = Object.values(DataStorageType);

  it.each(allStorageTypes)('registers a complete dialect for %s', async storageType => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

    expect(dialect.type).toBe(storageType);
    expect(dialect.quoteIdentifier('unsafe`".field')).not.toContain(';');
    expect(dialect.currentDate('Europe/Kyiv')).toContain('Europe/Kyiv');
    const currentTimestamp = dialect.currentTimestamp('Europe/Kyiv');
    if (
      storageType === DataStorageType.GOOGLE_BIGQUERY ||
      storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY
    ) {
      expect(currentTimestamp).toBe('CURRENT_TIMESTAMP()');
    } else {
      expect(currentTimestamp).toContain('Europe/Kyiv');
    }
    expect(dialect.subtractHours('dq_value', 24)).toContain('dq_value');
    expect(dialect.safePercent('null_count', 'row_count')).toContain('100');
    expect(dialect.nullSafeEquals('left_value', 'right_value')).toContain('left_value');
    expect(dialect.nullSafeEquals('left_value', 'right_value')).toContain('right_value');
    expect(dialect.limit('SELECT * FROM dq_violations', 3)).toMatch(/3\s*$/);
  });

  it('uses provider-native identifier quotes and escapes embedded quote characters', async () => {
    const registry = createDataQualitySqlDialectRegistry();

    expect((await registry.resolve(DataStorageType.GOOGLE_BIGQUERY)).quoteIdentifier('a`b')).toBe(
      '`a``b`'
    );
    expect(
      (await registry.resolve(DataStorageType.LEGACY_GOOGLE_BIGQUERY)).quoteIdentifier('a`b')
    ).toBe('`a``b`');
    expect((await registry.resolve(DataStorageType.DATABRICKS)).quoteIdentifier('a`b')).toBe(
      '`a``b`'
    );
    expect((await registry.resolve(DataStorageType.AWS_ATHENA)).quoteIdentifier('a"b')).toBe(
      '"a""b"'
    );
    expect((await registry.resolve(DataStorageType.SNOWFLAKE)).quoteIdentifier('a"b')).toBe(
      '"a""b"'
    );
    expect((await registry.resolve(DataStorageType.AWS_REDSHIFT)).quoteIdentifier('a"b')).toBe(
      '"a""b"'
    );
  });

  it.each(allStorageTypes)('quotes every nested field path segment for %s', async storageType => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);
    const quoted = dialect.quoteIdentifier('payload.customer id');

    expect(quoted).not.toContain('payload.customer id');
    expect(quoted).toMatch(/payload[`"]\.[`"]customer id/);
  });

  it('does not reinterpret Snowflake session-local current timestamps as UTC', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(DataStorageType.SNOWFLAKE);

    expect(dialect.currentTimestamp('Europe/Kyiv')).toBe(
      "CONVERT_TIMEZONE('Europe/Kyiv', CURRENT_TIMESTAMP())"
    );
  });

  it('uses Snowflake resource casing rules for metadata while preserving field-path casing', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(DataStorageType.SNOWFLAKE);

    expect(dialect.quoteIdentifier('payload.CustomerId')).toBe('"payload"."CustomerId"');
    expect(dialect.tableLastModifiedSql('mydb.public.orders')).toContain(
      'FROM mydb."INFORMATION_SCHEMA"."TABLES"'
    );
    expect(dialect.tableLastModifiedSql('mydb.public.orders')).toContain(
      "TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = 'ORDERS'"
    );
    expect(dialect.tableLastModifiedSql('"mydb"."MixedCase"."Orders"')).toContain(
      "TABLE_SCHEMA = 'MixedCase' AND TABLE_NAME = 'Orders'"
    );
    expect(dialect.tableLastModifiedSql('"mydb"."MixedCase"."Orders"')).toContain(
      'FROM "mydb"."INFORMATION_SCHEMA"."TABLES"'
    );
  });

  it('uses executable Redshift null-safe equality without IS NOT DISTINCT FROM', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.AWS_REDSHIFT
    );

    expect(dialect.nullSafeEquals('left_value', 'right_value')).toBe(
      '(left_value = right_value OR (left_value IS NULL AND right_value IS NULL))'
    );
  });

  it('uses session-independent UTC current time for Redshift temporal checks', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.AWS_REDSHIFT
    );

    expect(dialect.currentTimestamp('America/New_York')).toBe(
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'America/New_York', GETDATE())"
    );
    expect(dialect.freshnessCurrent('TIMESTAMP', 'America/New_York')).toBe(
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE())"
    );
    expect(dialect.freshnessCurrent('TIMESTAMPTZ', 'America/New_York')).toBe(
      "CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE())"
    );
    expect(dialect.currentTimestamp('America/New_York')).toContain("CURRENT_SETTING('timezone')");
  });

  it('uses zero-row projection metadata for Redshift type introspection without LIMIT', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(
      DataStorageType.AWS_REDSHIFT
    );
    const sql = dialect.typeIntrospectionSql('SELECT amount FROM source_table', '"amount"');

    expect(sql).toContain('SELECT "amount" AS dq_value FROM dq_source WHERE 1 = 0');
    expect(sql).not.toMatch(/\bLIMIT\b/i);
    expect(sql).not.toContain('pg_typeof');
  });

  it('uses the same Databricks file metadata query for measurement and reproduction', async () => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(DataStorageType.DATABRICKS);
    const metadataSql = dialect.tableLastModifiedSql('catalog.schema.orders');

    expect(metadataSql).toBe(
      'SELECT MAX(_metadata.file_modification_time) AS last_modified_at\n' +
        'FROM `catalog`.`schema`.`orders`'
    );
    expect(dialect.metadataFreshnessReproductionSql(metadataSql!, 24)).toContain(metadataSql);
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

  it.each(allStorageTypes)('classifies scalar and complex values for %s', async storageType => {
    const dialect = await createDataQualitySqlDialectRegistry().resolve(storageType);

    expect(dialect.canonicalizeForGrouping('dq_value', DataQualityCanonicalType.STRING)).toBe(
      'dq_value'
    );
    const complex = dialect.canonicalizeForGrouping('dq_value', DataQualityCanonicalType.COMPLEX);
    if (dialect.supportsComplexCanonicalization) {
      expect(complex).toBeTruthy();
    } else {
      expect(complex).toBeNull();
    }
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
});
