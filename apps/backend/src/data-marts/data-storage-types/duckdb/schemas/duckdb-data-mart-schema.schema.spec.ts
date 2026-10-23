import { DuckDbDataMartSchemaSchema, parseDuckDbFieldType } from './duckdb-data-mart-schema.schema';
import { isDuckDbDataMartSchema } from '../../data-mart-schema.guards';
import { DuckdbFieldType } from '../enums/duckdb-field-type.enum';
import { DataMartSchemaFieldStatus } from '../../enums/data-mart-schema-field-status.enum';

describe('DuckDb data-mart schema', () => {
  const schema = {
    type: 'duckdb-data-mart-schema',
    fields: [
      { name: 'id', type: DuckdbFieldType.BIGINT, status: DataMartSchemaFieldStatus.CONNECTED },
    ],
  };
  it('parses a valid duckdb schema + guard passes', () => {
    expect(DuckDbDataMartSchemaSchema.safeParse(schema).success).toBe(true);
    expect(isDuckDbDataMartSchema(schema)).toBe(true);
    expect(isDuckDbDataMartSchema({ type: 'athena-data-mart-schema', fields: [] })).toBe(false);
  });
  it('parseDuckDbFieldType maps DuckDB type strings, defaults to VARCHAR', () => {
    expect(parseDuckDbFieldType('BIGINT')).toBe(DuckdbFieldType.BIGINT);
    expect(parseDuckDbFieldType('DOUBLE')).toBe(DuckdbFieldType.DOUBLE);
    expect(parseDuckDbFieldType('TIMESTAMP')).toBe(DuckdbFieldType.TIMESTAMP);
    expect(parseDuckDbFieldType('DECIMAL(18,3)')).toBe(DuckdbFieldType.DOUBLE); // numeric family
    expect(parseDuckDbFieldType('HUGEINT')).toBe(DuckdbFieldType.BIGINT);
    expect(parseDuckDbFieldType('SOMETHING_WEIRD')).toBe(DuckdbFieldType.VARCHAR);
    expect(parseDuckDbFieldType('INTERVAL')).toBe(DuckdbFieldType.VARCHAR);
    expect(parseDuckDbFieldType('INTEGER')).toBe(DuckdbFieldType.BIGINT);
  });
  it.each([
    'INTEGER[]',
    'BIGINT[3]',
    'TIMESTAMP[]',
    'DECIMAL(18,3)[]',
    'STRUCT(a INTEGER)[]',
    'LIST(INTEGER)',
    'STRUCT(x INTEGER, y DOUBLE)',
    'MAP(VARCHAR, INTEGER)',
    'UNION(n INTEGER, s VARCHAR)',
    'ARRAY',
  ])('maps the composite type %s to VARCHAR', raw => {
    expect(parseDuckDbFieldType(raw)).toBe(DuckdbFieldType.VARCHAR);
  });
  it('keeps TIMESTAMPTZ apart from the naive TIMESTAMP family', () => {
    expect(parseDuckDbFieldType('TIMESTAMPTZ')).toBe(DuckdbFieldType.TIMESTAMPTZ);
    expect(parseDuckDbFieldType('TIMESTAMP WITH TIME ZONE')).toBe(DuckdbFieldType.TIMESTAMPTZ);
    expect(parseDuckDbFieldType('timestamp with time zone')).toBe(DuckdbFieldType.TIMESTAMPTZ);
    expect(parseDuckDbFieldType('TIMESTAMP_NS')).toBe(DuckdbFieldType.TIMESTAMP);
    expect(parseDuckDbFieldType('DATETIME')).toBe(DuckdbFieldType.TIMESTAMP);
  });
});
