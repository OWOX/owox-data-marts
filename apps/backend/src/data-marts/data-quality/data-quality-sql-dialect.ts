import { Injectable } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { parseAthenaFieldType } from '../data-storage-types/athena/enums/athena-field-type.enum';
import { parseBigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { parseSnowflakeFieldType } from '../data-storage-types/snowflake/enums/snowflake-field-type.enum';
import { isDataQualityFreshnessTypeSupported } from './data-quality-freshness-support';

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
  quoteIdentifierPath(path: readonly string[]): string;
  freshnessCurrent(nativeType: string): string | null;
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
  freshnessTimestamp(expression: string, nativeType: string): string | null;
  typeIntrospectionExpression(fieldExpression: string): string | null;
  limit(sql: string, count: number): string;
}

abstract class BaseDataQualitySqlDialect implements DataQualitySqlDialect {
  abstract readonly type: DataStorageType;
  protected abstract readonly identifierQuote: '`' | '"';

  quoteIdentifierPath(path: readonly string[]): string {
    if (path.length === 0) {
      throw new Error('Data Quality identifier path must not be empty');
    }
    return path.map(segment => this.quoteIdentifierSegment(segment)).join('.');
  }

  protected quoteIdentifierSegment(segment: string): string {
    return quoteIdentifierSegment(segment, this.identifierQuote);
  }

  abstract subtractHours(expression: string, hours: number): string;
  abstract safePercent(numerator: string, denominator: string): string;
  abstract canonicalizeForGrouping(
    expression: string,
    type: DataQualityCanonicalType
  ): string | null;
  abstract normalizeType(nativeType: string): DataQualityCanonicalType | null;
  abstract freshnessCurrent(nativeType: string): string | null;
  abstract freshnessTimestamp(expression: string, nativeType: string): string | null;
  abstract typeIntrospectionExpression(fieldExpression: string): string | null;

  nullSafeEquals(left: string, right: string): string {
    return `${left} IS NOT DISTINCT FROM ${right}`;
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
    if (!isDataQualityGroupingTypeSupported(type)) {
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
  protected readonly identifierQuote = '`';

  protected override quoteIdentifierSegment(segment: string): string {
    const unquoted =
      segment.length >= 2 && segment.startsWith('`') && segment.endsWith('`')
        ? segment.slice(1, -1).replace(/\\([\\`])/g, '$1')
        : segment;
    return `\`${unquoted.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``;
  }

  subtractHours(expression: string, hours: number): string {
    return renderSqlFunctionCall('TIMESTAMP_SUB', [
      expression,
      `INTERVAL ${hoursToMilliseconds(hours)} MILLISECOND`,
    ]);
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

  freshnessCurrent(nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType)
      ? 'CURRENT_TIMESTAMP()'
      : null;
  }

  freshnessTimestamp(expression: string, nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType) ? expression : null;
  }

  typeIntrospectionExpression(fieldExpression: string): string {
    return `TYPEOF((SELECT ANY_VALUE(${fieldExpression}) FROM dq_source))`;
  }
}

@Injectable()
export class LegacyBigQueryDataQualitySqlDialect extends BigQueryDataQualitySqlDialect {
  override readonly type: DataStorageType = DataStorageType.LEGACY_GOOGLE_BIGQUERY;
}

@Injectable()
export class AthenaDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.AWS_ATHENA;
  protected readonly identifierQuote = '"';

  subtractHours(expression: string, hours: number): string {
    return `${expression} - INTERVAL ${quoteSqlString(String(hoursToSeconds(hours)))} SECOND`;
  }

  safePercent(numerator: string, denominator: string): string {
    return renderSafePercentCase(
      denominator,
      `CAST(${numerator} AS DOUBLE) * 100 / ${denominator}`
    );
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(expression, type, value => `json_format(CAST(${value} AS JSON))`);
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeAthenaType(nativeType);
  }

  freshnessCurrent(nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType) ? 'current_timestamp' : null;
  }

  freshnessTimestamp(expression: string, nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType) ? expression : null;
  }

  typeIntrospectionExpression(fieldExpression: string): string {
    return `typeof((SELECT arbitrary(${fieldExpression}) FROM dq_source))`;
  }
}

@Injectable()
export class SnowflakeDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.SNOWFLAKE;
  protected readonly identifierQuote = '"';

  subtractHours(expression: string, hours: number): string {
    return renderSqlFunctionCall('DATEADD', [
      'millisecond',
      `-${hoursToMilliseconds(hours)}`,
      expression,
    ]);
  }

  safePercent(numerator: string, denominator: string): string {
    return renderSafePercentCase(denominator, `${numerator}::DOUBLE * 100 / ${denominator}`);
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(expression, type, value => `TO_JSON(${value})`);
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeSnowflakeType(nativeType);
  }

  freshnessCurrent(_nativeType: string): string | null {
    return null;
  }

  freshnessTimestamp(_expression: string, _nativeType: string): string | null {
    return null;
  }

  typeIntrospectionExpression(fieldExpression: string): string {
    return `SYSTEM$TYPEOF((SELECT ANY_VALUE(${fieldExpression}) FROM dq_source))`;
  }
}

@Injectable()
export class RedshiftDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.AWS_REDSHIFT;
  protected readonly identifierQuote = '"';

  subtractHours(expression: string, hours: number): string {
    const totalSeconds = hoursToSeconds(hours);
    const days = Math.floor(totalSeconds / 86400);
    const seconds = totalSeconds % 86400;
    if (days > 2147483647) {
      throw new Error('hours conversion exceeds the Redshift DATEADD range');
    }
    if (days === 0) {
      return renderSqlFunctionCall('DATEADD', ['second', `-${seconds}`, expression]);
    }
    const shiftedByDays = renderSqlFunctionCall('DATEADD', ['day', `-${days}`, expression]);
    if (seconds === 0) {
      return shiftedByDays;
    }
    return renderSqlFunctionCall('DATEADD', ['second', `-${seconds}`, shiftedByDays]);
  }

  safePercent(numerator: string, denominator: string): string {
    return renderSafePercentCase(
      denominator,
      `${numerator}::DOUBLE PRECISION * 100 / ${denominator}`
    );
  }

  nullSafeEquals(left: string, right: string): string {
    return [
      '(',
      `  ${left} = ${right}`,
      '  OR (',
      `    ${left} IS NULL`,
      `    AND ${right} IS NULL`,
      '  )',
      ')',
    ].join('\n');
  }

  canonicalizeForGrouping(expression: string, type: DataQualityCanonicalType): string | null {
    return this.scalarOrComplex(expression, type, value => `JSON_SERIALIZE(${value})`);
  }

  normalizeType(nativeType: string): DataQualityCanonicalType | null {
    return normalizeRedshiftType(nativeType);
  }

  freshnessCurrent(nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType)
      ? this.currentUtcTimestamp()
      : null;
  }

  freshnessTimestamp(expression: string, nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType)
      ? renderSqlFunctionCall('TIMEZONE', ["'UTC'", expression])
      : null;
  }

  typeIntrospectionExpression(_fieldExpression: string): null {
    return null;
  }

  private currentUtcTimestamp(): string {
    return renderSqlFunctionCall('CONVERT_TIMEZONE', [
      `CURRENT_SETTING('timezone')`,
      "'UTC'",
      'GETDATE()',
    ]);
  }
}

@Injectable()
export class DatabricksDataQualitySqlDialect extends BaseDataQualitySqlDialect {
  readonly type: DataStorageType = DataStorageType.DATABRICKS;
  protected readonly identifierQuote = '`';

  subtractHours(expression: string, hours: number): string {
    return `${expression} - INTERVAL ${hoursToSeconds(hours)} SECONDS`;
  }

  safePercent(numerator: string, denominator: string): string {
    return renderSafePercentCase(
      denominator,
      `CAST(${numerator} AS DOUBLE) * 100 / ${denominator}`
    );
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

  freshnessCurrent(nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType)
      ? 'current_timestamp()'
      : null;
  }

  freshnessTimestamp(expression: string, nativeType: string): string | null {
    return isDataQualityFreshnessTypeSupported(this.type, nativeType) ? expression : null;
  }

  typeIntrospectionExpression(fieldExpression: string): string {
    return `typeof((SELECT first(${fieldExpression}, true) FROM dq_source))`;
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

export function isDataQualityGroupingTypeSupported(type: DataQualityCanonicalType | null): boolean {
  if (type === null) return false;
  if (type === DataQualityCanonicalType.INTERVAL || type === DataQualityCanonicalType.GEOGRAPHY) {
    return false;
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
      return matchesNormalizedStorageType(
        normalizeAthenaStorageType(actualNativeType),
        normalizeAthenaStorageType(expectedNativeType)
      );
    case DataStorageType.SNOWFLAKE:
      return matchesSnowflakeStorageType(actualNativeType, expectedNativeType);
    case DataStorageType.AWS_REDSHIFT:
      return matchesNormalizedStorageType(
        normalizeRedshiftStorageType(actualNativeType),
        normalizeRedshiftStorageType(expectedNativeType)
      );
    case DataStorageType.DATABRICKS:
      return matchesNormalizedStorageType(
        normalizeDatabricksStorageType(actualNativeType),
        normalizeDatabricksStorageType(expectedNativeType)
      );
  }
}

function matchesNormalizedStorageType(
  actualType: string | null,
  expectedType: string | null
): boolean {
  return actualType !== null && expectedType !== null && actualType === expectedType;
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

function renderSafePercentCase(denominator: string, ratio: string): string {
  return ['CASE', `  WHEN ${denominator} = 0 THEN NULL`, `  ELSE ${ratio}`, 'END'].join('\n');
}

function renderSqlFunctionCall(name: string, arguments_: string[]): string {
  return [
    `${name}(`,
    arguments_
      .map((argument, index) => {
        const rendered = indentSql(argument, 2);
        return index < arguments_.length - 1 ? `${rendered},` : rendered;
      })
      .join('\n'),
    ')',
  ].join('\n');
}

function indentSql(sql: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return sql
    .split('\n')
    .map(line => `${indentation}${line}`)
    .join('\n');
}

function quoteIdentifierSegment(value: string, quote: '`' | '"'): string {
  const unquoted =
    value.length >= 2 && value.startsWith(quote) && value.endsWith(quote)
      ? value.slice(1, -1).replaceAll(`${quote}${quote}`, quote)
      : value;
  return `${quote}${unquoted.replaceAll(quote, `${quote}${quote}`)}${quote}`;
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
