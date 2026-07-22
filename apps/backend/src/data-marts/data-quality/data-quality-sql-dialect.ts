import { Injectable } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { escapeAthenaIdentifier } from '../data-storage-types/athena/utils/athena-identifier.utils';
import { escapeBigQueryIdentifier } from '../data-storage-types/bigquery/utils/bigquery-identifier.utils';
import { escapeDatabricksIdentifier } from '../data-storage-types/databricks/utils/databricks-identifier.utils';
import { escapeRedshiftIdentifier } from '../data-storage-types/redshift/utils/redshift-identifier.utils';
import { escapeSnowflakeIdentifier } from '../data-storage-types/snowflake/utils/snowflake-identifier.utils';
import { parseAthenaFieldType } from '../data-storage-types/athena/enums/athena-field-type.enum';
import { parseBigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { parseSnowflakeFieldType } from '../data-storage-types/snowflake/enums/snowflake-field-type.enum';

export enum DataQualityCanonicalType {
  INTEGER = 'integer',
  FLOAT = 'float',
  DECIMAL = 'decimal',
  STRING = 'string',
  BYTES = 'bytes',
  BOOLEAN = 'boolean',
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  TIMESTAMP = 'timestamp',
  GEOGRAPHY = 'geography',
  JSON = 'json',
  COMPLEX = 'complex',
  INTERVAL = 'interval',
}

export interface DataQualitySqlDialect {
  readonly type: DataStorageType;
  readonly supportsComplexCanonicalization: boolean;
  quoteIdentifier(identifier: string): string;
  currentDate(timezone: string): string;
  currentTimestamp(timezone: string): string;
  currentTemporal(nativeType: string, timezone: string): string | null;
  freshnessCurrent(nativeType: string, timezone: string): string | null;
  subtractHours(expression: string, hours: number): string;
  safePercent(numerator: string, denominator: string): string;
  nullSafeEquals(left: string, right: string): string;
  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null;
  normalizeType(nativeType: string): DataQualityCanonicalType | null;
  matchesExpectedType(
    actualNativeType: string,
    expectedNativeType: string,
    expectedMode?: string
  ): boolean;
  freshnessTimestamp(expression: string, nativeType: string, timezone: string): string | null;
  typeIntrospectionSql(sourceSql: string, fieldExpression: string): string;
  limit(sql: string, count: number): string;
}

abstract class BaseDataQualitySqlDialect implements DataQualitySqlDialect {
  abstract readonly type: DataStorageType;
  abstract readonly supportsComplexCanonicalization: boolean;
  protected abstract readonly identifierEscaper: (identifier: string) => string;

  quoteIdentifier(identifier: string): string {
    return this.identifierEscaper(identifier);
  }

  abstract currentDate(timezone: string): string;
  abstract currentTimestamp(timezone: string): string;
  abstract subtractHours(expression: string, hours: number): string;
  abstract safePercent(numerator: string, denominator: string): string;
  abstract canonicalizeForGrouping(
    expression: string,
    type: DataQualityCanonicalType
  ): string | null;
  abstract normalizeType(nativeType: string): DataQualityCanonicalType | null;
  abstract freshnessTimestamp(
    expression: string,
    nativeType: string,
    timezone: string
  ): string | null;
  abstract typeIntrospectionSql(sourceSql: string, fieldExpression: string): string;

  nullSafeEquals(left: string, right: string): string {
    return `${left} IS NOT DISTINCT FROM ${right}`;
  }

  currentTemporal(nativeType: string, timezone: string): string | null {
    const type = this.normalizeType(nativeType);
    if (type === DataQualityCanonicalType.DATE) return this.currentDate(timezone);
    if (type === DataQualityCanonicalType.TIMESTAMP) return this.currentTimestamp(timezone);
    return null;
  }

  freshnessCurrent(nativeType: string, timezone: string): string | null {
    const type = this.normalizeType(nativeType);
    if (type === DataQualityCanonicalType.DATE || type === DataQualityCanonicalType.TIMESTAMP) {
      return this.currentTimestamp(timezone);
    }
    return null;
  }

  matchesExpectedType(
    actualNativeType: string,
    expectedNativeType: string,
    expectedMode?: string
  ): boolean {
    return matchesProviderStorageType(
      this.type,
      actualNativeType,
      expectedNativeType,
      expectedMode
    );
  }

  limit(sql: string, count: number): string {
    assertNonNegativeFinite(count, 'limit');
    return `${stripTrailingSemicolon(sql)}\nLIMIT ${Math.floor(count)}`;
  }

  protected scalarOrComplex(
    expression: string,
    type: DataQualityCanonicalType,
    complexExpression: (value: string) => string
  ): string | null {
    if (!isDataQualityGroupingTypeSupported(type, this.supportsComplexCanonicalization)) {
      return null;
    }
    if (type === DataQualityCanonicalType.COMPLEX || type === DataQualityCanonicalType.JSON) {
      return complexExpression(expression);
    }
    return expression;
  }
}

@Injectable()
export class BigQueryDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;
  readonly supportsComplexCanonicalization = true;
  protected readonly identifierEscaper = escapeBigQueryIdentifier;

  currentDate(timezone: string): string {
    return `CURRENT_DATE(${quoteSqlString(timezone)})`;
  }

  currentTimestamp(_timezone: string): string {
    return 'CURRENT_TIMESTAMP()';
  }

  subtractHours(expression: string, hours: number): string {
    return `TIMESTAMP_SUB(${expression}, INTERVAL ${hoursToMilliseconds(hours)} MILLISECOND)`;
  }

  safePercent(numerator: string, denominator: string): string {
    return `SAFE_DIVIDE(${numerator}, ${denominator}) * 100`;
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(
      expression,
      type,
      value =>
        `CASE WHEN ${value} IS NULL THEN 'sql:null' ELSE CONCAT('json:', TO_JSON_STRING(${value})) END`
    );
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeBigQueryType(nativeType);
  }

  freshnessTimestamp(expression: string, nativeType: string, timezone: string): string | null {
    const type = this.normalizeType(nativeType);
    if (type === DataQualityCanonicalType.TIMESTAMP) return expression;
    if (type === DataQualityCanonicalType.DATE) {
      return `TIMESTAMP(${expression}, ${quoteSqlString(timezone)})`;
    }
    return null;
  }

  typeIntrospectionSql(sourceSql: string, fieldExpression: string): string {
    return `${sourceCte(sourceSql)}\nSELECT TYPEOF((SELECT ANY_VALUE(${fieldExpression}) FROM dq_source)) AS actual_type`;
  }
}

@Injectable()
export class LegacyBigQueryDataQualitySqlDialect extends BigQueryDataQualitySqlDialect {
  override readonly type: DataStorageType = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
}

@Injectable()
export class AthenaDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.AWS_ATHENA;
  readonly supportsComplexCanonicalization = true;
  protected readonly identifierEscaper = escapeAthenaIdentifier;

  currentDate(timezone: string): string {
    return `CAST(current_timestamp AT TIME ZONE ${quoteSqlString(timezone)} AS DATE)`;
  }

  currentTimestamp(timezone: string): string {
    return `current_timestamp AT TIME ZONE ${quoteSqlString(timezone)}`;
  }

  subtractHours(expression: string, hours: number): string {
    return `${expression} - INTERVAL ${quoteSqlString(String(hoursToSeconds(hours)))} SECOND`;
  }

  safePercent(numerator: string, denominator: string): string {
    return `CASE WHEN ${denominator} = 0 THEN NULL ELSE CAST(${numerator} AS DOUBLE) * 100 / ${denominator} END`;
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(expression, type, value => `json_format(CAST(${value} AS JSON))`);
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeAthenaType(nativeType);
  }

  override currentTemporal(nativeType: string, timezone: string): string | null {
    const type = parseAthenaFieldType(nativeType);
    if (type === 'DATE') return this.currentDate(timezone);
    if (type === 'TIMESTAMP') {
      return `CAST(current_timestamp AT TIME ZONE ${quoteSqlString(timezone)} AS TIMESTAMP)`;
    }
    if (type === 'TIMESTAMP WITH TIME ZONE') {
      return `current_timestamp AT TIME ZONE ${quoteSqlString(timezone)}`;
    }
    return null;
  }

  override freshnessCurrent(nativeType: string): string | null {
    const type = parseAthenaFieldType(nativeType);
    return type === 'DATE' || type === 'TIMESTAMP' || type === 'TIMESTAMP WITH TIME ZONE'
      ? 'current_timestamp'
      : null;
  }

  freshnessTimestamp(expression: string, nativeType: string, timezone: string): string | null {
    const type = parseAthenaFieldType(nativeType);
    if (type === 'DATE') {
      return `CAST(${expression} AS TIMESTAMP) AT TIME ZONE ${quoteSqlString(timezone)}`;
    }
    if (type === 'TIMESTAMP') {
      return `${expression} AT TIME ZONE ${quoteSqlString(timezone)}`;
    }
    if (type === 'TIMESTAMP WITH TIME ZONE') return expression;
    return null;
  }

  typeIntrospectionSql(sourceSql: string, fieldExpression: string): string {
    return `${sourceCte(sourceSql)}\nSELECT typeof((SELECT arbitrary(${fieldExpression}) FROM dq_source)) AS actual_type`;
  }
}

@Injectable()
export class SnowflakeDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.SNOWFLAKE;
  readonly supportsComplexCanonicalization = true;
  protected readonly identifierEscaper = escapeSnowflakeIdentifier;

  override quoteIdentifier(identifier: string): string {
    return quoteIdentifierPath(identifier, '"');
  }

  currentDate(timezone: string): string {
    return `TO_DATE(CONVERT_TIMEZONE(${quoteSqlString(timezone)}, CURRENT_TIMESTAMP()))`;
  }

  currentTimestamp(timezone: string): string {
    return `CONVERT_TIMEZONE(${quoteSqlString(timezone)}, CURRENT_TIMESTAMP())`;
  }

  subtractHours(expression: string, hours: number): string {
    return `DATEADD(millisecond, -${hoursToMilliseconds(hours)}, ${expression})`;
  }

  safePercent(numerator: string, denominator: string): string {
    return `CASE WHEN ${denominator} = 0 THEN NULL ELSE ${numerator}::DOUBLE * 100 / ${denominator} END`;
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(expression, type, value => `TO_JSON(${value})`);
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeSnowflakeType(nativeType);
  }

  override currentTemporal(nativeType: string, timezone: string): string | null {
    const type = normalizeSnowflakeType(nativeType);
    if (type === DataQualityCanonicalType.DATE) return this.currentDate(timezone);
    if (type === DataQualityCanonicalType.TIMESTAMP) {
      return `CAST(CONVERT_TIMEZONE(${quoteSqlString(timezone)}, CURRENT_TIMESTAMP()) AS TIMESTAMP_NTZ)`;
    }
    return null;
  }

  override freshnessCurrent(nativeType: string): string | null {
    const type = normalizeSnowflakeType(nativeType);
    if (type !== DataQualityCanonicalType.DATE && type !== DataQualityCanonicalType.TIMESTAMP) {
      return null;
    }
    return `CAST(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP()) AS TIMESTAMP_NTZ)`;
  }

  freshnessTimestamp(expression: string, nativeType: string, timezone: string): string | null {
    const type = normalizeSnowflakeType(nativeType);
    if (type === DataQualityCanonicalType.DATE) {
      return `CONVERT_TIMEZONE(${quoteSqlString(timezone)}, 'UTC', TO_TIMESTAMP_NTZ(${expression}))`;
    }
    if (type === DataQualityCanonicalType.TIMESTAMP) {
      return `CONVERT_TIMEZONE(${quoteSqlString(timezone)}, 'UTC', ${expression})`;
    }
    return null;
  }

  typeIntrospectionSql(sourceSql: string, fieldExpression: string): string {
    return `${sourceCte(sourceSql)}\nSELECT SYSTEM$TYPEOF((SELECT ANY_VALUE(${fieldExpression}) FROM dq_source)) AS actual_type`;
  }
}

@Injectable()
export class RedshiftDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.AWS_REDSHIFT;
  readonly supportsComplexCanonicalization = true;
  protected readonly identifierEscaper = escapeRedshiftIdentifier;

  currentDate(timezone: string): string {
    return `CAST(${this.currentTimestamp(timezone)} AS DATE)`;
  }

  currentTimestamp(timezone: string): string {
    return `CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), ${quoteSqlString(timezone)}, GETDATE())`;
  }

  subtractHours(expression: string, hours: number): string {
    return `DATEADD(millisecond, -${hoursToMilliseconds(hours)}, ${expression})`;
  }

  safePercent(numerator: string, denominator: string): string {
    return `CASE WHEN ${denominator} = 0 THEN NULL ELSE ${numerator}::DOUBLE PRECISION * 100 / ${denominator} END`;
  }

  nullSafeEquals(left: string, right: string): string {
    return `(${left} = ${right} OR (${left} IS NULL AND ${right} IS NULL))`;
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(expression, type, value => `JSON_SERIALIZE(${value})`);
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeRedshiftType(nativeType);
  }

  override currentTemporal(nativeType: string, timezone: string): string | null {
    const type = normalizeRedshiftStorageType(nativeType);
    if (type === 'DATE') return this.currentDate(timezone);
    if (type === 'TIMESTAMP') return this.currentTimestamp(timezone);
    if (type === 'TIMESTAMPTZ') return `TIMEZONE('UTC', ${this.currentUtcTimestamp()})`;
    return null;
  }

  override freshnessCurrent(nativeType: string): string | null {
    const type = normalizeRedshiftStorageType(nativeType);
    if (type === 'DATE' || type === 'TIMESTAMP' || type === 'TIMESTAMPTZ') {
      return this.currentUtcTimestamp();
    }
    return null;
  }

  freshnessTimestamp(expression: string, nativeType: string, timezone: string): string | null {
    const type = normalizeRedshiftStorageType(nativeType);
    if (type === 'DATE') {
      return `CONVERT_TIMEZONE(${quoteSqlString(timezone)}, 'UTC', CAST(${expression} AS TIMESTAMP))`;
    }
    if (type === 'TIMESTAMP') {
      return `CONVERT_TIMEZONE(${quoteSqlString(timezone)}, 'UTC', ${expression})`;
    }
    if (type === 'TIMESTAMPTZ') return `TIMEZONE('UTC', ${expression})`;
    return null;
  }

  typeIntrospectionSql(sourceSql: string, fieldExpression: string): string {
    return `${sourceCte(sourceSql)}\nSELECT ${fieldExpression} AS dq_value FROM dq_source WHERE 1 = 0`;
  }

  private currentUtcTimestamp(): string {
    return `CONVERT_TIMEZONE(CURRENT_SETTING('timezone'), 'UTC', GETDATE())`;
  }
}

@Injectable()
export class DatabricksDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.DATABRICKS;
  readonly supportsComplexCanonicalization = true;
  protected readonly identifierEscaper = escapeDatabricksIdentifier;

  currentDate(timezone: string): string {
    return `TO_DATE(from_utc_timestamp(current_timestamp(), ${quoteSqlString(timezone)}))`;
  }

  currentTimestamp(timezone: string): string {
    return `from_utc_timestamp(current_timestamp(), ${quoteSqlString(timezone)})`;
  }

  subtractHours(expression: string, hours: number): string {
    return `${expression} - INTERVAL ${hoursToSeconds(hours)} SECONDS`;
  }

  safePercent(numerator: string, denominator: string): string {
    return `CASE WHEN ${denominator} = 0 THEN NULL ELSE CAST(${numerator} AS DOUBLE) * 100 / ${denominator} END`;
  }

  nullSafeEquals(left: string, right: string): string {
    return `${left} <=> ${right}`;
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(expression, type, value => `to_json(${value})`);
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeDatabricksType(nativeType);
  }

  override currentTemporal(nativeType: string, timezone: string): string | null {
    const type = normalizeDatabricksStorageType(nativeType);
    if (type === 'DATE') return this.currentDate(timezone);
    if (type === 'TIMESTAMP') return 'current_timestamp()';
    if (type === 'TIMESTAMP_NTZ') {
      return `CAST(from_utc_timestamp(current_timestamp(), ${quoteSqlString(timezone)}) AS TIMESTAMP_NTZ)`;
    }
    return null;
  }

  override freshnessCurrent(nativeType: string): string | null {
    const type = normalizeDatabricksStorageType(nativeType);
    return type === 'DATE' || type === 'TIMESTAMP' || type === 'TIMESTAMP_NTZ'
      ? 'current_timestamp()'
      : null;
  }

  freshnessTimestamp(expression: string, nativeType: string, timezone: string): string | null {
    const type = normalizeDatabricksStorageType(nativeType);
    if (type === 'DATE') {
      return `to_utc_timestamp(CAST(${expression} AS TIMESTAMP), ${quoteSqlString(timezone)})`;
    }
    if (type === 'TIMESTAMP') return expression;
    if (type === 'TIMESTAMP_NTZ') {
      return `to_utc_timestamp(${expression}, ${quoteSqlString(timezone)})`;
    }
    return null;
  }

  typeIntrospectionSql(sourceSql: string, fieldExpression: string): string {
    return `${sourceCte(sourceSql)}\nSELECT typeof((SELECT first(${fieldExpression}, true) FROM dq_source)) AS actual_type`;
  }
}

export const DATA_QUALITY_SQL_DIALECTS = [
  BigQueryDataQualitySqlDialect,
  LegacyBigQueryDataQualitySqlDialect,
  AthenaDataQualitySqlDialect,
  SnowflakeDataQualitySqlDialect,
  RedshiftDataQualitySqlDialect,
  DatabricksDataQualitySqlDialect,
] as const;

export function createDataQualitySqlDialectRegistry(): TypeResolver<
  DataStorageType,
  DataQualitySqlDialect
> {
  return new TypeResolver<DataStorageType, DataQualitySqlDialect>([
    new BigQueryDataQualitySqlDialect(),
    new LegacyBigQueryDataQualitySqlDialect(),
    new AthenaDataQualitySqlDialect(),
    new SnowflakeDataQualitySqlDialect(),
    new RedshiftDataQualitySqlDialect(),
    new DatabricksDataQualitySqlDialect(),
  ]);
}

export function sourceCte(sourceSql: string): string {
  const normalized = stripTrailingSemicolon(sourceSql).trim();
  if (!normalized) throw new Error('Data Quality source SQL must not be empty');
  return `WITH dq_source AS (\n${normalized}\n)`;
}

export function normalizeDataQualityType(
  storageType: DataStorageType,
  nativeType: string
): DataQualityCanonicalType | null {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return normalizeBigQueryType(nativeType);
    case DataStorageType.AWS_ATHENA:
      return normalizeAthenaType(nativeType);
    case DataStorageType.SNOWFLAKE:
      return normalizeSnowflakeType(nativeType);
    case DataStorageType.AWS_REDSHIFT:
      return normalizeRedshiftType(nativeType);
    case DataStorageType.DATABRICKS:
      return normalizeDatabricksType(nativeType);
  }
}

export function isDataQualityGroupingTypeSupported(
  type: DataQualityCanonicalType | null,
  supportsComplexCanonicalization = true
): boolean {
  if (type === null) return false;
  if (type === DataQualityCanonicalType.INTERVAL || type === DataQualityCanonicalType.GEOGRAPHY) {
    return false;
  }
  if (type === DataQualityCanonicalType.COMPLEX || type === DataQualityCanonicalType.JSON) {
    return supportsComplexCanonicalization;
  }
  return true;
}

function matchesProviderStorageType(
  storageType: DataStorageType,
  actualNativeType: string,
  expectedNativeType: string,
  expectedMode?: string
): boolean {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return matchesBigQueryStorageType(actualNativeType, expectedNativeType, expectedMode);
    case DataStorageType.AWS_ATHENA:
      return (
        normalizeAthenaStorageType(actualNativeType) ===
        normalizeAthenaStorageType(expectedNativeType)
      );
    case DataStorageType.SNOWFLAKE:
      return matchesSnowflakeStorageType(actualNativeType, expectedNativeType);
    case DataStorageType.AWS_REDSHIFT:
      return (
        normalizeRedshiftStorageType(actualNativeType) ===
        normalizeRedshiftStorageType(expectedNativeType)
      );
    case DataStorageType.DATABRICKS:
      return (
        normalizeDatabricksStorageType(actualNativeType) ===
        normalizeDatabricksStorageType(expectedNativeType)
      );
  }
}

interface BigQueryStorageType {
  type: string | null;
  repeated: boolean;
}

function matchesBigQueryStorageType(
  actualNativeType: string,
  expectedNativeType: string,
  expectedMode?: string
): boolean {
  const actual = normalizeBigQueryStorageType(actualNativeType);
  const expected = normalizeBigQueryStorageType(expectedNativeType);
  const expectedRepeated = expectedMode?.toUpperCase() === 'REPEATED' || expected.repeated;
  return (
    actual.type !== null && actual.type === expected.type && actual.repeated === expectedRepeated
  );
}

function normalizeBigQueryStorageType(nativeType: string): BigQueryStorageType {
  let type = typeHead(nativeType);
  let repeated = false;
  const array = type.match(/^ARRAY\s*<([\s\S]+)>$/);
  if (array) {
    repeated = true;
    type = array[1].trim();
  }
  if (/^(?:STRUCT|RECORD)(?:\s*<|$)/.test(type)) {
    return { type: 'RECORD', repeated };
  }
  if (/^RANGE(?:\s*<|$)/.test(type)) return { type: 'RANGE', repeated };
  const scalar = type.replace(/\s*\([^)]*\)\s*$/, '');
  return { type: parseBigQueryFieldType(scalar), repeated };
}

function normalizeAthenaStorageType(nativeType: string): string | null {
  const normalized = typeHead(nativeType);
  const type = parseAthenaFieldType(normalized === 'INT' ? 'INTEGER' : normalized);
  if (type === 'STRING' || type === 'VARCHAR') return 'VARCHAR';
  if (type === 'FLOAT' || type === 'REAL') return 'REAL';
  if (type === 'BINARY' || type === 'VARBINARY') return 'VARBINARY';
  if (type === 'STRUCT' || type === 'ROW') return 'ROW';
  return type;
}

function matchesSnowflakeStorageType(
  actualNativeType: string,
  expectedNativeType: string
): boolean {
  const actual = typeHead(actualNativeType).replace(/\s*\[[^\]]+\]\s*$/, '');
  const expected = normalizeSnowflakeStorageType(expectedNativeType);
  if (!expected) return false;
  const number = actual.match(/^(?:NUMBER|NUMERIC|DECIMAL|DEC|FIXED)\s*\(\s*\d+\s*,\s*(\d+)\s*\)$/);
  if (number) {
    return expected === 'NUMERIC' || (expected === 'INTEGER' && Number(number[1]) === 0);
  }
  return normalizeSnowflakeStorageType(actual) === expected;
}

function normalizeSnowflakeStorageType(nativeType: string): string | null {
  const type = typeHead(nativeType)
    .replace(/\s*\[[^\]]+\]\s*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '');
  if (type === 'NUMERIC') return 'NUMERIC';
  return parseSnowflakeFieldType(type);
}

function normalizeRedshiftStorageType(nativeType: string): string | null {
  const type = typeHead(nativeType).replace(/\s*\([^)]*\)\s*$/, '');
  if (type === 'INT2' || type === 'SMALLINT') return 'SMALLINT';
  if (type === 'INT' || type === 'INT4' || type === 'INTEGER') return 'INTEGER';
  if (type === 'INT8' || type === 'BIGINT') return 'BIGINT';
  if (type === 'FLOAT4' || type === 'REAL') return 'REAL';
  if (type === 'FLOAT8' || type === 'DOUBLE PRECISION') return 'DOUBLE PRECISION';
  if (type === 'DECIMAL' || type === 'NUMERIC') return 'DECIMAL';
  if (type === 'CHARACTER VARYING' || type === 'VARCHAR' || type === 'TEXT') return 'VARCHAR';
  if (type === 'CHARACTER' || type === 'CHAR' || type === 'BPCHAR') return 'CHAR';
  if (type === 'BOOL' || type === 'BOOLEAN') return 'BOOLEAN';
  if (type === 'TIMESTAMP WITH TIME ZONE' || type === 'TIMESTAMPTZ') return 'TIMESTAMPTZ';
  if (type === 'TIMESTAMP WITHOUT TIME ZONE' || type === 'TIMESTAMP') return 'TIMESTAMP';
  if (type === 'TIME WITH TIME ZONE' || type === 'TIMETZ') return 'TIMETZ';
  if (type === 'TIME WITHOUT TIME ZONE' || type === 'TIME') return 'TIME';
  return ['DATE', 'BYTEA', 'SUPER', 'GEOMETRY', 'GEOGRAPHY'].includes(type) ? type : null;
}

function normalizeDatabricksStorageType(nativeType: string): string | null {
  const type = typeHead(nativeType).replace(/\s*\([^)]*\)\s*$/, '');
  if (type === 'BYTE' || type === 'TINYINT') return 'TINYINT';
  if (type === 'SHORT' || type === 'SMALLINT') return 'SMALLINT';
  if (type === 'INTEGER' || type === 'INT') return 'INT';
  if (type === 'LONG' || type === 'BIGINT') return 'BIGINT';
  if (type === 'NUMERIC' || type === 'DECIMAL') return 'DECIMAL';
  if (type === 'BOOL' || type === 'BOOLEAN') return 'BOOLEAN';
  if (type === 'TIMESTAMP_LTZ' || type === 'TIMESTAMP') return 'TIMESTAMP';
  if (type === 'INTERVAL' || type.startsWith('INTERVAL ')) return 'INTERVAL';
  const head = type.split(/[<(]/, 1)[0].trim();
  return [
    'STRING',
    'VARCHAR',
    'CHAR',
    'FLOAT',
    'DOUBLE',
    'DATE',
    'TIMESTAMP_NTZ',
    'ARRAY',
    'STRUCT',
    'MAP',
    'BINARY',
    'INTERVAL',
  ].includes(head)
    ? head
    : null;
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifierPath(value: string, quote: '`' | '"'): string {
  return value
    .split('.')
    .map(part => {
      const trimmed = part.trim();
      const unquoted =
        trimmed.startsWith(quote) && trimmed.endsWith(quote)
          ? trimmed.slice(1, -1).replaceAll(`${quote}${quote}`, quote)
          : trimmed;
      return `${quote}${unquoted.replaceAll(quote, `${quote}${quote}`)}${quote}`;
    })
    .join('.');
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function hoursToMilliseconds(hours: number): number {
  return hoursToSafeInteger(hours, 60 * 60 * 1000);
}

function hoursToSeconds(hours: number): number {
  return hoursToSafeInteger(hours, 60 * 60);
}

function hoursToSafeInteger(hours: number, multiplier: number): number {
  assertNonNegativeFinite(hours, 'hours');
  const result = Math.round(hours * multiplier);
  if (!Number.isSafeInteger(result)) {
    throw new Error('hours conversion must be a safe integer');
  }
  return result;
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trimEnd().replace(/;\s*$/, '');
}

function typeHead(nativeType: string): string {
  return nativeType.trim().toUpperCase().replace(/\s+/g, ' ');
}

function matches(type: string, names: readonly string[]): boolean {
  return names.some(
    name => type === name || type.startsWith(`${name}(`) || type.startsWith(`${name}<`)
  );
}

function normalizeBigQueryType(nativeType: string): DataQualityCanonicalType | null {
  const type = typeHead(nativeType);
  if (matches(type, ['INT64', 'INTEGER', 'INT', 'SMALLINT', 'BIGINT', 'TINYINT', 'BYTEINT']))
    return DataQualityCanonicalType.INTEGER;
  if (matches(type, ['FLOAT64', 'FLOAT', 'DOUBLE', 'REAL'])) return DataQualityCanonicalType.FLOAT;
  if (matches(type, ['NUMERIC', 'BIGNUMERIC', 'DECIMAL', 'BIGDECIMAL']))
    return DataQualityCanonicalType.DECIMAL;
  if (matches(type, ['STRING'])) return DataQualityCanonicalType.STRING;
  if (matches(type, ['BYTES'])) return DataQualityCanonicalType.BYTES;
  if (matches(type, ['BOOL', 'BOOLEAN'])) return DataQualityCanonicalType.BOOLEAN;
  if (matches(type, ['DATE'])) return DataQualityCanonicalType.DATE;
  if (matches(type, ['TIME'])) return DataQualityCanonicalType.TIME;
  if (matches(type, ['DATETIME'])) return DataQualityCanonicalType.DATETIME;
  if (matches(type, ['TIMESTAMP'])) return DataQualityCanonicalType.TIMESTAMP;
  if (matches(type, ['GEOGRAPHY'])) return DataQualityCanonicalType.GEOGRAPHY;
  if (matches(type, ['JSON'])) return DataQualityCanonicalType.JSON;
  if (matches(type, ['RECORD', 'STRUCT', 'ARRAY', 'RANGE']))
    return DataQualityCanonicalType.COMPLEX;
  if (matches(type, ['INTERVAL'])) return DataQualityCanonicalType.INTERVAL;
  return null;
}

function normalizeAthenaType(nativeType: string): DataQualityCanonicalType | null {
  const type = typeHead(nativeType);
  if (matches(type, ['TINYINT', 'SMALLINT', 'INTEGER', 'INT', 'BIGINT']))
    return DataQualityCanonicalType.INTEGER;
  if (matches(type, ['FLOAT', 'REAL', 'DOUBLE'])) return DataQualityCanonicalType.FLOAT;
  if (matches(type, ['DECIMAL'])) return DataQualityCanonicalType.DECIMAL;
  if (matches(type, ['CHAR', 'VARCHAR', 'STRING'])) return DataQualityCanonicalType.STRING;
  if (matches(type, ['BINARY', 'VARBINARY'])) return DataQualityCanonicalType.BYTES;
  if (matches(type, ['BOOLEAN'])) return DataQualityCanonicalType.BOOLEAN;
  if (matches(type, ['DATE'])) return DataQualityCanonicalType.DATE;
  if (matches(type, ['TIME', 'TIME WITH TIME ZONE'])) return DataQualityCanonicalType.TIME;
  if (matches(type, ['TIMESTAMP', 'TIMESTAMP WITH TIME ZONE']))
    return DataQualityCanonicalType.TIMESTAMP;
  if (matches(type, ['JSON'])) return DataQualityCanonicalType.JSON;
  if (matches(type, ['ARRAY', 'MAP', 'STRUCT', 'ROW'])) return DataQualityCanonicalType.COMPLEX;
  if (matches(type, ['INTERVAL'])) return DataQualityCanonicalType.INTERVAL;
  return null;
}

function normalizeSnowflakeType(nativeType: string): DataQualityCanonicalType | null {
  const type = typeHead(nativeType).replace(/\[[^\]]+\]$/, '');
  const number = type.match(/^(?:NUMBER|NUMERIC|DECIMAL|DEC|FIXED)\s*\(\s*\d+\s*,\s*(\d+)\s*\)$/);
  if (number) {
    return DataQualityCanonicalType.DECIMAL;
  }
  if (matches(type, ['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'BYTEINT']))
    return DataQualityCanonicalType.INTEGER;
  if (matches(type, ['NUMBER', 'NUMERIC', 'DECIMAL', 'DEC', 'FIXED']))
    return DataQualityCanonicalType.DECIMAL;
  if (matches(type, ['FLOAT', 'FLOAT4', 'FLOAT8', 'DOUBLE', 'DOUBLE PRECISION', 'REAL']))
    return DataQualityCanonicalType.FLOAT;
  if (matches(type, ['VARCHAR', 'CHAR', 'CHARACTER', 'STRING', 'TEXT']))
    return DataQualityCanonicalType.STRING;
  if (matches(type, ['BINARY', 'VARBINARY', 'BYTES'])) return DataQualityCanonicalType.BYTES;
  if (matches(type, ['BOOLEAN', 'BOOL'])) return DataQualityCanonicalType.BOOLEAN;
  if (matches(type, ['DATE'])) return DataQualityCanonicalType.DATE;
  if (matches(type, ['TIME'])) return DataQualityCanonicalType.TIME;
  if (matches(type, ['DATETIME', 'TIMESTAMP', 'TIMESTAMP_LTZ', 'TIMESTAMP_NTZ', 'TIMESTAMP_TZ']))
    return DataQualityCanonicalType.TIMESTAMP;
  if (matches(type, ['GEOGRAPHY', 'GEOMETRY'])) return DataQualityCanonicalType.GEOGRAPHY;
  if (matches(type, ['VARIANT', 'OBJECT', 'ARRAY'])) return DataQualityCanonicalType.COMPLEX;
  return null;
}

function normalizeRedshiftType(nativeType: string): DataQualityCanonicalType | null {
  const type = typeHead(nativeType);
  if (matches(type, ['SMALLINT', 'INTEGER', 'BIGINT', 'INT', 'INT2', 'INT4', 'INT8']))
    return DataQualityCanonicalType.INTEGER;
  if (matches(type, ['REAL', 'DOUBLE PRECISION', 'FLOAT4', 'FLOAT8']))
    return DataQualityCanonicalType.FLOAT;
  if (matches(type, ['DECIMAL', 'NUMERIC'])) return DataQualityCanonicalType.DECIMAL;
  if (matches(type, ['VARCHAR', 'CHAR', 'CHARACTER VARYING', 'TEXT', 'BPCHAR']))
    return DataQualityCanonicalType.STRING;
  if (matches(type, ['BOOLEAN', 'BOOL'])) return DataQualityCanonicalType.BOOLEAN;
  if (matches(type, ['DATE'])) return DataQualityCanonicalType.DATE;
  if (matches(type, ['TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMP WITH TIME ZONE']))
    return DataQualityCanonicalType.TIMESTAMP;
  if (matches(type, ['TIME', 'TIMETZ', 'TIME WITH TIME ZONE']))
    return DataQualityCanonicalType.TIME;
  if (matches(type, ['BYTEA'])) return DataQualityCanonicalType.BYTES;
  if (matches(type, ['SUPER'])) return DataQualityCanonicalType.COMPLEX;
  if (matches(type, ['GEOMETRY', 'GEOGRAPHY'])) return DataQualityCanonicalType.GEOGRAPHY;
  return null;
}

function normalizeDatabricksType(nativeType: string): DataQualityCanonicalType | null {
  const type = typeHead(nativeType);
  if (matches(type, ['TINYINT', 'SMALLINT', 'INT', 'INTEGER', 'BIGINT', 'LONG', 'SHORT', 'BYTE']))
    return DataQualityCanonicalType.INTEGER;
  if (matches(type, ['FLOAT', 'DOUBLE', 'REAL'])) return DataQualityCanonicalType.FLOAT;
  if (matches(type, ['DECIMAL', 'NUMERIC'])) return DataQualityCanonicalType.DECIMAL;
  if (matches(type, ['STRING', 'VARCHAR', 'CHAR'])) return DataQualityCanonicalType.STRING;
  if (matches(type, ['BINARY'])) return DataQualityCanonicalType.BYTES;
  if (matches(type, ['BOOLEAN', 'BOOL'])) return DataQualityCanonicalType.BOOLEAN;
  if (matches(type, ['DATE'])) return DataQualityCanonicalType.DATE;
  if (matches(type, ['TIMESTAMP', 'TIMESTAMP_NTZ'])) return DataQualityCanonicalType.TIMESTAMP;
  if (matches(type, ['ARRAY', 'STRUCT', 'MAP'])) return DataQualityCanonicalType.COMPLEX;
  if (matches(type, ['INTERVAL']) || type.startsWith('INTERVAL ')) {
    return DataQualityCanonicalType.INTERVAL;
  }
  return null;
}
