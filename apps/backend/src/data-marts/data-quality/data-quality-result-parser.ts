import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  DataQualityMappedError,
  DataQualityResultExample,
  DataQualitySummary,
} from '../dto/schemas/data-quality/data-quality-run.schema';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataQualityCompiledCheck } from './data-quality-check-compiler';
import {
  DataQualitySqlDialect,
  createDataQualitySqlDialectRegistry,
} from './data-quality-sql-dialect';

export interface DataQualityQueryExecution {
  sql: string;
  rows?: Record<string, unknown>[];
  columnMetadata?: Array<{
    name?: string | null;
    label?: string | null;
    typeName?: string | null;
  }>;
  error?: DataQualityMappedError;
}

export interface DataQualityParsedResult {
  category: DataQualityCategory;
  ruleKey: string;
  severity: DataQualitySeverity;
  status: DataQualityCheckStatus;
  violationCount: number;
  description: string;
  examples: DataQualityResultExample[];
  sql: string | null;
  error: DataQualityMappedError | null;
}

export const DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS = {
  maxDepth: 8,
  maxCollectionItems: 50,
  maxStringBytes: 2 * 1024,
  maxBinaryBytes: 256,
  maxNodes: 512,
  maxTotalBytes: 16 * 1024,
} as const;

export class DataQualityResultParser {
  constructor(
    private readonly dialectResolver: TypeResolver<DataStorageType, DataQualitySqlDialect>
  ) {}

  async parse(
    storageType: DataStorageType,
    plan: DataQualityCompiledCheck,
    execution: DataQualityQueryExecution | null
  ): Promise<DataQualityParsedResult> {
    const common = {
      category: plan.category,
      ruleKey: plan.ruleKey,
      severity: plan.severity,
      sql: execution?.sql ?? plan.sql,
    };
    if (plan.kind === 'NOT_APPLICABLE') {
      return {
        ...common,
        status: DataQualityCheckStatus.NOT_APPLICABLE,
        violationCount: 0,
        description: plan.reason,
        examples: [],
        error: null,
      };
    }

    if (execution?.error) {
      return {
        ...common,
        status: DataQualityCheckStatus.ERROR,
        violationCount: 0,
        description: execution.error.message,
        examples: [],
        error: execution.error,
      };
    }

    switch (plan.strategy) {
      case 'COUNT':
        return this.parseCount(plan, execution, common);
      case 'TYPE_MISMATCH':
        return this.parseTypeMismatch(storageType, plan, execution, common);
    }
  }

  private parseCount(
    plan: Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }>,
    execution: DataQualityQueryExecution | null,
    common: ParsedCommon
  ): DataQualityParsedResult {
    const row = execution?.rows?.[0];
    if (!row) return parserError(common, 'Missing Data Quality measurement result');
    const applicable = readValue(row, 'is_applicable');
    if (applicable !== undefined && !readBoolean(applicable)) {
      return {
        ...common,
        status: DataQualityCheckStatus.NOT_APPLICABLE,
        violationCount: 0,
        description: `${plan.category} is not applicable to an empty source`,
        examples: [],
        error: null,
      };
    }
    const violationCount = readNonNegativeInteger(readValue(row, 'violation_count'));
    if (violationCount === null) {
      return parserError(common, 'Invalid or missing violation_count in Data Quality result');
    }
    const failed = violationCount > 0;
    return {
      ...common,
      status: failed ? DataQualityCheckStatus.FAILED : DataQualityCheckStatus.PASSED,
      violationCount,
      description: failed
        ? `${plan.category} found ${violationCount} violation(s)`
        : `${plan.category} passed`,
      examples: failed
        ? parseExamples(execution, plan.resultShape, Math.min(3, violationCount))
        : [],
      error: null,
    };
  }

  private async parseTypeMismatch(
    storageType: DataStorageType,
    plan: Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }>,
    execution: DataQualityQueryExecution | null,
    common: ParsedCommon
  ): Promise<DataQualityParsedResult> {
    if (!plan.expectedType || !plan.expectedNativeType) {
      return parserError(common, 'Missing expected Output Schema type');
    }
    const rowActualValue =
      execution?.rows?.[0] && plan.resultShape.actualTypeColumn
        ? readValue(execution.rows[0], plan.resultShape.actualTypeColumn)
        : undefined;
    const metadataColumn = plan.resultShape.actualTypeMetadataColumn;
    const metadataActualType = execution?.columnMetadata?.find(column =>
      [column.name, column.label].some(
        value =>
          typeof value === 'string' &&
          metadataColumn !== undefined &&
          value.toLowerCase() === metadataColumn.toLowerCase()
      )
    )?.typeName;
    const actualValue = rowActualValue ?? metadataActualType;
    const dialect = await this.dialectResolver.resolve(storageType);
    const actualNativeType =
      typeof actualValue === 'string' && actualValue.trim() ? actualValue.trim() : null;
    const failed =
      !actualNativeType ||
      !dialect.matchesExpectedType(actualNativeType, plan.expectedNativeType, plan.expectedMode);
    return {
      ...common,
      status: failed ? DataQualityCheckStatus.FAILED : DataQualityCheckStatus.PASSED,
      violationCount: failed ? 1 : 0,
      description: failed
        ? actualNativeType
          ? `Actual type ${actualNativeType} does not match Output Schema type ${plan.expectedNativeType ?? plan.expectedType}`
          : `Actual type is missing or unknown; expected ${plan.expectedNativeType ?? plan.expectedType}`
        : `Actual type matches Output Schema type ${plan.expectedNativeType ?? plan.expectedType}`,
      examples: failed ? parseExamples(execution, plan.resultShape, 1) : [],
      error: null,
    };
  }
}

type ParsedCommon = Pick<DataQualityParsedResult, 'category' | 'ruleKey' | 'severity' | 'sql'>;

export function createDataQualityResultParser(): DataQualityResultParser {
  return new DataQualityResultParser(createDataQualitySqlDialectRegistry());
}

export function aggregateDataQualitySummary(
  results: readonly Pick<DataQualityParsedResult, 'status' | 'severity' | 'violationCount'>[],
  enabledChecks: number = results.length
): DataQualitySummary {
  const count = (status: DataQualityCheckStatus) =>
    results.filter(result => result.status === status).length;
  const failed = results.filter(result => result.status === DataQualityCheckStatus.FAILED);
  const findingCount = (severity: DataQualitySeverity) =>
    failed.filter(result => result.severity === severity).length;
  const state =
    results.length === 0
      ? DataQualitySummaryState.ALL_DISABLED
      : results.some(result => result.status === DataQualityCheckStatus.ERROR)
        ? DataQualitySummaryState.EXECUTION_FAILED
        : failed.length > 0
          ? DataQualitySummaryState.ISSUES
          : DataQualitySummaryState.PASSED;
  return {
    state,
    enabledChecks,
    totalChecks: results.length,
    passedChecks: count(DataQualityCheckStatus.PASSED),
    failedChecks: failed.length,
    notApplicableChecks: count(DataQualityCheckStatus.NOT_APPLICABLE),
    errorChecks: count(DataQualityCheckStatus.ERROR),
    noticeFindings: findingCount(DataQualitySeverity.NOTICE),
    warningFindings: findingCount(DataQualitySeverity.WARNING),
    errorFindings: findingCount(DataQualitySeverity.ERROR),
    violationCount: results.reduce(
      (total, result) =>
        result.violationCount > Number.MAX_SAFE_INTEGER - total
          ? Number.MAX_SAFE_INTEGER
          : total + result.violationCount,
      0
    ),
    highestSeverity: highestSeverity(failed.map(result => result.severity)),
  };
}

function parserError(common: ParsedCommon, message: string): DataQualityParsedResult {
  return {
    ...common,
    status: DataQualityCheckStatus.ERROR,
    violationCount: 0,
    description: message,
    examples: [],
    error: { code: 'INVALID_DATA_QUALITY_RESULT', message, details: null },
  };
}

function parseExamples(
  execution: DataQualityQueryExecution | null,
  resultShape: Extract<DataQualityCompiledCheck, { kind: 'EXECUTABLE' }>['resultShape'],
  limit: number
): DataQualityResultExample[] {
  if (limit <= 0 || resultShape.exampleColumns.length === 0) return [];
  const examples: DataQualityResultExample[] = [];
  const seen = new Set<string>();
  for (const row of execution?.rows ?? []) {
    if (!readBoolean(readValue(row, resultShape.exampleMarkerColumn))) continue;
    const values = safeSerializeRow(
      Object.fromEntries(
        resultShape.exampleColumns.map(column => [
          column,
          unwrapProviderScalar(readValue(row, column)),
        ])
      )
    );
    const key = stableExampleKey(values);
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push({ values });
    if (examples.length >= limit) break;
  }
  return examples;
}

function stableExampleKey(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortObjectKeys(value[key])])
  );
}

function unwrapProviderScalar(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'value') return value;
  const scalar = value.value;
  return isRecord(scalar) || Array.isArray(scalar) ? value : scalar;
}

function safeSerializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const context: SerializationContext = { stack: new WeakSet<object>(), nodes: 0 };
  const serialized = safeSerializeValue(row, context, 0);
  const record = isRecord(serialized) ? serialized : { value: serialized };
  return boundSerializedRow(record);
}

interface SerializationContext {
  stack: WeakSet<object>;
  nodes: number;
}

function safeSerializeValue(value: unknown, context: SerializationContext, depth: number): unknown {
  context.nodes += 1;
  if (context.nodes > DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxNodes) {
    return `[Truncated: max nodes ${DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxNodes}]`;
  }
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return truncateUtf8(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return String(value);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '[Invalid Date]' : value.toISOString();
  }
  if (value instanceof Uint8Array) return serializeBinary(value);
  if (typeof value !== 'object') return String(value);
  if (value.constructor?.name === 'Big' && typeof value.toString === 'function') {
    try {
      return value.toString();
    } catch {
      return '[Unserializable decimal]';
    }
  }
  if (context.stack.has(value)) return '[Circular]';
  if (depth >= DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxDepth) {
    return `[Truncated: max depth ${DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxDepth}]`;
  }

  context.stack.add(value);
  try {
    if (Array.isArray(value)) {
      const limited = value
        .slice(0, DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxCollectionItems)
        .map(item => safeSerializeValue(item, context, depth + 1));
      const omitted = value.length - limited.length;
      if (omitted > 0) limited.push(`[Truncated ${omitted} items]`);
      return limited;
    }

    const keys = Object.keys(value).sort();
    const limitedKeys = keys.slice(0, DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxCollectionItems);
    const entries = limitedKeys.map(key => {
      try {
        return [
          key,
          safeSerializeValue((value as Record<string, unknown>)[key], context, depth + 1),
        ] as const;
      } catch {
        return [key, '[Unserializable property]'] as const;
      }
    });
    const omitted = keys.length - limitedKeys.length;
    if (omitted > 0) {
      entries.push([uniqueMarkerKey(keys), `[Truncated ${omitted} properties]`]);
    }
    return Object.fromEntries(entries);
  } catch {
    return '[Unserializable object]';
  } finally {
    context.stack.delete(value);
  }
}

function truncateUtf8(value: string): string {
  const totalBytes = Buffer.byteLength(value, 'utf8');
  const limit = DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxStringBytes;
  if (totalBytes <= limit) return value;

  const reservedMarkerBytes = Buffer.byteLength(`[Truncated ${totalBytes} bytes]`, 'utf8');
  const payloadLimit = Math.max(0, limit - reservedMarkerBytes);
  let prefix = '';
  let usedBytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (usedBytes + characterBytes > payloadLimit) break;
    prefix += character;
    usedBytes += characterBytes;
  }
  return `${prefix}[Truncated ${totalBytes - usedBytes} bytes]`;
}

function serializeBinary(value: Uint8Array): string {
  const limit = DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxBinaryBytes;
  const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  const encoded = bytes.subarray(0, limit).toString('base64');
  const omitted = bytes.length - Math.min(bytes.length, limit);
  return `[Binary base64:${encoded}${omitted > 0 ? `; Truncated ${omitted} bytes` : ''}]`;
}

function boundSerializedRow(row: Record<string, unknown>): Record<string, unknown> {
  if (serializedBytes(row) <= DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxTotalBytes) {
    return row;
  }

  const entries = Object.entries(row);
  const markerKey = uniqueMarkerKey(Object.keys(row));
  const marker = `[Truncated: row exceeded ${DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxTotalBytes} bytes]`;
  const retained: Array<[string, unknown]> = [];
  for (const entry of entries) {
    const candidate = Object.fromEntries([...retained, entry, [markerKey, marker]]);
    if (serializedBytes(candidate) > DATA_QUALITY_EXAMPLE_SERIALIZATION_LIMITS.maxTotalBytes) {
      break;
    }
    retained.push(entry);
  }
  return Object.fromEntries([...retained, [markerKey, marker]]);
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function uniqueMarkerKey(keys: readonly string[]): string {
  const occupied = new Set(keys);
  let marker = '__truncated__';
  while (occupied.has(marker)) marker = `_${marker}`;
  return marker;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readValue(row: Record<string, unknown>, key: string): unknown {
  const matchingKey = Object.keys(row).find(
    candidate => candidate.toLowerCase() === key.toLowerCase()
  );
  return matchingKey === undefined ? undefined : row[matchingKey];
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'bigint') return value !== 0n;
  if (typeof value === 'string') {
    return !['', '0', 'false', 'no'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function readNonNegativeInteger(value: unknown): number | null {
  if (typeof value === 'bigint') {
    return value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
  }
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function highestSeverity(severities: readonly DataQualitySeverity[]): DataQualitySeverity | null {
  if (severities.includes(DataQualitySeverity.ERROR)) return DataQualitySeverity.ERROR;
  if (severities.includes(DataQualitySeverity.WARNING)) return DataQualitySeverity.WARNING;
  if (severities.includes(DataQualitySeverity.NOTICE)) return DataQualitySeverity.NOTICE;
  return null;
}
