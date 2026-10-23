import { z } from 'zod';
import { createBaseFieldSchemaForType } from '../../data-mart-schema.utils';
import { DuckdbFieldType } from '../enums/duckdb-field-type.enum';

export const DuckDbDataMartSchemaType = 'duckdb-data-mart-schema';
export const DuckDbDataMartSchemaSchema = z.object({
  type: z.literal(DuckDbDataMartSchemaType),
  fields: z.array(
    createBaseFieldSchemaForType(
      z.nativeEnum(DuckdbFieldType).describe('Valid DuckDB field type required')
    )
  ),
});
export type DuckDbDataMartSchema = z.infer<typeof DuckDbDataMartSchemaSchema>;

// Map a raw DuckDB `information_schema.data_type` string → DuckdbFieldType (default VARCHAR).
export function parseDuckDbFieldType(raw: string): DuckdbFieldType {
  const t = (raw || '').toUpperCase().trim();
  // Composite values reach reports as text, whatever their element type.
  if (/\]$|^(LIST|STRUCT|MAP|UNION|ARRAY)\b/.test(t)) return DuckdbFieldType.VARCHAR;
  if (
    /^(BIGINT|INT8|LONG|HUGEINT|INTEGER|INT4|INT(?!ERVAL)|SMALLINT|INT2|TINYINT|INT1|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/.test(
      t
    )
  )
    return DuckdbFieldType.BIGINT;
  if (/^(DOUBLE|FLOAT8|REAL|FLOAT4|FLOAT|DECIMAL|NUMERIC)/.test(t)) return DuckdbFieldType.DOUBLE;
  if (/^BOOL/.test(t)) return DuckdbFieldType.BOOLEAN;
  if (/^(TIMESTAMPTZ|TIMESTAMP WITH TIME ZONE)$/.test(t)) return DuckdbFieldType.TIMESTAMPTZ;
  if (/^TIMESTAMP/.test(t) || /^DATETIME/.test(t)) return DuckdbFieldType.TIMESTAMP;
  if (/^DATE$/.test(t)) return DuckdbFieldType.DATE;
  if (/^TIME/.test(t)) return DuckdbFieldType.TIME;
  return DuckdbFieldType.VARCHAR;
}
